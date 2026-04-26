const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const contextPath = process.env.QA_UI_CONTEXT;
const resultsPath = process.env.QA_UI_RESULTS;

if (!contextPath || !resultsPath) {
  throw new Error('QA_UI_CONTEXT and QA_UI_RESULTS are required');
}

const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
const results = [];

function makeRow(meta, actual, status, notes = '') {
  return {
    'TC ID': meta.id,
    '[Tên Chức Năng]': meta.feature,
    'Mô tả': meta.description,
    'Bước thực hiện': meta.steps,
    'Kết quả mong đợi': meta.expected,
    'Kết quả thực tế': actual,
    'Trạng thái': status,
    'Ghi chú': notes,
  };
}

async function recordCase(meta, body) {
  try {
    const outcome = await body();
    results.push(
      makeRow(
        meta,
        outcome?.actual || 'Thao tác UI hoàn tất và kết quả khớp mong đợi.',
        outcome?.status || 'PASS',
        outcome?.notes || ''
      )
    );
  } catch (error) {
    results.push(
      makeRow(
        meta,
        error instanceof Error ? error.message : String(error),
        'FAIL',
        error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : ''
      )
    );
  }
}

async function clearClientState(page) {
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.goto('/login');
}

async function login(page, username, password) {
  await clearClientState(page);
  await page.getByPlaceholder('Nhập tên đăng nhập').fill(username);
  await page.getByPlaceholder('Nhập mật khẩu').fill(password);
  await page.getByRole('button', { name: 'ĐĂNG NHẬP' }).click();
  await page.waitForURL(/\/(dispatch|driver|change-password-first-login)/, { timeout: 15000 });
}

test.afterAll(async () => {
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
});

test.describe.configure({ mode: 'serial' });

test('UI_001', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_001',
      feature: 'UI/UX',
      description: 'Khách chưa đăng nhập truy cập trang điều phối bị chuyển về đăng nhập',
      steps: '1. Mở /dispatch/overview khi chưa có session.\n2. Quan sát URL và màn hình hiển thị.',
      expected: 'Hệ thống chuyển hướng về /login và hiển thị form đăng nhập.',
    },
    async () => {
      await clearClientState(page);
      await page.goto('/dispatch/overview');
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'ĐĂNG NHẬP' })).toBeVisible();
      return {
        actual: `Trình duyệt được chuyển về ${page.url()} và form đăng nhập hiển thị đúng.`,
      };
    }
  );
});

test('UI_002', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_002',
      feature: 'UI/UX',
      description: 'Form đăng nhập hiển thị validate khi bỏ trống thông tin',
      steps: '1. Mở trang /login.\n2. Không nhập dữ liệu.\n3. Bấm nút ĐĂNG NHẬP.',
      expected:
        'Form hiển thị lỗi bắt buộc cho tên đăng nhập và mật khẩu, không gửi request đăng nhập hợp lệ.',
    },
    async () => {
      await clearClientState(page);
      await page.getByRole('button', { name: 'ĐĂNG NHẬP' }).click();
      await expect(page.getByText('Vui lòng nhập tên đăng nhập')).toBeVisible();
      await expect(page.getByText('Vui lòng nhập mật khẩu')).toBeVisible();
      return {
        actual:
          'UI hiển thị đủ 2 thông báo validate bắt buộc cho tên đăng nhập và mật khẩu ngay trên form.',
      };
    }
  );
});

test('UI_003', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_003',
      feature: 'UI/UX',
      description: 'Màn hình đăng nhập hiển thị được trên viewport mobile cơ bản',
      steps: '1. Đặt viewport 390x844.\n2. Mở trang /login.\n3. Kiểm tra các thành phần chính của form.',
      expected: 'Form đăng nhập vẫn nhìn thấy và thao tác được ở kích thước mobile cơ bản.',
    },
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await clearClientState(page);
      await expect(page.getByPlaceholder('Nhập tên đăng nhập')).toBeVisible();
      await expect(page.getByPlaceholder('Nhập mật khẩu')).toBeVisible();
      await expect(page.getByRole('button', { name: 'ĐĂNG NHẬP' })).toBeVisible();
      const fitsViewport = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth + 1;
      });
      await page.setViewportSize({ width: 1280, height: 720 });
      return {
        actual: `Form hiển thị đầy đủ trên viewport 390x844; kiểm tra tràn ngang=${fitsViewport}.`,
      };
    }
  );
});

test('UI_004', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_004',
      feature: 'UI/UX',
      description: 'Điều hướng chính của điều phối hiển thị đúng sau khi đăng nhập',
      steps:
        '1. Đăng nhập bằng tài khoản điều phối.\n2. Quan sát thanh điều hướng chính và trang tổng quan điều phối.',
      expected:
        'Màn hình điều phối mở thành công và hiển thị menu Điều phối lộ trình, Quản lý xe, Quản lý tài xế, Quản lý khách hàng, Báo cáo.',
    },
    async () => {
      await login(page, context.dispatcher.username, context.dispatcher.password);
      await expect(page).toHaveURL(/\/dispatch\/overview$/);
      for (const item of [
        'Điều phối lộ trình',
        'Quản lý xe',
        'Quản lý tài xế',
        'Quản lý khách hàng',
        'Báo cáo',
      ]) {
        await expect(page.getByText(item)).toBeVisible();
      }
      return {
        actual:
          'Đăng nhập điều phối thành công; đủ 5 mục điều hướng chính hiển thị trên layout dispatcher.',
      };
    }
  );
});

test('UI_005', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_005',
      feature: 'UI/UX',
      description: 'Trang khách hàng có loading state khi API phản hồi chậm',
      steps:
        '1. Đăng nhập điều phối.\n2. Chặn API /customers và trì hoãn phản hồi khoảng 1 giây.\n3. Mở trang /dispatch/customers.\n4. Quan sát trạng thái tải.',
      expected: 'Trang hiển thị thông báo Đang tải... trước khi dữ liệu khách hàng xuất hiện.',
    },
    async () => {
      await login(page, context.dispatcher.username, context.dispatcher.password);
      await page.route('**/api/v1/customers**', async (route) => {
        await page.waitForTimeout(1000);
        await route.continue();
      });
      await page.goto('/dispatch/customers');
      await expect(page.getByText(/Đang tải/i)).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole('button', { name: /Thêm khách hàng/i })).toBeVisible();
      await page.unroute('**/api/v1/customers**');
      return {
        actual:
          'Trong lúc API bị delay, trang hiển thị loading text "Đang tải..." rồi mới render nút Thêm khách hàng và bảng dữ liệu.',
      };
    }
  );
});

test('UI_006', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_006',
      feature: 'UI/UX',
      description: 'Tài xế chưa có chuyến thấy empty state ở danh sách chuyến được phân công',
      steps:
        '1. Đăng nhập bằng tài khoản tài xế QA chưa được gán chuyến.\n2. Mở tab Danh sách chuyến được phân công.',
      expected: 'Màn hình hiển thị thông báo chưa có chuyến nào được phân công.',
    },
    async () => {
      await login(page, context.emptyDriver.username, context.emptyDriver.password);
      await expect(page).toHaveURL(/\/driver\/trips\/assigned$/);
      await expect(page.getByText('Chưa có chuyến nào được phân công')).toBeVisible();
      return {
        actual:
          'Driver QA chưa có route được điều hướng về /driver/trips/assigned và thấy đúng empty state.',
      };
    }
  );
});

test('UI_007', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_007',
      feature: 'UI/UX',
      description: 'Tài xế không được truy cập màn hình dispatcher trên frontend',
      steps:
        '1. Đăng nhập bằng tài khoản tài xế QA.\n2. Truy cập trực tiếp /dispatch/customers.\n3. Quan sát URL sau redirect.',
      expected:
        'Frontend tự chuyển tài xế về route mặc định của driver, không cho xem màn hình dispatcher.',
    },
    async () => {
      await login(page, context.emptyDriver.username, context.emptyDriver.password);
      await page.goto('/dispatch/customers');
      await expect(page).toHaveURL(/\/driver\/trips\/assigned$/, { timeout: 15000 });
      return {
        actual: `Frontend redirect tài xế về ${page.url()} thay vì cho vào màn hình dispatcher.`,
      };
    }
  );
});

test('UI_008', async ({ page }) => {
  await recordCase(
    {
      id: 'UI_008',
      feature: 'UI/UX',
      description: 'Điều phối đăng xuất được từ modal xác nhận',
      steps:
        '1. Đăng nhập điều phối.\n2. Bấm nút đăng xuất trên header.\n3. Xác nhận đăng xuất trong modal.',
      expected: 'Session bị xoá và giao diện quay lại màn hình đăng nhập.',
    },
    async () => {
      await login(page, context.dispatcher.username, context.dispatcher.password);
      await page.getByTitle('Đăng xuất').click();
      await expect(page.getByText('Xác nhận đăng xuất')).toBeVisible();
      await page.getByRole('button', { name: 'Đăng xuất' }).last().click();
      await expect(page).toHaveURL(/\/login$/);
      return {
        actual: 'Modal đăng xuất hiển thị đúng; sau khi xác nhận, ứng dụng quay lại màn hình đăng nhập.',
      };
    }
  );
});
