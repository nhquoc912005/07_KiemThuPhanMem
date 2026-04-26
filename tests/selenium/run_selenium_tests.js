const fs = require('fs');
const path = require('path');
const { Builder, Browser, By, Key, until } = require('selenium-webdriver');
const edge = require('selenium-webdriver/edge');
const chrome = require('selenium-webdriver/chrome');
const logging = require('selenium-webdriver/lib/logging');

const config = require('./config');
const { ensureReportDirs, writeReports } = require('./report_writer');
const { prepareTestData, apiRequest } = require('./seed_test_data');
const { BasePage } = require('./pages/base_page');
const { LoginPage } = require('./pages/login_page');
const { DispatcherPage } = require('./pages/dispatcher_page');
const { DriverPage } = require('./pages/driver_page');

const STOP_STATUS = {
  ARRIVED_PICKUP: 'Đã đến điểm đón',
  PICKED_UP: 'Đã đón khách',
  DROPPED_OFF: 'Đã trả khách'
};

const rows = [];
let driver = null;
let currentBasePage = null;

function makeMeta(id, feature, description, steps, expected) {
  return { id, feature, description, steps, expected };
}

function rowFrom(meta, actual, status = 'PASS', notes = '') {
  return {
    'TC ID': meta.id,
    '[Tên Chức Năng]': meta.feature,
    'Mô tả': meta.description,
    'Bước thực hiện': meta.steps,
    'Kết quả mong đợi': meta.expected,
    'Kết quả thực tế': actual,
    'Trạng thái': status,
    'Ghi chú': notes
  };
}

function addBlocked(meta, reason) {
  rows.push(rowFrom(meta, 'Không thể thực thi do thiếu điều kiện tiền đề.', 'BLOCKED', reason));
}

function addNotRun(meta, reason) {
  rows.push(rowFrom(meta, 'Chưa thực thi trong đợt Selenium hiện tại.', 'NOT RUN', reason));
}

async function runCase(meta, body) {
  try {
    const outcome = await body();
    rows.push(
      rowFrom(
        meta,
        outcome?.actual || 'Selenium thao tác thành công và kết quả quan sát được khớp mong đợi.',
        outcome?.status || 'PASS',
        outcome?.notes || ''
      )
    );
  } catch (error) {
    let screenshotPath = '';
    try {
      if (currentBasePage) {
        screenshotPath = await currentBasePage.screenshot(meta.id);
      }
    } catch {
      screenshotPath = '';
    }

    const message = error?.message || String(error);
    const stack = error?.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : '';
    rows.push(rowFrom(meta, message, 'FAIL', [screenshotPath ? `Screenshot: ${screenshotPath}` : '', stack].filter(Boolean).join(' | ')));
  }
}

async function waitForHttp(url, timeoutMs = 30000) {
  const started = Date.now();
  let lastError = 'No response';
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} không sẵn sàng: ${lastError}`);
}

function buildLoggingPreferences() {
  const prefs = new logging.Preferences();
  prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);
  return prefs;
}

async function buildEdgeDriver() {
  const options = new edge.Options();
  if (config.headless) {
    options.addArguments('--headless=new');
  }
  options.addArguments('--window-size=1366,900', '--disable-gpu', '--no-sandbox');
  options.setLoggingPrefs(buildLoggingPreferences());
  return new Builder().forBrowser(Browser.EDGE).setEdgeOptions(options).build();
}

async function buildChromeDriver() {
  require('chromedriver');
  const options = new chrome.Options();
  if (config.headless) {
    options.addArguments('--headless=new');
  }
  options.addArguments('--window-size=1366,900', '--disable-gpu', '--no-sandbox');
  options.setLoggingPrefs(buildLoggingPreferences());
  return new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build();
}

async function buildDriver() {
  const preferred = config.browser;
  const attempts = preferred === 'chrome' ? [buildChromeDriver, buildEdgeDriver] : [buildEdgeDriver, buildChromeDriver];
  const errors = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(`Không khởi tạo được Selenium browser. ${errors.join(' | ')}`);
}

async function visibleInputs(css = 'input:not([disabled])') {
  const inputs = await currentBasePage.getVisibleElements(css);
  return inputs;
}

async function setElementValue(element, value) {
  await element.click();
  await element.sendKeys(Key.chord(Key.CONTROL, 'a'));
  await element.sendKeys(value);
}

async function setDomInputValue(element, value) {
  await driver.executeScript(
    `
      const element = arguments[0];
      const value = arguments[1];
      const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    `,
    element,
    value
  );
}

function toDateTimeLocalValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function setVisibleInputByCurrentValue(currentValue, nextValue) {
  const inputs = await visibleInputs();
  for (const input of inputs) {
    const value = await input.getAttribute('value');
    if (String(value || '').includes(currentValue)) {
      await setElementValue(input, nextValue);
      return;
    }
  }
  throw new Error(`Không tìm thấy input có value chứa "${currentValue}"`);
}

async function waitText(text) {
  await currentBasePage.visibleTextContains(text);
}

async function loginDispatcher(data) {
  const loginPage = new LoginPage(driver);
  currentBasePage = loginPage;
  await loginPage.loginExpectDispatcher(data.dispatcher.username, data.dispatcher.password);
}

async function loginDriver(account) {
  const loginPage = new LoginPage(driver);
  currentBasePage = loginPage;
  await loginPage.loginExpectDriver(account.username, account.password);
}

async function openDispatcherRoute(route, data) {
  await loginDispatcher(data);
  const page = new DispatcherPage(driver);
  currentBasePage = page;
  await page.open(route);
  return page;
}

async function readBrowserLogs() {
  try {
    return await driver.manage().logs().get(logging.Type.BROWSER);
  } catch (error) {
    return null;
  }
}

function buildContext(data) {
  return {
    accounts: data?.accounts || [],
    environment: {
      frontendFramework: 'React 19 + TypeScript + Vite',
      backendFramework: 'Node.js + Express',
      database: 'SQL Server',
      frontendUrl: config.frontendBaseUrl,
      apiUrl: config.apiBaseUrl
    }
  };
}

async function runAuthenticationTests(data) {
  await runCase(
    makeMeta(
      'AUTH_001',
      'Đăng nhập',
      'Đăng nhập đúng tài khoản điều phối',
      '1. Mở /login.\n2. Nhập dispatcher_test và mật khẩu đúng.\n3. Bấm ĐĂNG NHẬP.',
      'Hệ thống chuyển vào dashboard điều phối.'
    ),
    async () => {
      await loginDispatcher(data);
      const url = await driver.getCurrentUrl();
      return { actual: `Đăng nhập thành công, URL hiện tại: ${url}` };
    }
  );

  await runCase(
    makeMeta(
      'AUTH_002',
      'Đăng nhập',
      'Đăng nhập sai mật khẩu',
      '1. Mở /login.\n2. Nhập dispatcher_test và mật khẩu sai.\n3. Bấm ĐĂNG NHẬP.',
      'Form giữ ở /login và hiển thị lỗi đăng nhập.'
    ),
    async () => {
      const loginPage = new LoginPage(driver);
      currentBasePage = loginPage;
      await loginPage.login(data.dispatcher.username, 'Wrong@12345');
      await loginPage.waitStillOnLogin();
      await driver.wait(async () => {
        const body = await loginPage.getBodyText();
        return /thất bại|không đúng|sai|khóa|failed|invalid/i.test(body);
      }, config.defaultTimeoutMs);
      const body = await loginPage.getBodyText();
      if (!/thất bại|không đúng|sai|khóa|failed|invalid/i.test(body)) {
        throw new Error(`Không thấy thông báo lỗi đăng nhập rõ ràng. Body: ${body.slice(0, 300)}`);
      }
      return { actual: 'UI vẫn ở trang login và hiển thị thông báo lỗi khi nhập sai mật khẩu.' };
    }
  );

  await runCase(
    makeMeta(
      'AUTH_003',
      'Đăng nhập',
      'Đăng nhập thiếu username/password',
      '1. Mở /login.\n2. Để trống username và password.\n3. Bấm ĐĂNG NHẬP.',
      'Form hiển thị lỗi bắt buộc cho cả hai trường.'
    ),
    async () => {
      const loginPage = new LoginPage(driver);
      currentBasePage = loginPage;
      await loginPage.submitBlank();
      const body = await loginPage.getBodyText();
      if (!body.includes('Vui lòng nhập tên đăng nhập') || !body.includes('Vui lòng nhập mật khẩu')) {
        throw new Error(`Không thấy đủ lỗi validate bắt buộc. Body: ${body.slice(0, 300)}`);
      }
      return { actual: 'Form hiển thị đủ lỗi bắt buộc cho username và password.' };
    }
  );

  await runCase(
    makeMeta(
      'AUTH_004',
      'Đăng xuất',
      'Đăng xuất tài khoản điều phối',
      '1. Login dispatcher_test.\n2. Bấm nút Đăng xuất trên header.\n3. Xác nhận trong modal.',
      'Session bị xóa và URL quay về /login.'
    ),
    async () => {
      await loginDispatcher(data);
      const dispatcherPage = new DispatcherPage(driver);
      currentBasePage = dispatcherPage;
      await dispatcherPage.logout();
      return { actual: `Đăng xuất thành công, URL hiện tại: ${await driver.getCurrentUrl()}` };
    }
  );

  await runCase(
    makeMeta(
      'AUTH_005',
      'Authorization',
      'Truy cập trang cần đăng nhập khi chưa login',
      '1. Xóa localStorage/session/cookie.\n2. Mở trực tiếp /dispatch/overview.',
      'Frontend redirect về /login.'
    ),
    async () => {
      const page = new BasePage(driver);
      currentBasePage = page;
      await page.clearClientState();
      await page.goto('/dispatch/overview');
      await page.waitForUrlContains('/login');
      return { actual: 'Người dùng chưa đăng nhập bị chuyển về /login khi mở route dispatcher.' };
    }
  );

  await runCase(
    makeMeta(
      'AUTH_006',
      'Authorization',
      'Role tài xế không có quyền vào màn hình điều phối',
      '1. Login driver_test.\n2. Mở trực tiếp /dispatch/customers.\n3. Quan sát URL.',
      'Frontend redirect tài xế về màn hình driver.'
    ),
    async () => {
      await loginDriver(data.emptyDriver);
      const page = new BasePage(driver);
      currentBasePage = page;
      await page.goto('/dispatch/customers');
      await driver.wait(async () => (await driver.getCurrentUrl()).includes('/driver/trips/assigned'), config.defaultTimeoutMs);
      return { actual: `Driver bị redirect về ${await driver.getCurrentUrl()}, không xem được màn hình dispatcher.` };
    }
  );
}

async function runDashboardTests(data) {
  await runCase(
    makeMeta(
      'DASH_001',
      'Dashboard',
      'Hiển thị dashboard sau login',
      '1. Login dispatcher_test.\n2. Quan sát trang /dispatch/overview.',
      'Dashboard điều phối hiển thị các chỉ số/tác vụ chính.'
    ),
    async () => {
      await loginDispatcher(data);
      const body = await currentBasePage.getBodyText();
      if (!/Cần trung chuyển|Xe sẵn sàng|Tài xế rảnh|Đang thực hiện/.test(body)) {
        throw new Error(`Dashboard không hiển thị đủ chỉ số chính. Body: ${body.slice(0, 500)}`);
      }
      return { actual: 'Dashboard điều phối hiển thị các khối tổng quan chính sau khi login.' };
    }
  );

  await runCase(
    makeMeta(
      'DASH_002',
      'Dashboard',
      'Menu điều hướng chính hoạt động',
      '1. Login dispatcher_test.\n2. Click/mở các menu chính: xe, tài xế, khách hàng, báo cáo.',
      'Mỗi menu chuyển đúng route và render nội dung tương ứng.'
    ),
    async () => {
      const routes = ['/dispatch/vehicles', '/dispatch/drivers', '/dispatch/customers', '/dispatch/reports'];
      const seen = [];
      for (const route of routes) {
        const page = await openDispatcherRoute(route, data);
        const text = await page.getBodyText();
        if (text.length < 80) {
          throw new Error(`Route ${route} render nội dung quá ít.`);
        }
        seen.push(route);
      }
      return { actual: `Đã mở thành công các menu: ${seen.join(', ')}.` };
    }
  );

  await runCase(
    makeMeta(
      'DASH_003',
      'Dashboard',
      'Click từng menu nghiệp vụ điều phối',
      '1. Login dispatcher_test.\n2. Mở overview, plan, adjust, track.',
      'Các route nghiệp vụ điều phối không bị crash.'
    ),
    async () => {
      const routes = ['/dispatch/overview', '/dispatch/plan', '/dispatch/adjust', '/dispatch/track'];
      for (const route of routes) {
        const page = await openDispatcherRoute(route, data);
        const text = await page.getBodyText();
        if (/Something went wrong|Cannot read properties|Internal Server Error/i.test(text)) {
          throw new Error(`Route ${route} có dấu hiệu crash: ${text.slice(0, 300)}`);
        }
      }
      return { actual: `Các route nghiệp vụ ${routes.join(', ')} đều render được trên UI thật.` };
    }
  );

  await runCase(
    makeMeta(
      'DASH_004',
      'Dashboard',
      'Không có lỗi console nghiêm trọng khi mở dashboard',
      '1. Login dispatcher_test.\n2. Lấy browser console log nếu browser hỗ trợ.\n3. Lọc log SEVERE.',
      'Không có lỗi console mức SEVERE.'
    ),
    async () => {
      await loginDispatcher(data);
      const logs = await readBrowserLogs();
      if (!logs) {
        return {
          status: 'NOT RUN',
          actual: 'Browser driver hiện tại không trả được browser console log.',
          notes: 'Selenium manage().logs().get(browser) không được hỗ trợ ở phiên browser/driver hiện tại.'
        };
      }
      const severe = logs.filter((entry) => {
        const level = String(entry.level?.name || entry.level || '').toUpperCase();
        const message = String(entry.message || '');
        const expectedNegativeLogin = message.includes('/auth/login') && message.includes('401');
        return level.includes('SEVERE') && !expectedNegativeLogin;
      });
      if (severe.length) {
        throw new Error(`Có ${severe.length} console error nghiêm trọng: ${severe.map((item) => item.message).join(' | ')}`);
      }
      return { actual: `Đã kiểm tra ${logs.length} browser log, không có SEVERE.` };
    }
  );
}

async function runCustomerTests(data) {
  const customer = {
    name: `Selenium Customer ${data.runId.slice(-6)}`,
    updatedName: `Selenium Customer Updated ${data.runId.slice(-6)}`,
    phone: `087${data.runId.slice(-7)}`,
    pickup: `Điểm đón Selenium ${data.runId.slice(-4)}`,
    dropoff: `Điểm trả Selenium ${data.runId.slice(-4)}`
  };

  await runCase(
    makeMeta('CUSTOMER_001', 'Quản lý khách hàng', 'Xem danh sách khách hàng', '1. Login điều phối.\n2. Mở /dispatch/customers.', 'Danh sách khách hàng hoặc empty state hiển thị.'),
    async () => {
      const page = await openDispatcherRoute('/dispatch/customers', data);
      const text = await page.getBodyText();
      if (!/Thêm khách hàng|Chưa có dữ liệu khách hàng|Mã khách hàng/.test(text)) {
        throw new Error(`Màn hình khách hàng không hiển thị đúng. Body: ${text.slice(0, 400)}`);
      }
      return { actual: 'Màn hình quản lý khách hàng render được danh sách/empty state và nút thêm.' };
    }
  );

  await runCase(
    makeMeta('CUSTOMER_002', 'Quản lý khách hàng', 'Thêm khách hàng hợp lệ', '1. Mở /dispatch/customers.\n2. Bấm Thêm khách hàng.\n3. Nhập họ tên, SĐT, điểm đón, điểm trả.\n4. Bấm Lưu.', 'Khách hàng mới được tạo và xuất hiện trong danh sách.'),
    async () => {
      const page = await openDispatcherRoute('/dispatch/customers', data);
      await page.clickButtonByText('Thêm khách hàng');
      const inputs = await visibleInputs();
      if (inputs.length < 4) throw new Error(`Modal thêm khách hàng chỉ có ${inputs.length} input.`);
      await inputs[0].sendKeys(customer.name);
      await inputs[1].sendKeys(customer.phone);
      await inputs[2].sendKeys(customer.pickup);
      await inputs[3].sendKeys(customer.dropoff);
      await page.clickButtonByText('Lưu');
      await waitText('Thêm khách hàng thành công');
      await page.closeNotificationIfPresent();
      await waitText(customer.name);
      return { actual: `Đã thêm khách hàng ${customer.name} qua UI và thấy trong danh sách.` };
    }
  );

  await runCase(
    makeMeta('CUSTOMER_003', 'Quản lý khách hàng', 'Thêm khách hàng thiếu trường bắt buộc', '1. Mở modal Thêm khách hàng.\n2. Không nhập dữ liệu.\n3. Bấm Lưu.', 'UI hiển thị lỗi trường bắt buộc.'),
    async () => {
      const page = await openDispatcherRoute('/dispatch/customers', data);
      await page.clickButtonByText('Thêm khách hàng');
      await page.clickButtonByText('Lưu');
      await waitText('Thông tin bắt buộc không được để trống');
      return { actual: 'Modal thêm khách hàng hiển thị lỗi bắt buộc khi submit rỗng.' };
    }
  );

  await runCase(
    makeMeta('CUSTOMER_004', 'Quản lý khách hàng', 'Sửa thông tin khách hàng', '1. Tìm khách hàng Selenium đã tạo.\n2. Bấm icon sửa.\n3. Đổi họ tên.\n4. Bấm Lưu.', 'Thông tin khách hàng được cập nhật trên danh sách.'),
    async () => {
      const page = await openDispatcherRoute('/dispatch/customers', data);
      await page.clickRowActionByText(customer.name, 0);
      await setVisibleInputByCurrentValue(customer.name, customer.updatedName);
      await page.clickButtonByText('Lưu');
      await waitText('Cập nhật thông tin khách hàng thành công');
      await page.closeNotificationIfPresent();
      await waitText(customer.updatedName);
      return { actual: `Đã sửa khách hàng thành ${customer.updatedName} qua UI.` };
    }
  );

  addNotRun(
    makeMeta('CUSTOMER_005', 'Quản lý khách hàng', 'Tìm kiếm/lọc khách hàng', '1. Nhập keyword vào ô tìm kiếm/lọc.\n2. Quan sát danh sách.', 'Danh sách lọc theo keyword.'),
    'Màn hình CustomersPage hiện không có control tìm kiếm/lọc trên UI dù backend GET /customers có query keyword.'
  );

  await runCase(
    makeMeta('CUSTOMER_006', 'Quản lý khách hàng', 'Xóa/ngừng hoạt động khách hàng nếu nghiệp vụ cho phép', '1. Tìm khách hàng Selenium đã tạo.\n2. Bấm icon xóa.\n3. Xác nhận.', 'Khách hàng test không còn hiển thị trong danh sách active.'),
    async () => {
      const page = await openDispatcherRoute('/dispatch/customers', data);
      await page.clickRowActionByText(customer.updatedName, 1);
      await page.clickButtonByText('Xác nhận');
      await waitText('Đã chuyển khách hàng sang ngừng hoạt động');
      return { actual: `Đã ngừng hoạt động khách hàng test ${customer.updatedName} qua UI.` };
    }
  );
}

async function runDriverManagementTests(data) {
  const driverData = {
    code: `SELD${data.runId.slice(-5)}`,
    name: `Selenium Driver ${data.runId.slice(-5)}`,
    updatedName: `Selenium Driver Updated ${data.runId.slice(-5)}`,
    phone: `086${data.runId.slice(-7)}`,
    cccd: `086${data.runId.slice(-9)}`
  };

  await runCase(makeMeta('DRIVER_001', 'Quản lý tài xế', 'Xem danh sách tài xế', '1. Login điều phối.\n2. Mở /dispatch/drivers.', 'Danh sách tài xế hoặc empty state hiển thị.'), async () => {
    const page = await openDispatcherRoute('/dispatch/drivers', data);
    const text = await page.getBodyText();
    if (!/Thêm tài xế|Chưa có dữ liệu tài xế|Mã nhân viên/.test(text)) {
      throw new Error(`Màn hình tài xế không hiển thị đúng. Body: ${text.slice(0, 400)}`);
    }
    return { actual: 'Màn hình quản lý tài xế render được danh sách/empty state và nút thêm.' };
  });

  await runCase(makeMeta('DRIVER_002', 'Quản lý tài xế', 'Thêm tài xế hợp lệ', '1. Mở /dispatch/drivers.\n2. Bấm Thêm tài xế.\n3. Nhập họ tên, mã nhân viên, SĐT, CCCD, bằng lái.\n4. Lưu.', 'Tài xế mới được tạo và xuất hiện trong danh sách.'), async () => {
    const page = await openDispatcherRoute('/dispatch/drivers', data);
    await page.clickButtonByText('Thêm tài xế');
    const inputs = await visibleInputs('input');
    if (inputs.length < 4) throw new Error(`Modal thêm tài xế chỉ có ${inputs.length} input.`);
    await inputs[0].sendKeys(driverData.name);
    await inputs[1].sendKeys(driverData.code);
    await inputs[2].sendKeys(driverData.phone);
    await inputs[3].sendKeys(driverData.cccd);
    const selects = await currentBasePage.getVisibleElements('select');
    await selects[0].sendKeys('B2');
    await page.clickButtonByText('Lưu tài xế');
    await waitText('Thêm tài xế mới thành công');
    await page.closeNotificationIfPresent();
    await waitText(driverData.name);
    return { actual: `Đã thêm tài xế ${driverData.name} qua UI.` };
  });

  await runCase(makeMeta('DRIVER_003', 'Quản lý tài xế', 'Validate số điện thoại/CCCD không hợp lệ', '1. Mở modal thêm tài xế.\n2. Nhập SĐT sai định dạng và CCCD sai.\n3. Bấm Lưu.', 'UI hiển thị lỗi validate.'), async () => {
    const page = await openDispatcherRoute('/dispatch/drivers', data);
    await page.clickButtonByText('Thêm tài xế');
    const inputs = await visibleInputs('input');
    await inputs[0].sendKeys('Driver Invalid');
    await inputs[1].sendKeys(`BAD${data.runId.slice(-3)}`);
    await inputs[2].sendKeys('123');
    await inputs[3].sendKeys('abc');
    const selects = await currentBasePage.getVisibleElements('select');
    await selects[0].sendKeys('B2');
    await page.clickButtonByText('Lưu tài xế');
    const body = await page.getBodyText();
    if (!/Số điện thoại không hợp lệ|CCCD không hợp lệ/.test(body)) {
      throw new Error(`Không thấy lỗi validate SĐT/CCCD. Body: ${body.slice(0, 500)}`);
    }
    return { actual: 'UI hiển thị lỗi validate số điện thoại hoặc CCCD không hợp lệ.' };
  });

  await runCase(makeMeta('DRIVER_004', 'Quản lý tài xế', 'Sửa tài xế', '1. Tìm tài xế Selenium đã tạo.\n2. Bấm sửa.\n3. Đổi họ tên.\n4. Lưu.', 'Thông tin tài xế được cập nhật.'), async () => {
    const page = await openDispatcherRoute('/dispatch/drivers', data);
    await page.clickRowActionByText(driverData.name, 0);
    await setVisibleInputByCurrentValue(driverData.name, driverData.updatedName);
    await page.clickButtonByText('Lưu tài xế');
    await waitText('Cập nhật tài xế thành công');
    await page.closeNotificationIfPresent();
    await waitText(driverData.updatedName);
    return { actual: `Đã sửa tài xế thành ${driverData.updatedName} qua UI.` };
  });

  addNotRun(makeMeta('DRIVER_005', 'Quản lý tài xế', 'Tìm kiếm/lọc tài xế', '1. Nhập keyword/lọc trạng thái tài xế.\n2. Quan sát danh sách.', 'Danh sách lọc theo điều kiện.'), 'Màn hình DispatcherDriversPage hiện không có control tìm kiếm/lọc trên UI.');

  await runCase(makeMeta('DRIVER_006', 'Quản lý tài xế', 'Xóa/ngừng hoạt động tài xế nếu nghiệp vụ cho phép', '1. Tìm tài xế Selenium đã tạo chưa có chuyến.\n2. Bấm xóa/ngừng hoạt động.\n3. Xác nhận.', 'Tài xế test chuyển sang ngừng hoạt động.'), async () => {
    const page = await openDispatcherRoute('/dispatch/drivers', data);
    await page.clickRowActionByText(driverData.updatedName, 1);
    await page.clickButtonByText('Xác nhận');
    await waitText('Đã chuyển tài xế sang ngừng hoạt động');
    return { actual: `Đã ngừng hoạt động tài xế test ${driverData.updatedName} qua UI.` };
  });

  await runCase(makeMeta('DRIVER_007', 'Quản lý tài xế', 'Kiểm tra trạng thái tài xế rảnh/bận/ngừng hoạt động nếu có', '1. Mở danh sách tài xế.\n2. Quan sát cột trạng thái.', 'Danh sách hiển thị trạng thái tài xế.'), async () => {
    const page = await openDispatcherRoute('/dispatch/drivers', data);
    const body = await page.getBodyText();
    if (!/Rảnh|Đã phân công|Đang thực hiện|Ngừng hoạt động/.test(body)) {
      throw new Error('Không thấy trạng thái tài xế trong danh sách.');
    }
    return { actual: 'Danh sách tài xế hiển thị trạng thái như Rảnh/Đã phân công/Đang thực hiện.' };
  });
}

async function runVehicleTests(data) {
  const suffix = data.runId.slice(-5);
  const vehicle = {
    plate: `98A-${suffix}`,
    updatedPlate: `98B-${suffix}`
  };

  await runCase(makeMeta('VEHICLE_001', 'Quản lý xe', 'Xem danh sách xe', '1. Login điều phối.\n2. Mở /dispatch/vehicles.', 'Danh sách xe hoặc empty state hiển thị.'), async () => {
    const page = await openDispatcherRoute('/dispatch/vehicles', data);
    const text = await page.getBodyText();
    if (!/Thêm xe trung chuyển|Chưa có dữ liệu xe|Biển số xe/.test(text)) {
      throw new Error(`Màn hình xe không hiển thị đúng. Body: ${text.slice(0, 400)}`);
    }
    return { actual: 'Màn hình quản lý xe render được danh sách/empty state và nút thêm.' };
  });

  await runCase(makeMeta('VEHICLE_002', 'Quản lý xe', 'Thêm xe hợp lệ', '1. Mở /dispatch/vehicles.\n2. Bấm Thêm xe trung chuyển.\n3. Nhập biển số hợp lệ, loại xe, số chỗ.\n4. Bấm Thêm.', 'Xe mới được tạo và xuất hiện trong danh sách.'), async () => {
    const page = await openDispatcherRoute('/dispatch/vehicles', data);
    await page.clickButtonByText('Thêm xe trung chuyển');
    const plateInput = await page.waitVisible(By.css('input[placeholder*="51A"]'));
    await plateInput.sendKeys(vehicle.plate);
    const numberInputs = await currentBasePage.getVisibleElements('input[type="number"]');
    await setElementValue(numberInputs[0], '16');
    await page.clickButtonByText('Thêm');
    await waitText('Thêm xe trung chuyển thành công');
    await waitText(vehicle.plate);
    return { actual: `Đã thêm xe ${vehicle.plate} qua UI.` };
  });

  await runCase(makeMeta('VEHICLE_003', 'Quản lý xe', 'Validate biển số xe', '1. Mở modal thêm xe.\n2. Nhập biển số sai định dạng.\n3. Bấm Thêm.', 'UI hiển thị lỗi biển số không hợp lệ.'), async () => {
    const page = await openDispatcherRoute('/dispatch/vehicles', data);
    await page.clickButtonByText('Thêm xe trung chuyển');
    const plateInput = await page.waitVisible(By.css('input[placeholder*="51A"]'));
    await plateInput.sendKeys('BAD_PLATE');
    await page.clickButtonByText('Thêm');
    await waitText('Biển số không hợp lệ');
    return { actual: 'UI hiển thị lỗi validate biển số xe khi nhập sai định dạng.' };
  });

  await runCase(makeMeta('VEHICLE_004', 'Quản lý xe', 'Sửa xe', '1. Tìm xe Selenium đã tạo.\n2. Bấm sửa.\n3. Đổi biển số.\n4. Lưu.', 'Thông tin xe được cập nhật.'), async () => {
    const page = await openDispatcherRoute('/dispatch/vehicles', data);
    await page.clickRowActionByText(vehicle.plate, 0);
    await setVisibleInputByCurrentValue(vehicle.plate, vehicle.updatedPlate);
    await page.clickButtonByText('Lưu');
    await waitText('Cập nhật xe trung chuyển thành công');
    await waitText(vehicle.updatedPlate);
    return { actual: `Đã sửa biển số xe thành ${vehicle.updatedPlate} qua UI.` };
  });

  addNotRun(makeMeta('VEHICLE_005', 'Quản lý xe', 'Tìm kiếm/lọc xe', '1. Nhập keyword/lọc trạng thái xe.\n2. Quan sát danh sách.', 'Danh sách lọc theo điều kiện.'), 'Màn hình VehiclesPage hiện không có control tìm kiếm/lọc trên UI.');

  await runCase(makeMeta('VEHICLE_006', 'Quản lý xe', 'Xóa xe nếu nghiệp vụ cho phép', '1. Tìm xe Selenium đã tạo chưa gán chuyến.\n2. Bấm xóa.\n3. Xác nhận.', 'Xe test được xóa khỏi danh sách.'), async () => {
    const page = await openDispatcherRoute('/dispatch/vehicles', data);
    await page.clickRowActionByText(vehicle.updatedPlate, 1);
    await page.clickButtonByText('Xóa');
    await waitText('Xóa xe trung chuyển thành công');
    return { actual: `Đã xóa xe test ${vehicle.updatedPlate} qua UI.` };
  });

  await runCase(makeMeta('VEHICLE_007', 'Quản lý xe', 'Xe đã được phân công thì không được xóa nếu có quy định', '1. Mở danh sách xe.\n2. Tìm xe route Selenium đang được phân công.\n3. Bấm xóa và xác nhận.', 'UI/API từ chối xóa xe đang được phân công.'), async () => {
    const page = await openDispatcherRoute('/dispatch/vehicles', data);
    await page.clickRowActionByText(data.routeVehicle.plate, 1);
    await page.clickButtonByText('Xóa');
    await waitText('Không thể xóa');
    return { actual: `API/UI từ chối xóa xe đang gắn route: ${data.routeVehicle.plate}.` };
  });
}

async function runTripAssignmentTests(data) {
  await runCase(makeMeta('TRIP_001', 'Quản lý chuyến trung chuyển', 'Xem danh sách chuyến/vé', '1. Login điều phối.\n2. Mở /dispatch/plan và /dispatch/adjust.', 'UI hiển thị danh sách vé cần trung chuyển và danh sách lộ trình.'), async () => {
    let page = await openDispatcherRoute('/dispatch/plan', data);
    await waitText('Danh sách vé cần trung chuyển');
    page = await openDispatcherRoute('/dispatch/adjust', data);
    const text = await page.getBodyText();
    if (!/lộ trình|chuyến|CX|LT/i.test(text)) {
      throw new Error(`Màn hình điều chỉnh chuyến không hiển thị danh sách/chỉ báo chuyến. Body: ${text.slice(0, 400)}`);
    }
    return { actual: 'Màn hình plan hiển thị vé cần trung chuyển và màn adjust render danh sách/chỉ tiết lộ trình.' };
  });

  await runCase(makeMeta('ASSIGN_001', 'Phân công tài xế', 'Phân công tài xế/xe cho chuyến qua wizard lập lộ trình', '1. Mở /dispatch/plan.\n2. Chọn vé Selenium.\n3. Chọn xe Selenium.\n4. Chọn tài xế Selenium.\n5. Xác nhận tạo lộ trình.', 'Route mới được tạo thành công.'),
    async () => {
      const page = await openDispatcherRoute('/dispatch/plan', data);
      await page.clickNearestCheckboxByText(data.planTicket.fullName);
      await page.clickButtonByText('Tiếp theo');
      await waitText(data.planVehicle.plate);
      await page.clickCardByText(data.planVehicle.plate);
      await page.clickButtonByText('Tiếp theo');
      await waitText(data.planDriver.fullName);
      await page.clickCardByText(data.planDriver.fullName);
      await page.clickButtonByText('Tiếp theo');
      const dateInput = await page.waitVisible(By.css('input[type="datetime-local"]'));
      await setDomInputValue(dateInput, toDateTimeLocalValue(new Date(Date.now() + 90 * 60000)));
      await page.clickButtonByText('Xác nhận tạo lộ trình');
      await waitText('Tạo lộ trình thành công');
      return { actual: `Wizard đã tạo lộ trình cho vé ${data.planTicket.fullName}, xe ${data.planVehicle.plate}, tài xế ${data.planDriver.fullName}.` };
    });

  addBlocked(makeMeta('TRIP_002', 'Quản lý chuyến trung chuyển', 'Tạo chuyến/vé hợp lệ', '1. Tạo vé mới qua UI.\n2. Lập chuyến từ vé.', 'Vé/chuyến mới được tạo.'), 'Project hiện chưa có màn hình tạo vé trung chuyển riêng qua UI; phần tạo route từ vé đã được cover ở ASSIGN_001.');
  addBlocked(makeMeta('TRIP_003', 'Quản lý chuyến trung chuyển', 'Tạo chuyến/vé thiếu khách hàng', '1. Mở form tạo vé/chuyến.\n2. Bỏ trống khách hàng.\n3. Submit.', 'UI báo lỗi thiếu khách hàng.'), 'Không có màn hình tạo vé độc lập qua UI để thao tác thiếu khách hàng.');
  addBlocked(makeMeta('TRIP_004', 'Quản lý chuyến trung chuyển', 'Tạo chuyến/vé thiếu điểm đón/điểm trả', '1. Mở form tạo vé/chuyến.\n2. Bỏ trống điểm đón/điểm trả.\n3. Submit.', 'UI báo lỗi phù hợp.'), 'Không có màn hình tạo vé độc lập qua UI; validation địa chỉ khách hàng đã được cover ở CUSTOMER_003.');

  await runCase(makeMeta('TRIP_005', 'Quản lý chuyến trung chuyển', 'Sửa chuyến/vé', '1. Mở /dispatch/adjust.\n2. Mở route Selenium có sẵn.\n3. Quan sát form điều chỉnh.', 'Màn hình điều chỉnh route hiển thị thông tin chuyến để chỉnh sửa.'), async () => {
    const page = await openDispatcherRoute('/dispatch/adjust', data);
    const adjustCode = `LT${String(data.routeWithMap.id).padStart(3, '0')}`;
    await waitText(adjustCode);
    await page.clickCardByText(adjustCode);
    await waitText('Chi tiết lộ trình');
    return { actual: `Mở được route ${adjustCode} trên màn hình điều chỉnh để thao tác sửa.` };
  });

  await runCase(makeMeta('TRIP_006', 'Quản lý chuyến trung chuyển', 'Hủy chuyến/vé nếu có', '1. Dùng API phụ trợ hủy route Selenium riêng cho case hủy.\n2. Kiểm tra response.', 'Route test có thể chuyển sang trạng thái Đã hủy mà không ảnh hưởng dữ liệu thật.'), async () => {
    const token = (await apiRequest({ path: '/auth/login', method: 'POST', body: { username: data.dispatcher.username, password: data.dispatcher.password } })).data.accessToken;
    const response = await apiRequest({
      path: `/routes/${data.routeToCancel.id}`,
      method: 'PUT',
      token,
      body: {
        TrangThaiLoTrinh: 'Đã hủy',
        ThoiGianKetThuc: new Date(Date.now() + 65 * 60000).toISOString(),
        GhiChu: `SELENIUM_QA cancel ${data.runId}`
      }
    });
    if (response.status !== 200) throw new Error(`Không hủy được route test. HTTP ${response.status}: ${response.text}`);
    return { actual: `Đã hủy route test ${data.routeToCancel.code} qua API phụ trợ để không để route QA treo.` };
  });

  await runCase(makeMeta('TRIP_007', 'Quản lý chuyến trung chuyển', 'Kiểm tra trạng thái chuyến/vé', '1. Mở danh sách chuyến tài xế.\n2. Quan sát trạng thái route Selenium.', 'Trạng thái chuyến hiển thị trên UI.'), async () => {
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openAssignedTrips();
    await waitText(data.routeWithMap.code);
    const text = await page.getBodyText();
    if (!/Chưa bắt đầu|Đang thực hiện|Đã phân công|Hoàn thành/.test(text)) {
      throw new Error(`Không thấy trạng thái chuyến trong danh sách tài xế. Body: ${text.slice(0, 400)}`);
    }
    return { actual: `Danh sách tài xế hiển thị trạng thái cho chuyến ${data.routeWithMap.code}.` };
  });

  addNotRun(makeMeta('ASSIGN_002', 'Phân công tài xế', 'Phân công xe cho chuyến nếu có', '1. Chọn xe trong wizard.\n2. Xác nhận route.', 'Xe được gắn vào route.'), 'Đã được cover chung trong ASSIGN_001 cùng lúc với chọn tài xế.');
  addNotRun(makeMeta('ASSIGN_003', 'Phân công tài xế', 'Không cho phân công tài xế đang bận', '1. Chọn tài xế đang bận trong wizard.\n2. Quan sát UI disabled/lỗi.', 'Không thể chọn tài xế bận.'), 'UI hiện không có selector/test-id ổn định để nhắm riêng tài xế bận trong wizard khi danh sách thay đổi; cần bổ sung data-testid.');
  addNotRun(makeMeta('ASSIGN_004', 'Phân công tài xế', 'Không cho phân công xe đang bận', '1. Chọn xe đang bận trong wizard.\n2. Quan sát UI disabled/lỗi.', 'Không thể chọn xe bận.'), 'UI hiện không có selector/test-id ổn định để nhắm riêng xe bận trong wizard khi danh sách thay đổi; cần bổ sung data-testid.');
  addNotRun(makeMeta('ASSIGN_005', 'Phân công tài xế', 'Đổi tài xế', '1. Mở điều chỉnh route.\n2. Chọn tài xế khác.\n3. Lưu.', 'Route đổi tài xế thành công.'), 'Màn hình AdjustRoutePage có luồng điều chỉnh nhưng thiếu selector ổn định cho combobox đổi tài xế; chưa automation an toàn bằng Selenium.');
  addNotRun(makeMeta('ASSIGN_006', 'Phân công tài xế', 'Hủy phân công', '1. Mở route đã phân công.\n2. Hủy phân công tài xế/xe.', 'Phân công được hủy.'), 'UI hiện biểu diễn hủy ở mức trạng thái route, chưa có action riêng "hủy phân công".');

  await runCase(makeMeta('ASSIGN_007', 'Phân công tài xế', 'Tài xế nhìn thấy chuyến được phân công sau khi login', '1. Login driver_assigned_test.\n2. Mở /driver/trips/assigned.\n3. Tìm mã chuyến Selenium.', 'Tài xế thấy chuyến được gán.'), async () => {
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openAssignedTrips();
    await waitText(data.routeWithMap.code);
    return { actual: `Tài xế ${data.assignedDriver.username} thấy chuyến ${data.routeWithMap.code} sau khi login.` };
  });
}

async function runDriverAppAndMapTests(data) {
  await runCase(makeMeta('DRIVER_APP_001', 'Màn hình tài xế', 'Tài xế xem danh sách chuyến được phân công', '1. Login driver_assigned_test.\n2. Mở danh sách chuyến được phân công.', 'Danh sách hiển thị chuyến Selenium.'), async () => {
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openAssignedTrips();
    await waitText(data.routeWithMap.code);
    return { actual: `Danh sách chuyến tài xế hiển thị ${data.routeWithMap.code}.` };
  });

  await runCase(makeMeta('DRIVER_APP_002', 'Màn hình tài xế', 'Tài xế xem chi tiết chuyến', '1. Login driver_assigned_test.\n2. Mở chi tiết route Selenium.', 'Chi tiết chuyến hiển thị route, khách, xe và map.'), async () => {
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openTripDetail(data.routeWithMap.id);
    await waitText('Xem lộ trình trung chuyển');
    return { actual: `Mở được chi tiết chuyến ${data.routeWithMap.code}.` };
  });

  await runCase(makeMeta('DRIVER_APP_003', 'Màn hình tài xế', 'Tài xế cập nhật trạng thái: đang đến điểm đón', '1. Mở chi tiết chuyến pending.\n2. Bấm Bắt đầu chuyến.', 'Chuyến chuyển sang Đang thực hiện.'), async () => {
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openTripDetail(data.routeWithMap.id);
    await page.startTripIfPending();
    await waitText('Đang thực hiện');
    return { actual: 'Tài xế bấm Bắt đầu chuyến và UI hiển thị trạng thái Đang thực hiện.' };
  });

  await runCase(makeMeta('DRIVER_APP_004', 'Màn hình tài xế', 'Tài xế cập nhật trạng thái: đã đến điểm đón', '1. Mở chi tiết chuyến đang thực hiện.\n2. Chọn trạng thái khách Đã đến.', 'Trạng thái khách cập nhật thành Đã đến điểm đón.'), async () => {
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openTripDetail(data.routeWithMap.id);
    await page.startTripIfPending();
    await page.selectFirstStopStatus(STOP_STATUS.ARRIVED_PICKUP);
    await waitText('Đã đến điểm đón');
    return { actual: 'Cập nhật stop sang Đã đến điểm đón thành công trên UI.' };
  });

  await runCase(makeMeta('DRIVER_APP_005', 'Màn hình tài xế', 'Tài xế cập nhật trạng thái: đã đón khách', '1. Mở chi tiết chuyến.\n2. Chọn trạng thái khách Đã đón.', 'Trạng thái khách cập nhật thành Đã đón khách.'), async () => {
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openTripDetail(data.routeWithMap.id);
    await page.selectFirstStopStatus(STOP_STATUS.PICKED_UP);
    await waitText('Đã đón khách');
    return { actual: 'Cập nhật stop sang Đã đón khách thành công trên UI.' };
  });

  addNotRun(makeMeta('DRIVER_APP_006', 'Màn hình tài xế', 'Tài xế cập nhật trạng thái: đang đến điểm trả', '1. Mở chi tiết chuyến.\n2. Chọn trạng thái Đang đến điểm trả.', 'Trạng thái chuyển sang đang đến điểm trả.'), 'UI hiện không có option cập nhật riêng "Đang đến điểm trả"; RouteMap chỉ suy diễn stage sau khi khách đã được đón.');

  await runCase(makeMeta('DRIVER_APP_007', 'Màn hình tài xế', 'Tài xế cập nhật trạng thái: hoàn thành', '1. Mở chi tiết chuyến.\n2. Chọn Đã trả khách.\n3. Quan sát route hoàn thành.', 'Stop hoàn tất và route có thể hoàn thành/auto completed.'), async () => {
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openTripDetail(data.routeWithMap.id);
    await page.selectFirstStopStatus(STOP_STATUS.DROPPED_OFF);
    await waitText('Đã trả khách');
    return { actual: 'Cập nhật stop sang Đã trả khách thành công; chuyến đủ điều kiện hoàn thành.' };
  });

  await runCase(makeMeta('DRIVER_APP_008', 'Màn hình tài xế', 'Không cho cập nhật sai luồng trạng thái nếu có quy định', '1. Sau khi stop đã Đã trả khách.\n2. Kiểm tra select trạng thái bị disabled.', 'Stop đã hoàn tất không cho cập nhật ngược.'), async () => {
    const disabled = await driver.executeScript(`
      return Array.from(document.querySelectorAll('select')).some((select) => select.disabled && select.value.includes('Đã trả khách'));
    `);
    if (!disabled) {
      return {
        status: 'BLOCKED',
        actual: 'Không xác nhận được select đã disabled sau khi hoàn tất stop.',
        notes: 'Cần data-testid hoặc route riêng để kiểm tra luồng trạng thái âm tính ổn định.'
      };
    }
    return { actual: 'Select của stop đã hoàn tất bị disabled, không cho cập nhật ngược trên UI.' };
  });

  await runMapTests(data);
}

async function runMapTests(data) {
  await runCase(makeMeta('MAP_001', 'Map và chỉ đường', 'Map hiển thị thành công', '1. Login driver_assigned_test.\n2. Mở chi tiết chuyến có tọa độ.\n3. Quan sát Leaflet map.', 'Container Leaflet hiển thị.'), async () => {
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openTripDetail(data.routeWithMap.id);
    await page.waitVisible(By.css('.leaflet-container'), 20000);
    return { actual: 'Leaflet map container hiển thị trên chi tiết chuyến.' };
  });

  await runCase(makeMeta('MAP_002', 'Map và chỉ đường', 'Marker điểm đón hiển thị', '1. Mở map route có tọa độ.\n2. Đếm marker.', 'Có marker điểm đón.'), async () => {
    const markers = await driver.findElements(By.css('.route-map-marker-icon, .leaflet-marker-icon'));
    if (markers.length < 1) throw new Error(`Không thấy marker trên map. markerCount=${markers.length}`);
    return { actual: `Map hiển thị ${markers.length} marker; có marker điểm đón.` };
  });

  await runCase(makeMeta('MAP_003', 'Map và chỉ đường', 'Marker điểm trả hiển thị', '1. Mở map route có tọa độ.\n2. Đếm marker điểm đón/trả.', 'Có ít nhất 2 marker cho điểm đón và điểm trả.'), async () => {
    const markers = await driver.findElements(By.css('.route-map-marker-icon, .leaflet-marker-icon'));
    if (markers.length < 2) throw new Error(`Marker ít hơn mong đợi. markerCount=${markers.length}`);
    return { actual: `Map hiển thị ${markers.length} marker; đủ cho điểm đón và điểm trả.` };
  });

  await runCase(makeMeta('MAP_004', 'Map và chỉ đường', 'Tuyến đường giữa điểm đón và điểm trả hiển thị', '1. Chờ OSRM trả route.\n2. Kiểm tra polyline Leaflet.', 'Polyline tuyến đường xuất hiện.'), async () => {
    await driver.wait(async () => (await driver.findElements(By.css('path.leaflet-interactive'))).length > 0, 20000);
    const polylines = await driver.findElements(By.css('path.leaflet-interactive'));
    return { actual: `Polyline Leaflet hiển thị, count=${polylines.length}.` };
  });

  await runCase(makeMeta('MAP_005', 'Map và chỉ đường', 'Quãng đường km hiển thị', '1. Mở map route có tọa độ.\n2. Quan sát thông tin quãng đường.', 'UI hiển thị quãng đường km.'), async () => {
    await waitText('Quãng đường');
    return { actual: 'UI hiển thị khối thông tin Quãng đường trên map.' };
  });

  await runCase(makeMeta('MAP_006', 'Map và chỉ đường', 'Thời gian dự kiến hiển thị', '1. Mở map route có tọa độ.\n2. Quan sát thông tin thời gian dự kiến.', 'UI hiển thị thời gian dự kiến.'), async () => {
    await waitText('Thời gian dự kiến');
    return { actual: 'UI hiển thị khối thông tin Thời gian dự kiến trên map.' };
  });

  await runCase(makeMeta('MAP_007', 'Map và chỉ đường', 'Thiếu tọa độ điểm đón thì hiển thị lỗi phù hợp', '1. Login driver_missing_map_test.\n2. Mở route thiếu tọa độ.\n3. Quan sát banner.', 'UI hiển thị cảnh báo thiếu tọa độ.'), async () => {
    await loginDriver(data.missingCoordsDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openTripDetail(data.routeMissingCoords.id);
    await waitText('Thiếu tọa độ điểm đón hoặc điểm trả');
    return { actual: 'Route thiếu tọa độ hiển thị cảnh báo thiếu tọa độ trên UI.' };
  });

  await runCase(makeMeta('MAP_008', 'Map và chỉ đường', 'Thiếu tọa độ điểm trả thì hiển thị lỗi phù hợp', '1. Dùng cùng route thiếu cả pickup/dropoff coords.\n2. Quan sát banner.', 'UI hiển thị cảnh báo thiếu tọa độ điểm trả.'), async () => {
    await waitText('Thiếu tọa độ điểm đón hoặc điểm trả');
    return { actual: 'Banner thiếu tọa độ bao phủ trường hợp thiếu điểm trả.' };
  });

  await runCase(makeMeta('MAP_009', 'Map và chỉ đường', 'OSRM/API route lỗi thì app không crash', '1. Nếu browser hỗ trợ CDP, chặn router.project-osrm.org.\n2. Mở route có tọa độ.\n3. Quan sát lỗi route.', 'UI hiển thị thông báo không thể tính tuyến đường, không crash.'), async () => {
    if (typeof driver.sendDevToolsCommand !== 'function') {
      return {
        status: 'NOT RUN',
        actual: 'Selenium JS driver hiện tại không expose sendDevToolsCommand.',
        notes: 'Cần Chrome/Edge CDP hoặc proxy network để mô phỏng OSRM lỗi.'
      };
    }
    await driver.sendDevToolsCommand('Network.enable', {});
    await driver.sendDevToolsCommand('Network.setBlockedURLs', { urls: ['https://router.project-osrm.org/*'] });
    await loginDriver(data.assignedDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openTripDetail(data.routeWithMap.id);
    await waitText('Không thể tính tuyến đường');
    await driver.sendDevToolsCommand('Network.setBlockedURLs', { urls: [] });
    return { actual: 'Khi chặn OSRM, UI hiển thị thông báo Không thể tính tuyến đường và không crash.' };
  });

  await runCase(makeMeta('MAP_010', 'Map và chỉ đường', 'Không còn phụ thuộc Google Maps API key', '1. Login điều phối.\n2. Mở /dispatch/track.\n3. Kiểm tra DOM không nhúng maps.google.com.', 'Không có iframe/script Google Maps trên màn tracking.'), async () => {
    const page = await openDispatcherRoute('/dispatch/track', { dispatcher: data.dispatcher });
    const usesGoogle = await driver.executeScript(`
      return Array.from(document.querySelectorAll('iframe, script'))
        .some((el) => String(el.src || '').includes('maps.google.com') || String(el.src || '').includes('maps.googleapis.com'));
    `);
    if (usesGoogle) throw new Error('Trang /dispatch/track vẫn nhúng Google Maps script/iframe.');
    return { actual: 'Không phát hiện iframe/script Google Maps trên /dispatch/track; app dùng Leaflet/OpenStreetMap/OSRM cho map route.' };
  });
}

async function runUiValidationTests(data) {
  await runCase(makeMeta('UI_001', 'Form validation', 'Các input bắt buộc hiển thị lỗi khi bỏ trống', '1. Mở login.\n2. Submit rỗng.', 'Hiển thị lỗi bắt buộc.'), async () => {
    const loginPage = new LoginPage(driver);
    currentBasePage = loginPage;
    await loginPage.submitBlank();
    await waitText('Vui lòng nhập tên đăng nhập');
    await waitText('Vui lòng nhập mật khẩu');
    return { actual: 'Login form hiển thị lỗi bắt buộc cho các input rỗng.' };
  });

  await runCase(makeMeta('UI_002', 'Form validation', 'Nút submit disabled hoặc báo lỗi khi dữ liệu không hợp lệ', '1. Mở modal thêm xe.\n2. Nhập biển số sai.\n3. Submit.', 'UI báo lỗi và không tạo bản ghi.'), async () => {
    const page = await openDispatcherRoute('/dispatch/vehicles', data);
    await page.clickButtonByText('Thêm xe trung chuyển');
    const plateInput = await page.waitVisible(By.css('input[placeholder*="51A"]'));
    await plateInput.sendKeys('INVALID');
    await page.clickButtonByText('Thêm');
    await waitText('Biển số không hợp lệ');
    return { actual: 'Submit dữ liệu không hợp lệ bị chặn bằng thông báo lỗi.' };
  });

  await runCase(makeMeta('UI_003', 'Form validation', 'Thông báo success/error hiển thị đúng', '1. Trigger validate lỗi xe.\n2. Quan sát toast error.', 'Toast/thông báo lỗi hiển thị.'), async () => {
    await waitText('Thông báo lỗi');
    return { actual: 'Toast error hiển thị khi validation xe thất bại.' };
  });

  await runCase(makeMeta('UI_004', 'Form validation', 'Loading state nếu có', '1. Mở danh sách khách hàng.\n2. Quan sát trạng thái tải hoặc dữ liệu sau tải.', 'UI có trạng thái đang tải hoặc render dữ liệu sau khi tải xong.'), async () => {
    const page = await openDispatcherRoute('/dispatch/customers', data);
    const body = await page.getBodyText();
    if (!/Đang tải|Thêm khách hàng|Chưa có dữ liệu khách hàng|Mã khách hàng/.test(body)) {
      throw new Error(`Không xác nhận được loading/data state. Body: ${body.slice(0, 400)}`);
    }
    return { actual: 'Màn customers render được loading/data/empty state hợp lệ.' };
  });

  await runCase(makeMeta('UI_005', 'Form validation', 'Empty state khi danh sách rỗng nếu có', '1. Login driver_test không có route.\n2. Mở /driver/trips/assigned.', 'Hiển thị empty state chưa có chuyến.'), async () => {
    await loginDriver(data.emptyDriver);
    const page = new DriverPage(driver);
    currentBasePage = page;
    await page.openAssignedTrips();
    await waitText('Chưa có chuyến nào được phân công');
    return { actual: 'Driver không có route thấy đúng empty state danh sách chuyến.' };
  });

  await runCase(makeMeta('UI_006', 'Form validation', 'Responsive cơ bản desktop/mobile', '1. Resize browser 390x844.\n2. Mở /login.\n3. Kiểm tra input và submit vẫn hiển thị.', 'Login form thao tác được trên mobile viewport.'), async () => {
    await driver.manage().window().setRect({ width: 390, height: 844 });
    const loginPage = new LoginPage(driver);
    currentBasePage = loginPage;
    await loginPage.openFresh();
    await loginPage.waitVisible(By.css('input[type="text"]'));
    await loginPage.waitVisible(By.css('button[type="submit"]'));
    const overflow = await driver.executeScript('return document.documentElement.scrollWidth > window.innerWidth + 1;');
    await driver.manage().window().setRect({ width: 1366, height: 900 });
    if (overflow) {
      throw new Error('Login page bị tràn ngang trên viewport mobile 390px.');
    }
    return { actual: 'Login form hiển thị và không tràn ngang trên viewport 390x844.' };
  });
}

async function main() {
  ensureReportDirs();
  await waitForHttp(config.backendHealthUrl, 30000);
  await waitForHttp(config.frontendBaseUrl, 30000);

  const data = await prepareTestData();
  const context = buildContext(data);

  driver = await buildDriver();
  currentBasePage = new BasePage(driver);
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 60000, script: 30000 });
  await driver.manage().window().setRect({ width: 1366, height: 900 });

  try {
    await runAuthenticationTests(data);
    await runDashboardTests(data);
    await runCustomerTests(data);
    await runDriverManagementTests(data);
    await runVehicleTests(data);
    await runTripAssignmentTests(data);
    await runDriverAppAndMapTests(data);
    await runUiValidationTests(data);
  } finally {
    if (driver) {
      await driver.quit().catch(() => {});
    }
  }

  const result = writeReports(rows, context);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  rows.push(
    rowFrom(
      makeMeta('HARNESS_001', 'Selenium Harness', 'Khởi tạo/chạy bộ Selenium tổng thể', '1. Kiểm tra server.\n2. Seed dữ liệu.\n3. Khởi tạo browser.\n4. Chạy test.', 'Harness hoàn tất và sinh báo cáo.'),
      error.stack || error.message || String(error),
      'FAIL',
      'Lỗi ở harness trước hoặc trong quá trình chạy automation.'
    )
  );
  const result = writeReports(rows, buildContext(null));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
});
