const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const CONTEXT_PATH = path.join(REPORTS_DIR, 'test_context.json');
const UI_JSON_PATH = path.join(REPORTS_DIR, 'ui_results.json');
const TEST_BACKEND_LOG_PATH = path.join(REPORTS_DIR, 'test_backend_5001.log');
const TEST_REPORT_CSV_PATH = path.join(REPORTS_DIR, 'test_report.csv');
const TEST_SUMMARY_MD_PATH = path.join(REPORTS_DIR, 'test_summary.md');

const BASE_URL = 'http://localhost:5000/api/v1';
const UI_BASE_URL = 'http://localhost:3000';
const OTP_TEST_BASE_URL = 'http://localhost:5001/api/v1';
const ACTIVE_ROUTE_STATUSES = ['Chưa thực hiện', 'Đang thực hiện', 'Đang gặp sự cố'];

const dotenv = require(path.join(ROOT_DIR, 'backend', 'node_modules', 'dotenv'));
const sql = require(path.join(ROOT_DIR, 'backend', 'node_modules', 'mssql'));

dotenv.config({ path: path.join(ROOT_DIR, 'backend', '.env') });

fs.mkdirSync(REPORTS_DIR, { recursive: true });

const results = [];
const summary = {
  startTime: new Date(),
  generatedArtifacts: [],
  criticalFindings: [],
  highRiskAreas: []
};

const dbConfig = {
  server: process.env.SQL_SERVER || 'localhost',
  port: Number(process.env.SQL_PORT || 1433),
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
  }
};

const context = {
  dispatcher: {
    username: 'dieuphoi1',
    password: '123456',
    token: null
  },
  driverWorkflow: null,
  driverSecondary: null,
  registeredDispatcher: null,
  createdDriver: null,
  createdCustomer: null,
  createdVehicle: null,
  routePlan: null,
  routeWorkflow: null,
  routeMissingCoords: null,
  testData: {
    prefix: `AUTO_QA_${Date.now()}`
  }
};

let dbPool = null;
let otpBackendProcess = null;

function csvEscape(value) {
  const raw = String(value ?? '');
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }

  return raw;
}

function createCase(meta, override = {}) {
  return {
    'TC ID': meta.id,
    '[Tên Chức Năng]': meta.feature,
    'Mô tả': meta.description,
    'Bước thực hiện': meta.steps,
    'Kết quả mong đợi': meta.expected,
    'Kết quả thực tế': override.actual || '',
    'Trạng thái': override.status || 'NOT RUN',
    'Ghi chú': override.note || ''
  };
}

function pushResult(meta, override = {}) {
  results.push(createCase(meta, override));
}

function addCriticalFinding(id, message) {
  if (!summary.criticalFindings.find((item) => item.id === id)) {
    summary.criticalFindings.push({ id, message });
  }
}

function ensureRiskArea(area) {
  if (!summary.highRiskAreas.includes(area)) {
    summary.highRiskAreas.push(area);
  }
}

async function getDbPool() {
  if (!dbPool) {
    dbPool = await sql.connect(dbConfig);
  }

  return dbPool;
}

async function dbQuery(query, inputs = {}) {
  const pool = await getDbPool();
  const request = pool.request();

  for (const [name, config] of Object.entries(inputs)) {
    if (config && typeof config === 'object' && 'type' in config) {
      request.input(name, config.type, config.value);
      continue;
    }

    request.input(name, config);
  }

  return request.query(query);
}

async function waitForHealth(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastError = 'Không có phản hồi health check';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(lastError);
}

async function apiRequest({
  baseUrl = BASE_URL,
  path: requestPath,
  method = 'GET',
  token,
  body,
  expectJson = true
}) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body == null ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!expectJson) {
    return { response, data: parsed, text };
  }

  return { response, data: parsed, text };
}

async function login(username, password, baseUrl = BASE_URL) {
  const { response, data } = await apiRequest({
    baseUrl,
    path: '/auth/login',
    method: 'POST',
    body: { username, password }
  });

  return { response, data };
}

async function runCase(meta, fn) {
  try {
    const result = await fn();
    pushResult(meta, {
      status: result?.status || 'PASS',
      actual: result?.actual || 'Thao tác chạy đúng với kỳ vọng.',
      note: result?.note || ''
    });
  } catch (error) {
    pushResult(meta, {
      status: 'FAIL',
      actual: error.actual || error.message || 'Case thất bại ngoài dự kiến.',
      note: error.note || ''
    });
  }
}

function addBlockedCase(meta, reason, actual = '') {
  pushResult(meta, {
    status: 'BLOCKED',
    actual: actual || 'Không thể thực thi do thiếu điều kiện tiên quyết.',
    note: reason
  });
}

function addNotRunCase(meta, reason) {
  pushResult(meta, {
    status: 'NOT RUN',
    actual: 'Chưa thực thi trong đợt kiểm thử hiện tại.',
    note: reason
  });
}

function assert(condition, message, note) {
  if (!condition) {
    const error = new Error(message);
    error.note = note || '';
    error.actual = message;
    throw error;
  }
}

async function startOtpBackend() {
  fs.writeFileSync(TEST_BACKEND_LOG_PATH, '', 'utf8');

  const stdout = fs.openSync(TEST_BACKEND_LOG_PATH, 'a');
  const stderr = fs.openSync(TEST_BACKEND_LOG_PATH, 'a');
  otpBackendProcess = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(ROOT_DIR, 'backend'),
    env: {
      ...process.env,
      APP_PORT: '5001'
    },
    stdio: ['ignore', stdout, stderr]
  });

  await waitForHealth('http://localhost:5001/health', 30000);
}

async function stopOtpBackend() {
  if (!otpBackendProcess) {
    return;
  }

  otpBackendProcess.kill();
  otpBackendProcess = null;
}

async function waitForOtp(phoneNumber, timeoutMs = 15000) {
  const startedAt = Date.now();
  const escapedPhone = phoneNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\[OTP DEMO\\]\\s+${escapedPhone}:\\s+(\\d{6})`, 'g');

  while (Date.now() - startedAt < timeoutMs) {
    const content = fs.readFileSync(TEST_BACKEND_LOG_PATH, 'utf8');
    const matches = [...content.matchAll(pattern)];
    if (matches.length > 0) {
      return matches[matches.length - 1][1];
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Không lấy được OTP demo cho ${phoneNumber} từ backend test 5001`);
}

async function seedRouteTestCustomer({ fullName, phone, pickup, dropoff, ticketSeats = 1, timeSlot = '07:00 - 08:00' }) {
  const customerResult = await dbQuery(
    `
      INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai)
      OUTPUT INSERTED.MaKhachHang
      VALUES (@fullName, @phone, @pickup, @dropoff, N'Hoạt động');
    `,
    {
      fullName: { type: sql.NVarChar(100), value: fullName },
      phone: { type: sql.VarChar(15), value: phone },
      pickup: { type: sql.NVarChar(255), value: pickup },
      dropoff: { type: sql.NVarChar(255), value: dropoff }
    }
  );

  const customerId = customerResult.recordset[0].MaKhachHang;
  const customerCode = `KH${String(customerId).padStart(8, '0')}`;

  await dbQuery(
    `
      INSERT INTO external_customers (
        legacy_ma_khach_hang,
        customer_code,
        full_name,
        phone,
        default_pickup_address,
        default_dropoff_address,
        status,
        is_active
      )
      VALUES (@customerId, @customerCode, @fullName, @phone, @pickup, @dropoff, N'ACTIVE', 1);
    `,
    {
      customerId: { type: sql.Int, value: customerId },
      customerCode: { type: sql.NVarChar(20), value: customerCode },
      fullName: { type: sql.NVarChar(100), value: fullName },
      phone: { type: sql.VarChar(15), value: phone },
      pickup: { type: sql.NVarChar(255), value: pickup },
      dropoff: { type: sql.NVarChar(255), value: dropoff }
    }
  );

  const ticketResult = await dbQuery(
    `
      INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang)
      OUTPUT INSERTED.MaVe
      VALUES (@timeSlot, @ticketSeats, N'Cần trung chuyển', @customerId);
    `,
    {
      timeSlot: { type: sql.NVarChar(100), value: timeSlot },
      ticketSeats: { type: sql.Int, value: ticketSeats },
      customerId: { type: sql.Int, value: customerId }
    }
  );

  return {
    customerId,
    ticketId: ticketResult.recordset[0].MaVe,
    fullName,
    phone,
    pickup,
    dropoff
  };
}

async function getAvailableResources() {
  const availableDriversResult = await dbQuery(`
    SELECT
      tx.MaTaiXe,
      tx.HoTen,
      tx.TrangThaiTaiXe,
      tk.TenDangNhap
    FROM TaiXe tx
    INNER JOIN TaiKhoanNguoiDung tk ON tk.MaTaiKhoan = tx.MaTaiKhoan
    WHERE ISNULL(tx.TrangThaiTaiXe, N'') = N'Rảnh'
      AND ISNULL(tk.TrangThaiTaiKhoan, 0) = 1
      AND NOT EXISTS (
        SELECT 1
        FROM LoTrinhTrungChuyen lt
        WHERE lt.MaTaiXe = tx.MaTaiXe
          AND lt.TrangThaiLoTrinh IN (N'Chưa thực hiện', N'Đang thực hiện', N'Đang gặp sự cố')
      )
    ORDER BY tx.MaTaiXe;
  `);

  const availableVehiclesResult = await dbQuery(`
    SELECT
      x.MaXe,
      x.BienSo,
      x.SoCho,
      x.TrangThaiXe
    FROM XeTrungChuyen x
    WHERE ISNULL(x.TrangThaiXe, N'') = N'Rảnh'
      AND NOT EXISTS (
        SELECT 1
        FROM LoTrinhTrungChuyen lt
        WHERE lt.MaXe = x.MaXe
          AND lt.TrangThaiLoTrinh IN (N'Chưa thực hiện', N'Đang thực hiện', N'Đang gặp sự cố')
      )
    ORDER BY x.MaXe;
  `);

  return {
    drivers: availableDriversResult.recordset,
    vehicles: availableVehiclesResult.recordset
  };
}

function buildFutureIso(minutesAhead) {
  return new Date(Date.now() + minutesAhead * 60 * 1000).toISOString();
}

function toPrettyJson(payload) {
  return JSON.stringify(payload, null, 2);
}

async function runPlaywrightUiTests() {
  const uiCaseMeta = {
    UI_001: {
      id: 'UI_001',
      feature: 'Điều hướng & phân quyền UI',
      description: 'Khách chưa đăng nhập truy cập trang điều phối bị chuyển về login',
      steps: '1. Mở trực tiếp /dispatch/overview khi chưa có session\n2. Quan sát URL hiện tại',
      expected: 'Hệ thống chuyển hướng về /login.'
    },
    UI_002: {
      id: 'UI_002',
      feature: 'Đăng nhập',
      description: 'Form login hiển thị validate bắt buộc ở client khi submit trống',
      steps: '1. Mở trang /login\n2. Không nhập gì\n3. Nhấn ĐĂNG NHẬP',
      expected: 'Hiển thị lỗi tên đăng nhập và mật khẩu bắt buộc.'
    },
    UI_003: {
      id: 'UI_003',
      feature: 'Đăng xuất',
      description: 'Điều phối đăng nhập được và đăng xuất thành công từ UI',
      steps: '1. Login bằng tài khoản điều phối hợp lệ\n2. Mở popup logout\n3. Xác nhận đăng xuất',
      expected: 'Vào được trang overview và logout xong quay về /login.'
    },
    UI_004: {
      id: 'UI_004',
      feature: 'Phân quyền người dùng',
      description: 'Tài xế truy cập trang dispatcher bị redirect về trang tài xế',
      steps: '1. Login bằng tài khoản tài xế được phân công test\n2. Truy cập trực tiếp /dispatch/vehicles',
      expected: 'Hệ thống chuyển về /driver/trips/assigned.'
    },
    UI_005: {
      id: 'UI_005',
      feature: 'Responsive UI',
      description: 'Trang login hiển thị cơ bản trên viewport mobile',
      steps: '1. Mở trang /login ở viewport 390x844\n2. Kiểm tra các input và nút submit',
      expected: 'Form login vẫn hiển thị và thao tác được ở viewport mobile cơ bản.'
    },
    UI_006: {
      id: 'UI_006',
      feature: 'Hồ sơ người dùng',
      description: 'Trang hồ sơ tải dữ liệu người dùng thật từ API /auth/me',
      steps: '1. Login bằng tài khoản điều phối\n2. Truy cập /profile\n3. Quan sát thông tin hiển thị',
      expected: 'Trang profile hiển thị họ tên/số điện thoại/trạng thái lấy từ API.'
    },
    MAP_004: {
      id: 'MAP_004',
      feature: 'Map chỉ đường',
      description: 'Màn hình chi tiết chuyến tài xế hiển thị Leaflet map cho route có tọa độ',
      steps: '1. Login bằng tài xế workflow\n2. Mở trang chi tiết chuyến có tọa độ\n3. Quan sát container map và thẻ thông tin',
      expected: 'Leaflet map hiển thị, không xuất hiện banner thiếu tọa độ.'
    },
    MAP_005: {
      id: 'MAP_005',
      feature: 'Map chỉ đường',
      description: 'Màn hình chi tiết chuyến hiển thị cảnh báo thiếu tọa độ khi stop không có lat/lng',
      steps: '1. Login bằng tài xế workflow\n2. Mở chuyến test có địa chỉ không map được\n3. Quan sát banner lỗi',
      expected: 'Hiển thị banner Thiếu tọa độ điểm đón hoặc điểm trả.'
    },
    MAP_006: {
      id: 'MAP_006',
      feature: 'Map chỉ đường',
      description: 'UI xử lý lỗi khi OSRM trả 500',
      steps: '1. Login tài xế workflow\n2. Intercept request OSRM và trả 500\n3. Mở chi tiết chuyến có tọa độ',
      expected: 'Hiển thị banner Không thể tính tuyến đường.'
    },
    MAP_007: {
      id: 'MAP_007',
      feature: 'Map chỉ đường',
      description: 'Màn hình Theo dõi trạng thái không nên còn phụ thuộc Google Maps embed',
      steps: '1. Login bằng điều phối\n2. Mở /dispatch/track\n3. Kiểm tra DOM iframe bản đồ',
      expected: 'Không còn iframe maps.google.com; màn hình dùng Leaflet/OpenStreetMap hoặc giải pháp nội bộ.'
    }
  };

  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(
    command,
    ['--yes', 'playwright', 'test', path.join(ROOT_DIR, 'scripts', 'qa', 'ui.spec.js'), '--config', path.join(ROOT_DIR, 'scripts', 'qa', 'playwright.config.js'), '--reporter=json'],
    {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        TEST_CONTEXT_PATH: CONTEXT_PATH
      }
    }
  );

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolve) => {
    child.on('close', resolve);
  });

  fs.writeFileSync(UI_JSON_PATH, stdout || '{}', 'utf8');

  if (!stdout.trim()) {
    Object.values(uiCaseMeta).forEach((meta) => {
      addBlockedCase(meta, `Không đọc được kết quả Playwright. STDERR: ${stderr || 'N/A'}`);
    });
    return;
  }

  let json;
  try {
    json = JSON.parse(stdout);
  } catch (error) {
    Object.values(uiCaseMeta).forEach((meta) => {
      addBlockedCase(meta, `Playwright không trả JSON hợp lệ. Exit code=${exitCode}. STDERR: ${stderr || 'N/A'}`);
    });
    return;
  }

  const executed = new Map();

  function walkSuite(suite) {
    if (Array.isArray(suite.suites)) {
      suite.suites.forEach(walkSuite);
    }

    if (Array.isArray(suite.specs)) {
      for (const spec of suite.specs) {
        const tcId = String(spec.title || '').split(' :: ')[0].trim();
        if (!tcId) {
          continue;
        }

        const test = Array.isArray(spec.tests) ? spec.tests[0] : null;
        const lastResult = test?.results?.[test.results.length - 1] || null;
        const errors = [];
        if (Array.isArray(lastResult?.errors)) {
          for (const item of lastResult.errors) {
            if (item?.message) {
              errors.push(item.message);
            }
          }
        }

        const errorText = errors.join('\n') || lastResult?.error?.message || '';
        executed.set(tcId, {
          status: lastResult?.status === 'passed' ? 'PASS' : lastResult?.status === 'skipped' ? 'BLOCKED' : 'FAIL',
          actual:
            lastResult?.status === 'passed'
              ? 'Thao tác UI chạy thành công theo kịch bản Playwright.'
              : errorText || `Playwright trả trạng thái ${lastResult?.status || 'unknown'}.`,
          note:
            lastResult?.status === 'passed'
              ? `UI automation qua Playwright tại ${path.join('scripts', 'qa', 'ui.spec.js')}.`
              : `UI automation qua Playwright thất bại. ${stderr ? `STDERR: ${stderr.trim()}` : ''}`.trim()
        });
      }
    }
  }

  if (Array.isArray(json.suites)) {
    json.suites.forEach(walkSuite);
  }

  for (const [tcId, meta] of Object.entries(uiCaseMeta)) {
    const outcome = executed.get(tcId);
    if (!outcome) {
      addBlockedCase(meta, `Không thấy case trong kết quả Playwright. Exit code=${exitCode}.`);
      continue;
    }

    pushResult(meta, outcome);
  }
}

function countByStatus(status) {
  return results.filter((item) => item['Trạng thái'] === status).length;
}

async function main() {
  const environmentMeta = {
    node: process.version,
    generatedAt: new Date().toISOString(),
    apiBaseUrl: BASE_URL,
    uiBaseUrl: UI_BASE_URL
  };

  fs.writeFileSync(CONTEXT_PATH, JSON.stringify({ environment: environmentMeta }, null, 2), 'utf8');

  await startOtpBackend();

  const authLoginDispatcher = {
    id: 'AUTH_001',
    feature: 'Đăng nhập',
    description: 'Điều phối đăng nhập đúng tài khoản hợp lệ',
    steps: '1. Gọi POST /auth/login với username dieuphoi1\n2. Nhập password đúng 123456',
    expected: 'API trả 200, có accessToken và user role Nhân viên điều phối.'
  };

  await runCase(authLoginDispatcher, async () => {
    const { response, data } = await login(context.dispatcher.username, context.dispatcher.password);
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(Boolean(data?.data?.accessToken), 'Response không có accessToken');
    assert(data?.data?.user?.VaiTro === 'Nhân viên điều phối', 'Role trả về không phải điều phối');
    context.dispatcher.token = data.data.accessToken;
    return {
      actual: `Đăng nhập điều phối thành công, nhận JWT và MaNhanVien=${data.data.user?.MaNhanVien}.`,
      note: 'API: POST /api/v1/auth/login'
    };
  });

  const authLoginDriver = {
    id: 'AUTH_002',
    feature: 'Đăng nhập',
    description: 'Tài xế seed đăng nhập đúng tài khoản hợp lệ',
    steps: '1. Gọi POST /auth/login với username taixe1\n2. Nhập password đúng 123456',
    expected: 'API trả 200, có accessToken và user role Tài xế.'
  };

  await runCase(authLoginDriver, async () => {
    const { response, data } = await login('taixe1', '123456');
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(Boolean(data?.data?.accessToken), 'Response không có accessToken');
    assert(data?.data?.user?.VaiTro === 'Tài xế', 'Role trả về không phải tài xế');
    return {
      actual: `Đăng nhập tài xế thành công, MaTaiXe=${data.data.user?.MaTaiXe}.`,
      note: 'API: POST /api/v1/auth/login'
    };
  });

  const authMissingFields = {
    id: 'AUTH_003',
    feature: 'Đăng nhập',
    description: 'Đăng nhập thiếu username và password',
    steps: '1. Gọi POST /auth/login với body rỗng',
    expected: 'API trả 400 và fieldErrors cho username/password.'
  };

  await runCase(authMissingFields, async () => {
    const { response, data } = await apiRequest({
      path: '/auth/login',
      method: 'POST',
      body: {}
    });
    assert(response.status === 400, `HTTP thực tế ${response.status}`);
    assert(Boolean(data?.data?.fieldErrors?.username), 'Thiếu fieldErrors.username');
    assert(Boolean(data?.data?.fieldErrors?.password), 'Thiếu fieldErrors.password');
    return {
      actual: `API trả 400 với lỗi username="${data.data.fieldErrors.username}" và password="${data.data.fieldErrors.password}".`,
      note: 'API: POST /api/v1/auth/login'
    };
  });

  const authWrongPassword = {
    id: 'AUTH_004',
    feature: 'Đăng nhập',
    description: 'Đăng nhập sai mật khẩu',
    steps: '1. Gọi POST /auth/login với username hợp lệ\n2. Nhập password sai',
    expected: 'API trả 401 Sai mật khẩu.'
  };

  await runCase(authWrongPassword, async () => {
    const { response, data } = await login('dieuphoi1', 'sai-mat-khau');
    assert(response.status === 401, `HTTP thực tế ${response.status}`);
    assert(data?.message === 'Sai mật khẩu', `Thông điệp thực tế: ${data?.message || 'null'}`);
    return {
      actual: 'API chặn đăng nhập sai mật khẩu với 401/Sai mật khẩu.',
      note: 'API: POST /api/v1/auth/login'
    };
  });

  const authGetProfile = {
    id: 'AUTH_005',
    feature: 'Xác thực người dùng',
    description: 'Lấy hồ sơ người dùng hiện tại sau đăng nhập',
    steps: '1. Login điều phối\n2. Gọi GET /auth/me với Bearer token',
    expected: 'API trả 200 và hồ sơ người dùng khớp tài khoản đăng nhập.'
  };

  await runCase(authGetProfile, async () => {
    const { response, data } = await apiRequest({
      path: '/auth/me',
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(data?.data?.TenDangNhap === 'dieuphoi1', 'Tên đăng nhập trả về không khớp');
    return {
      actual: `API /auth/me trả về ${data.data.HoTen} - ${data.data.SoDienThoai}.`,
      note: 'API: GET /api/v1/auth/me'
    };
  });

  const authProtectedWithoutToken = {
    id: 'AUTH_006',
    feature: 'Phân quyền người dùng',
    description: 'Truy cập API bảo vệ khi chưa đăng nhập',
    steps: '1. Gọi GET /customers không gửi Authorization',
    expected: 'API trả 401 yêu cầu đăng nhập.'
  };

  await runCase(authProtectedWithoutToken, async () => {
    const { response, data } = await apiRequest({ path: '/customers' });
    assert(response.status === 401, `HTTP thực tế ${response.status}`);
    assert(data?.message?.includes('đăng nhập'), `Thông điệp thực tế: ${data?.message || 'null'}`);
    return {
      actual: `API trả 401 với message="${data.message}".`,
      note: 'Middleware: backend/src/middleware/auth.js'
    };
  });

  const authDriverBlockedDispatcherApi = {
    id: 'AUTH_007',
    feature: 'Phân quyền người dùng',
    description: 'Tài xế không truy cập được API chỉ dành cho điều phối',
    steps: '1. Login tài xế taixe1\n2. Gọi GET /customers với token tài xế',
    expected: 'API trả 403.'
  };

  await runCase(authDriverBlockedDispatcherApi, async () => {
    const driverLogin = await login('taixe1', '123456');
    const driverToken = driverLogin.data.data.accessToken;
    const { response, data } = await apiRequest({
      path: '/customers',
      token: driverToken
    });
    assert(response.status === 403, `HTTP thực tế ${response.status}`);
    return {
      actual: `Token tài xế bị chặn với 403 và message="${data.message}".`,
      note: 'Route mount requireRole(DISPATCHER_ROLE) ở backend/src/app.js'
    };
  });

  const authDriverBlockedOtherDriverRoute = {
    id: 'AUTH_008',
    feature: 'Phân quyền người dùng',
    description: 'Tài xế không xem được chuyến của tài xế khác',
    steps: '1. Login taixe1\n2. Gọi GET /routes/by-driver/2 hoặc route detail của tài xế khác',
    expected: 'API trả 403.'
  };

  await runCase(authDriverBlockedOtherDriverRoute, async () => {
    const driverLogin = await login('taixe1', '123456');
    const driverToken = driverLogin.data.data.accessToken;
    const { response, data } = await apiRequest({
      path: '/routes/by-driver/2',
      token: driverToken
    });
    assert(response.status === 403, `HTTP thực tế ${response.status}`);
    return {
      actual: `API chặn truy cập chuyến của tài xế khác với 403/${data.message}.`,
      note: 'Authorization check: canAccessDriverResource trong backend/src/routes/routes.js'
    };
  });

  const authLogout = {
    id: 'AUTH_009',
    feature: 'Đăng xuất',
    description: 'API logout trả contract thành công',
    steps: '1. Login điều phối\n2. Gọi POST /auth/logout',
    expected: 'API trả 200 và message xác nhận logout.'
  };

  await runCase(authLogout, async () => {
    const { response, data } = await apiRequest({
      path: '/auth/logout',
      method: 'POST',
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(data?.success === true, 'Response success != true');
    return {
      actual: `API logout trả 200 với message="${data.message}".`,
      note: 'API: POST /api/v1/auth/logout'
    };
  });

  const registerDispatcherMeta = {
    id: 'AUTH_010',
    feature: 'Đăng ký tài khoản',
    description: 'Đăng ký tài khoản điều phối hợp lệ',
    steps: '1. Gọi POST /auth/register với role dispatcher và dữ liệu hợp lệ duy nhất',
    expected: 'API trả 201, tạo account và nhân viên điều phối mới.'
  };

  await runCase(registerDispatcherMeta, async () => {
    const username = `${context.testData.prefix.toLowerCase()}_dispatcher`;
    const phoneNumber = `09${String(Date.now()).slice(-8)}`;
    const password = 'QaDispatch@123';
    const { response, data } = await apiRequest({
      path: '/auth/register',
      method: 'POST',
      body: {
        role: 'dispatcher',
        fullName: `${context.testData.prefix} Dispatcher`,
        username,
        phoneNumber,
        password
      }
    });

    assert(response.status === 201, `HTTP thực tế ${response.status}`);
    context.registeredDispatcher = { username, phoneNumber, password };
    return {
      actual: `Tạo dispatcher thành công với username=${username}, phone=${phoneNumber}.`,
      note: 'API: POST /api/v1/auth/register'
    };
  });

  const forgotResetMeta = {
    id: 'AUTH_011',
    feature: 'Quên mật khẩu / OTP',
    description: 'Reset password bằng OTP demo trên backend test port 5001',
    steps: '1. Gọi POST /auth/forgot-password trên backend test 5001\n2. Đọc OTP từ log backend test\n3. Gọi POST /auth/reset-password với OTP đúng\n4. Login lại bằng mật khẩu mới',
    expected: 'OTP được sinh, reset thành công và đăng nhập bằng mật khẩu mới được.'
  };

  await runCase(forgotResetMeta, async () => {
    assert(context.registeredDispatcher, 'Chưa có dispatcher test để reset password');

    const forgot = await apiRequest({
      baseUrl: OTP_TEST_BASE_URL,
      path: '/auth/forgot-password',
      method: 'POST',
      body: { phoneNumber: context.registeredDispatcher.phoneNumber }
    });

    assert(forgot.response.status === 200, `HTTP thực tế ${forgot.response.status}`);
    const otp = await waitForOtp(context.registeredDispatcher.phoneNumber);
    const newPassword = 'QaReset@456';

    const reset = await apiRequest({
      baseUrl: OTP_TEST_BASE_URL,
      path: '/auth/reset-password',
      method: 'POST',
      body: {
        phoneNumber: context.registeredDispatcher.phoneNumber,
        otp,
        newPassword
      }
    });

    assert(reset.response.status === 200, `Reset HTTP thực tế ${reset.response.status}`);
    const loginAfterReset = await login(context.registeredDispatcher.username, newPassword, OTP_TEST_BASE_URL);
    assert(loginAfterReset.response.status === 200, `Login sau reset HTTP ${loginAfterReset.response.status}`);

    context.registeredDispatcher.password = newPassword;
    return {
      actual: `OTP ${otp} được đọc từ log backend test 5001; reset password và login lại thành công.`,
      note: `Backend OTP test log: ${path.join('reports', 'test_backend_5001.log')}`
    };
  });

  const listDriversMeta = {
    id: 'DRIVER_001',
    feature: 'Quản lý tài xế',
    description: 'Xem danh sách tài xế',
    steps: '1. Login điều phối\n2. Gọi GET /drivers',
    expected: 'API trả 200 và có danh sách tài xế.'
  };

  let driversSnapshot = [];
  await runCase(listDriversMeta, async () => {
    const { response, data } = await apiRequest({
      path: '/drivers',
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(Array.isArray(data?.data) && data.data.length > 0, 'Danh sách tài xế rỗng');
    driversSnapshot = data.data;
    return {
      actual: `API trả ${data.data.length} tài xế. Có trạng thái mẫu: ${[...new Set(data.data.map((item) => item.TrangThaiTaiXe))].join(', ')}.`,
      note: 'API: GET /api/v1/drivers'
    };
  });

  const createDriverMeta = {
    id: 'DRIVER_002',
    feature: 'Quản lý tài xế',
    description: 'Tạo tài xế hợp lệ từ màn hình quản lý tài xế',
    steps: '1. Login điều phối\n2. Gọi POST /drivers với dữ liệu hợp lệ duy nhất',
    expected: 'API trả 201, tạo tài xế + account đăng nhập mặc định.'
  };

  await runCase(createDriverMeta, async () => {
    const suffix = String(Date.now()).slice(-6);
    const payload = {
      MaNhanVien: `QA${suffix}`,
      HoTen: `${context.testData.prefix} Driver`,
      SoDienThoai: `07${String(Date.now()).slice(-8)}`,
      CCCD: `${String(Date.now()).slice(-12)}`.padStart(12, '1'),
      LoaiBangLai: 'D',
      TrangThaiTaiXe: 'Rảnh'
    };

    const { response, data } = await apiRequest({
      path: '/drivers',
      method: 'POST',
      token: context.dispatcher.token,
      body: payload
    });

    assert(response.status === 201, `HTTP thực tế ${response.status}`);
    assert(Boolean(data?.data?.account?.TenDangNhap), 'Không trả về tài khoản đăng nhập');
    context.createdDriver = {
      driverId: data.data.driver.MaTaiXe,
      username: data.data.account.TenDangNhap,
      password: data.data.account.MatKhauMacDinh || '123456',
      phoneNumber: payload.SoDienThoai,
      cccd: payload.CCCD,
      employeeCode: payload.MaNhanVien
    };
    return {
      actual: `Tạo tài xế ${payload.HoTen} thành công, username=${context.createdDriver.username}, mật khẩu mặc định=${context.createdDriver.password}.`,
      note: 'API: POST /api/v1/drivers'
    };
  });

  const driverInvalidMeta = {
    id: 'DRIVER_003',
    feature: 'Quản lý tài xế',
    description: 'Tạo tài xế thiếu trường/CCCD sai định dạng',
    steps: '1. Gọi POST /drivers với CCCD không đủ 12 số và thiếu loại bằng lái',
    expected: 'API trả 400 và fieldErrors tương ứng.'
  };

  await runCase(driverInvalidMeta, async () => {
    const { response, data } = await apiRequest({
      path: '/drivers',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        MaNhanVien: '',
        HoTen: 'Driver invalid',
        SoDienThoai: '090123',
        CCCD: '123',
        LoaiBangLai: ''
      }
    });
    assert(response.status === 400, `HTTP thực tế ${response.status}`);
    assert(Boolean(data?.data?.fieldErrors?.MaNhanVien), 'Thiếu fieldErrors.MaNhanVien');
    assert(Boolean(data?.data?.fieldErrors?.SoDienThoai), 'Thiếu fieldErrors.SoDienThoai');
    assert(Boolean(data?.data?.fieldErrors?.CCCD), 'Thiếu fieldErrors.CCCD');
    return {
      actual: `API trả 400 với fieldErrors=${toPrettyJson(data.data.fieldErrors)}.`,
      note: 'Validation: backend/src/routes/drivers.js'
    };
  });

  const driverDuplicateMeta = {
    id: 'DRIVER_004',
    feature: 'Quản lý tài xế',
    description: 'Không cho tạo tài xế trùng mã nhân viên/phone/CCCD',
    steps: '1. Gọi POST /drivers với dữ liệu trùng tài xế QA vừa tạo',
    expected: 'API trả 409 conflict.'
  };

  await runCase(driverDuplicateMeta, async () => {
    assert(context.createdDriver, 'Chưa có tài xế test');
    const { response, data } = await apiRequest({
      path: '/drivers',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        MaNhanVien: context.createdDriver.employeeCode,
        HoTen: 'Duplicate Driver',
        SoDienThoai: context.createdDriver.phoneNumber,
        CCCD: context.createdDriver.cccd,
        LoaiBangLai: 'D'
      }
    });
    assert(response.status === 409, `HTTP thực tế ${response.status}`);
    return {
      actual: `API chặn duplicate với message="${data.message}".`,
      note: 'Conflict mapping: backend/src/routes/drivers.js'
    };
  });

  const driverUpdateMeta = {
    id: 'DRIVER_005',
    feature: 'Quản lý tài xế',
    description: 'Sửa thông tin tài xế hợp lệ',
    steps: '1. Gọi PUT /drivers/:id với phone/loại bằng mới cho tài xế QA',
    expected: 'API trả 200 và lưu thông tin mới.'
  };

  await runCase(driverUpdateMeta, async () => {
    assert(context.createdDriver, 'Chưa có tài xế test');
    const newPhone = `08${String(Date.now()).slice(-8)}`;
    const { response, data } = await apiRequest({
      path: `/drivers/${context.createdDriver.driverId}`,
      method: 'PUT',
      token: context.dispatcher.token,
      body: {
        MaNhanVien: context.createdDriver.employeeCode,
        HoTen: `${context.testData.prefix} Driver Updated`,
        SoDienThoai: newPhone,
        CCCD: context.createdDriver.cccd,
        LoaiBangLai: 'E'
      }
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(data?.data?.SoDienThoai === newPhone, 'Phone sau update không đúng');
    context.createdDriver.phoneNumber = newPhone;
    return {
      actual: `Cập nhật tài xế thành công, phone mới=${newPhone}, LoaiBangLai=${data.data.LoaiBangLai}.`,
      note: 'API: PUT /api/v1/drivers/:id'
    };
  });

  const driverStatusMeta = {
    id: 'DRIVER_006',
    feature: 'Quản lý tài xế',
    description: 'Danh sách tài xế hiển thị đúng nhóm trạng thái vận hành',
    steps: '1. Gọi GET /drivers\n2. Tổng hợp các trạng thái trả về',
    expected: 'API trả dữ liệu có trạng thái mapped như Rảnh/Đã phân công/Đang thực hiện/Ngừng hoạt động khi phù hợp.'
  };

  await runCase(driverStatusMeta, async () => {
    const { response, data } = await apiRequest({
      path: '/drivers',
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    const statuses = [...new Set((data?.data || []).map((item) => item.TrangThaiTaiXe))];
    assert(statuses.includes('Rảnh'), 'Danh sách không có trạng thái Rảnh');
    return {
      actual: `Danh sách driver hiện có các trạng thái: ${statuses.join(', ')}.`,
      note: 'Status mapping: backend/src/routes/drivers.js'
    };
  });

  const driverFirstLoginMeta = {
    id: 'AUTH_012',
    feature: 'Đổi mật khẩu lần đầu',
    description: 'Tài khoản tài xế mới tạo qua quản lý tài xế bắt buộc đổi mật khẩu lần đầu khi login',
    steps: '1. Login bằng username/mật khẩu mặc định của tài xế QA vừa tạo',
    expected: 'API login không trả accessToken mà trả requirePasswordChange=true và passwordChangeToken.'
  };

  await runCase(driverFirstLoginMeta, async () => {
    assert(context.createdDriver, 'Chưa có tài xế test');
    const { response, data } = await login(context.createdDriver.username, context.createdDriver.password);
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(data?.data?.requirePasswordChange === true, 'requirePasswordChange != true');
    assert(Boolean(data?.data?.passwordChangeToken), 'Không có passwordChangeToken');
    context.createdDriver.passwordChangeToken = data.data.passwordChangeToken;
    return {
      actual: 'Login đầu tiên trả requirePasswordChange=true đúng như thiết kế.',
      note: 'API: POST /api/v1/auth/login + driverAccountService default password'
    };
  });

  const driverChangeFirstPasswordMeta = {
    id: 'AUTH_013',
    feature: 'Đổi mật khẩu lần đầu',
    description: 'Đổi mật khẩu lần đầu thành công cho tài xế mới tạo',
    steps: '1. Gọi POST /auth/change-password-first-login với token đổi mật khẩu lần đầu\n2. Login lại bằng mật khẩu mới',
    expected: 'Đổi mật khẩu thành công và login lại bằng mật khẩu mới được.'
  };

  await runCase(driverChangeFirstPasswordMeta, async () => {
    assert(context.createdDriver?.passwordChangeToken, 'Thiếu passwordChangeToken');
    const newPassword = 'QaDriver@789';
    const change = await apiRequest({
      path: '/auth/change-password-first-login',
      method: 'POST',
      body: {
        token: context.createdDriver.passwordChangeToken,
        newPassword,
        confirmPassword: newPassword
      }
    });
    assert(change.response.status === 200, `HTTP thực tế ${change.response.status}`);

    const loginAfterChange = await login(context.createdDriver.username, newPassword);
    assert(loginAfterChange.response.status === 200, `Login lại HTTP ${loginAfterChange.response.status}`);
    assert(Boolean(loginAfterChange.data?.data?.accessToken), 'Login lại không có accessToken');
    context.createdDriver.password = newPassword;
    return {
      actual: `Đổi mật khẩu lần đầu thành công, login lại bằng mật khẩu mới được.`,
      note: 'API: POST /api/v1/auth/change-password-first-login'
    };
  });

  const listVehiclesMeta = {
    id: 'VEHICLE_001',
    feature: 'Quản lý xe',
    description: 'Xem danh sách xe trung chuyển',
    steps: '1. Login điều phối\n2. Gọi GET /vehicles',
    expected: 'API trả 200 và có danh sách xe.'
  };

  let vehicleSnapshot = [];
  await runCase(listVehiclesMeta, async () => {
    const { response, data } = await apiRequest({
      path: '/vehicles',
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(Array.isArray(data?.data) && data.data.length > 0, 'Danh sách xe rỗng');
    vehicleSnapshot = data.data;
    return {
      actual: `API trả ${data.data.length} xe. Ví dụ trạng thái: ${[...new Set(data.data.map((item) => item.TrangThaiXe))].join(', ')}.`,
      note: 'API: GET /api/v1/vehicles'
    };
  });

  const createVehicleMeta = {
    id: 'VEHICLE_002',
    feature: 'Quản lý xe',
    description: 'Tạo xe trung chuyển hợp lệ',
    steps: '1. Gọi POST /vehicles với biển số duy nhất và số chỗ hợp lệ',
    expected: 'API trả 201 và tạo xe thành công.'
  };

  await runCase(createVehicleMeta, async () => {
    const plate = `88A-${String(Date.now()).slice(-5)}`;
    const { response, data } = await apiRequest({
      path: '/vehicles',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        BienSo: plate,
        LoaiXe: 'Xe 7 chỗ',
        SoCho: 7,
        TrangThaiXe: 'Rảnh'
      }
    });
    assert(response.status === 201, `HTTP thực tế ${response.status}`);
    context.createdVehicle = { vehicleId: data.data.MaXe, plate };
    return {
      actual: `Tạo xe thành công với MaXe=${data.data.MaXe}, BienSo=${data.data.BienSo}.`,
      note: 'API: POST /api/v1/vehicles'
    };
  });

  const invalidVehiclePlateMeta = {
    id: 'VEHICLE_003',
    feature: 'Quản lý xe',
    description: 'Validate biển số xe sai định dạng',
    steps: '1. Gọi POST /vehicles với BienSo = 123',
    expected: 'API trả 400.'
  };

  await runCase(invalidVehiclePlateMeta, async () => {
    const { response, data } = await apiRequest({
      path: '/vehicles',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        BienSo: '123',
        LoaiXe: 'Xe 7 chỗ',
        SoCho: 7,
        TrangThaiXe: 'Rảnh'
      }
    });
    assert(response.status === 400, `HTTP thực tế ${response.status}`);
    return {
      actual: `API chặn biển số sai định dạng với message="${data.message}".`,
      note: 'Validation: backend/src/routes/vehicles.js'
    };
  });

  const invalidVehicleSeatsMeta = {
    id: 'VEHICLE_004',
    feature: 'Quản lý xe',
    description: 'Validate số chỗ xe ngoài khoảng 4..45',
    steps: '1. Gọi POST /vehicles với SoCho = 3',
    expected: 'API trả 400.'
  };

  await runCase(invalidVehicleSeatsMeta, async () => {
    const { response, data } = await apiRequest({
      path: '/vehicles',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        BienSo: `77A-${String(Date.now()).slice(-5)}`,
        LoaiXe: 'Xe 7 chỗ',
        SoCho: 3,
        TrangThaiXe: 'Rảnh'
      }
    });
    assert(response.status === 400, `HTTP thực tế ${response.status}`);
    return {
      actual: `API chặn số chỗ không hợp lệ với message="${data.message}".`,
      note: 'Validation: backend/src/routes/vehicles.js'
    };
  });

  const duplicateVehicleMeta = {
    id: 'VEHICLE_005',
    feature: 'Quản lý xe',
    description: 'Không cho tạo xe trùng biển số',
    steps: '1. Gọi POST /vehicles với biển số trùng xe QA vừa tạo',
    expected: 'API trả 409 conflict.'
  };

  await runCase(duplicateVehicleMeta, async () => {
    assert(context.createdVehicle, 'Chưa có xe test');
    const { response, data } = await apiRequest({
      path: '/vehicles',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        BienSo: context.createdVehicle.plate,
        LoaiXe: 'Xe 7 chỗ',
        SoCho: 7,
        TrangThaiXe: 'Rảnh'
      }
    });
    assert(response.status === 409, `HTTP thực tế ${response.status}`);
    return {
      actual: `API chặn biển số trùng với message="${data.message}".`,
      note: 'Conflict check: backend/src/routes/vehicles.js'
    };
  });

  const updateVehicleMeta = {
    id: 'VEHICLE_006',
    feature: 'Quản lý xe',
    description: 'Sửa thông tin xe hợp lệ',
    steps: '1. Gọi PUT /vehicles/:id cho xe QA\n2. Đổi loại xe và số chỗ',
    expected: 'API trả 200 và lưu giá trị mới.'
  };

  await runCase(updateVehicleMeta, async () => {
    assert(context.createdVehicle, 'Chưa có xe test');
    const { response, data } = await apiRequest({
      path: `/vehicles/${context.createdVehicle.vehicleId}`,
      method: 'PUT',
      token: context.dispatcher.token,
      body: {
        BienSo: context.createdVehicle.plate,
        LoaiXe: 'Xe 9 - 12 chỗ',
        SoCho: 12,
        TrangThaiXe: 'Bảo trì'
      }
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    return {
      actual: `Cập nhật xe thành công: LoaiXe=${data.data.LoaiXe}, SoCho=${data.data.SoCho}, TrangThaiXe=${data.data.TrangThaiXe}.`,
      note: 'API: PUT /api/v1/vehicles/:id'
    };
  });

  const deleteVehicleMeta = {
    id: 'VEHICLE_007',
    feature: 'Quản lý xe',
    description: 'Xóa xe chưa từng được phân công',
    steps: '1. Gọi DELETE /vehicles/:id cho xe QA chưa gán route',
    expected: 'API trả 200 và xóa xe thành công.'
  };

  await runCase(deleteVehicleMeta, async () => {
    assert(context.createdVehicle, 'Chưa có xe test');
    const { response, data } = await apiRequest({
      path: `/vehicles/${context.createdVehicle.vehicleId}`,
      method: 'DELETE',
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    return {
      actual: `Xóa xe QA thành công, response trả BienSo=${data.data.BienSo}.`,
      note: 'API: DELETE /api/v1/vehicles/:id'
    };
  });

  const deleteUsedVehicleMeta = {
    id: 'VEHICLE_008',
    feature: 'Quản lý xe',
    description: 'Không cho xóa xe đã từng được phân công lộ trình',
    steps: '1. Chọn xe đã có lịch sử route\n2. Gọi DELETE /vehicles/:id',
    expected: 'API trả 409 conflict.'
  };

  await runCase(deleteUsedVehicleMeta, async () => {
    const usedVehicle = vehicleSnapshot.find((item) => Number(item.MaXe) === 1) || vehicleSnapshot[0];
    const { response, data } = await apiRequest({
      path: `/vehicles/${usedVehicle.MaXe}`,
      method: 'DELETE',
      token: context.dispatcher.token
    });
    assert(response.status === 409, `HTTP thực tế ${response.status}`);
    return {
      actual: `API chặn xóa xe đã có lịch sử phân công với message="${data.message}".`,
      note: 'Delete rule: backend/src/routes/vehicles.js'
    };
  });

  const listCustomersMeta = {
    id: 'CUSTOMER_001',
    feature: 'Quản lý khách hàng',
    description: 'Xem danh sách khách hàng',
    steps: '1. Login điều phối\n2. Gọi GET /customers',
    expected: 'API trả 200 và có danh sách khách hàng.'
  };

  let customerSnapshot = [];
  await runCase(listCustomersMeta, async () => {
    const { response, data } = await apiRequest({
      path: '/customers',
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(Array.isArray(data?.data) && data.data.length > 0, 'Danh sách khách hàng rỗng');
    customerSnapshot = data.data;
    return {
      actual: `API trả ${data.data.length} khách hàng hoạt động.`,
      note: 'API: GET /api/v1/customers'
    };
  });

  const createCustomerMeta = {
    id: 'CUSTOMER_002',
    feature: 'Quản lý khách hàng',
    description: 'Tạo khách hàng hợp lệ',
    steps: '1. Gọi POST /customers với dữ liệu hợp lệ duy nhất',
    expected: 'API trả 201 và tạo khách hàng thành công.'
  };

  await runCase(createCustomerMeta, async () => {
    const phoneNumber = `03${String(Date.now()).slice(-8)}`;
    const { response, data } = await apiRequest({
      path: '/customers',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        TenKhachHang: `${context.testData.prefix} Customer`,
        SoDienThoai: phoneNumber,
        DiaChiDon: '45 Bạch Đằng',
        DiaChiTra: 'Bến xe Đà Nẵng',
        TrangThai: 'Hoạt động'
      }
    });
    assert(response.status === 201, `HTTP thực tế ${response.status}`);
    context.createdCustomer = { customerId: data.data.MaKhachHang, phoneNumber };
    return {
      actual: `Tạo khách hàng thành công với MaKhachHang=${data.data.MaKhachHang}.`,
      note: 'API: POST /api/v1/customers'
    };
  });

  const customerMissingMeta = {
    id: 'CUSTOMER_003',
    feature: 'Quản lý khách hàng',
    description: 'Thêm khách hàng thiếu trường bắt buộc',
    steps: '1. Gọi POST /customers với body rỗng',
    expected: 'API trả 400 và fieldErrors cho các trường bắt buộc.'
  };

  await runCase(customerMissingMeta, async () => {
    const { response, data } = await apiRequest({
      path: '/customers',
      method: 'POST',
      token: context.dispatcher.token,
      body: {}
    });
    assert(response.status === 400, `HTTP thực tế ${response.status}`);
    assert(Boolean(data?.data?.fieldErrors?.TenKhachHang), 'Thiếu fieldErrors.TenKhachHang');
    return {
      actual: `API trả 400 với fieldErrors=${toPrettyJson(data.data.fieldErrors)}.`,
      note: 'Validation: backend/src/routes/customers.js'
    };
  });

  const customerInvalidPhoneMeta = {
    id: 'CUSTOMER_004',
    feature: 'Quản lý khách hàng',
    description: 'Validate số điện thoại khách hàng sai định dạng',
    steps: '1. Gọi POST /customers với SoDienThoai không hợp lệ',
    expected: 'API trả 400.'
  };

  await runCase(customerInvalidPhoneMeta, async () => {
    const { response, data } = await apiRequest({
      path: '/customers',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        TenKhachHang: 'Invalid Customer',
        SoDienThoai: '123',
        DiaChiDon: 'A',
        DiaChiTra: 'B'
      }
    });
    assert(response.status === 400, `HTTP thực tế ${response.status}`);
    return {
      actual: `API chặn phone sai định dạng với message="${data.message}".`,
      note: 'Validation: backend/src/routes/customers.js'
    };
  });

  const customerDuplicateMeta = {
    id: 'CUSTOMER_005',
    feature: 'Quản lý khách hàng',
    description: 'Không cho tạo khách hàng trùng số điện thoại',
    steps: '1. Gọi POST /customers với số điện thoại trùng khách QA vừa tạo',
    expected: 'API trả 409 conflict.'
  };

  await runCase(customerDuplicateMeta, async () => {
    assert(context.createdCustomer, 'Chưa có khách hàng test');
    const { response, data } = await apiRequest({
      path: '/customers',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        TenKhachHang: 'Duplicate Customer',
        SoDienThoai: context.createdCustomer.phoneNumber,
        DiaChiDon: 'A',
        DiaChiTra: 'B'
      }
    });
    assert(response.status === 409, `HTTP thực tế ${response.status}`);
    return {
      actual: `API chặn duplicate phone với message="${data.message}".`,
      note: 'Conflict: backend/src/routes/customers.js'
    };
  });

  const customerUpdateMeta = {
    id: 'CUSTOMER_006',
    feature: 'Quản lý khách hàng',
    description: 'Sửa thông tin khách hàng hợp lệ',
    steps: '1. Gọi PUT /customers/:id cho khách QA\n2. Đổi tên và địa chỉ',
    expected: 'API trả 200 và lưu dữ liệu mới.'
  };

  await runCase(customerUpdateMeta, async () => {
    assert(context.createdCustomer, 'Chưa có khách hàng test');
    const { response, data } = await apiRequest({
      path: `/customers/${context.createdCustomer.customerId}`,
      method: 'PUT',
      token: context.dispatcher.token,
      body: {
        TenKhachHang: `${context.testData.prefix} Customer Updated`,
        SoDienThoai: context.createdCustomer.phoneNumber,
        DiaChiDon: '56 Trần Phú',
        DiaChiTra: 'Bến xe Đà Nẵng',
        TrangThai: 'Hoạt động'
      }
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    return {
      actual: `Cập nhật khách hàng thành công, DiaChiDon=${data.data.DiaChiDon}.`,
      note: 'API: PUT /api/v1/customers/:id'
    };
  });

  const customerSearchMeta = {
    id: 'CUSTOMER_007',
    feature: 'Quản lý khách hàng',
    description: 'Tìm kiếm khách hàng theo keyword',
    steps: '1. Gọi GET /customers?keyword=<tên khách QA>',
    expected: 'API trả danh sách đã lọc chứa khách QA.'
  };

  await runCase(customerSearchMeta, async () => {
    const keyword = context.testData.prefix;
    const { response, data } = await apiRequest({
      path: `/customers?keyword=${encodeURIComponent(keyword)}`,
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert((data?.data || []).some((item) => String(item.TenKhachHang || '').includes(keyword)), 'Không tìm thấy khách QA trong kết quả search');
    return {
      actual: `Search keyword "${keyword}" trả ${(data.data || []).length} dòng, có khách QA.`,
      note: 'API: GET /api/v1/customers?keyword='
    };
  });

  const customerDeleteMeta = {
    id: 'CUSTOMER_008',
    feature: 'Quản lý khách hàng',
    description: 'Chuyển khách hàng chưa có vé sang ngừng hoạt động',
    steps: '1. Gọi DELETE /customers/:id cho khách QA chưa có vé nào gắn kèm',
    expected: 'API trả 200 và khách hàng chuyển sang Ngừng hoạt động.'
  };

  await runCase(customerDeleteMeta, async () => {
    assert(context.createdCustomer, 'Chưa có khách hàng test');
    const { response, data } = await apiRequest({
      path: `/customers/${context.createdCustomer.customerId}`,
      method: 'DELETE',
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(data?.data?.TrangThai === 'Ngừng hoạt động', 'Khách hàng chưa chuyển trạng thái ngừng hoạt động');
    return {
      actual: `Khách QA được chuyển sang trạng thái "${data.data.TrangThai}".`,
      note: 'API: DELETE /api/v1/customers/:id'
    };
  });

  const customerDeleteBlockedMeta = {
    id: 'CUSTOMER_009',
    feature: 'Quản lý khách hàng',
    description: 'Không cho ngừng hoạt động khách hàng đã có vé trung chuyển',
    steps: '1. Chọn khách hàng đang có vé trong hệ thống\n2. Gọi DELETE /customers/:id',
    expected: 'API trả 409 conflict.'
  };

  await runCase(customerDeleteBlockedMeta, async () => {
    const ticketOwner = await dbQuery(`
      SELECT TOP 1 k.MaKhachHang
      FROM KhachHang k
      INNER JOIN VeTrungChuyen v ON v.MaKhachHang = k.MaKhachHang
      ORDER BY k.MaKhachHang ASC;
    `);
    const customerId = ticketOwner.recordset[0].MaKhachHang;
    const { response, data } = await apiRequest({
      path: `/customers/${customerId}`,
      method: 'DELETE',
      token: context.dispatcher.token
    });
    assert(response.status === 409, `HTTP thực tế ${response.status}`);
    return {
      actual: `API chặn xóa khách đang có vé với message="${data.message}".`,
      note: 'Delete guard: backend/src/routes/customers.js'
    };
  });

  const resources = await getAvailableResources();
  context.driverWorkflow = resources.drivers[0]
    ? { username: resources.drivers[0].TenDangNhap, password: '123456', driverId: resources.drivers[0].MaTaiXe }
    : null;
  context.driverSecondary = resources.drivers[1]
    ? { username: resources.drivers[1].TenDangNhap, password: '123456', driverId: resources.drivers[1].MaTaiXe }
    : null;

  const vehicleWorkflow = resources.vehicles[0] || null;
  const vehiclePlan = resources.vehicles[1] || null;

  if (!context.driverWorkflow || !context.driverSecondary || !vehicleWorkflow || !vehiclePlan) {
    ensureRiskArea('Thiếu đủ xe/tài xế rảnh để chạy toàn bộ case route/driver workflow');
  }

  const ticketsListMeta = {
    id: 'ROUTE_001',
    feature: 'Vé trung chuyển',
    description: 'Xem danh sách vé cần trung chuyển',
    steps: '1. Gọi GET /tickets?status=Cần trung chuyển với token điều phối',
    expected: 'API trả 200 và có các vé cần trung chuyển.'
  };

  await runCase(ticketsListMeta, async () => {
    const { response, data } = await apiRequest({
      path: `/tickets?status=${encodeURIComponent('Cần trung chuyển')}`,
      token: context.dispatcher.token
    });
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    assert(Array.isArray(data?.data), 'Response tickets không phải mảng');
    return {
      actual: `API trả ${(data.data || []).length} vé cần trung chuyển.`,
      note: 'API: GET /api/v1/tickets'
    };
  });

  const routePlanTicket = await seedRouteTestCustomer({
    fullName: `${context.testData.prefix} Route Plan Customer`,
    phone: `05${String(Date.now()).slice(-8)}`,
    pickup: '45 Bạch Đằng',
    dropoff: 'Bến xe Đà Nẵng'
  });
  const routeWorkflowTicket = await seedRouteTestCustomer({
    fullName: `${context.testData.prefix} Route Workflow Customer`,
    phone: `06${String(Date.now()).slice(-8)}`,
    pickup: '1010 Tiểu La',
    dropoff: 'Bến xe Đà Nẵng'
  });
  const routeMissingTicket = await seedRouteTestCustomer({
    fullName: `${context.testData.prefix} Missing Coords Customer`,
    phone: `07${String(Date.now()).slice(-8)}`,
    pickup: `${context.testData.prefix} Pickup Unknown`,
    dropoff: `${context.testData.prefix} Dropoff Unknown`
  });

  const createRoutePlanMeta = {
    id: 'ROUTE_002',
    feature: 'Lập kế hoạch lộ trình',
    description: 'Tạo route plan hợp lệ từ vé test',
    steps: '1. Chuẩn bị vé test status Cần trung chuyển\n2. Gọi POST /route-plans với xe/tài xế rảnh và thời gian tương lai',
    expected: 'API trả 201, tạo route plan và route legacy thành công.'
  };

  if (!context.driverSecondary || !vehiclePlan) {
    addBlockedCase(createRoutePlanMeta, 'Không đủ tài nguyên xe/tài xế rảnh để tạo route plan test.');
  } else {
    await runCase(createRoutePlanMeta, async () => {
      const response = await apiRequest({
        path: '/route-plans',
        method: 'POST',
        token: context.dispatcher.token,
        body: {
          MaXe: vehiclePlan.MaXe,
          MaTaiXe: context.driverSecondary.driverId,
          ThoiGianBatDau: buildFutureIso(120),
          LoTrinhDuKien: `${routePlanTicket.pickup} -> ${routePlanTicket.dropoff}`,
          GhiChu: `${context.testData.prefix} route plan`,
          ticketIds: [routePlanTicket.ticketId]
        }
      });

      assert(response.response.status === 201, `HTTP thực tế ${response.response.status}`);
      context.routePlan = {
        routeId: response.data.data.route.MaLoTrinh,
        driverId: context.driverSecondary.driverId,
        vehicleId: vehiclePlan.MaXe,
        ticketId: routePlanTicket.ticketId
      };
      return {
        actual: `Tạo route plan thành công, routeId=${context.routePlan.routeId}, planCode=${response.data.data.routePlan.planCode}.`,
        note: 'API: POST /api/v1/route-plans'
      };
    });
  }

  const routePlanMissingTicketMeta = {
    id: 'ROUTE_003',
    feature: 'Lập kế hoạch lộ trình',
    description: 'Tạo route plan thiếu danh sách vé',
    steps: '1. Gọi POST /route-plans với ticketIds=[]',
    expected: 'API trả 400.'
  };

  await runCase(routePlanMissingTicketMeta, async () => {
    const response = await apiRequest({
      path: '/route-plans',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        MaXe: vehiclePlan?.MaXe || 1,
        MaTaiXe: context.driverSecondary?.driverId || 2,
        ThoiGianBatDau: buildFutureIso(90),
        ticketIds: []
      }
    });
    assert(response.response.status === 400, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `API chặn tạo route plan thiếu vé với message="${response.data.message}".`,
      note: 'Validation: backend/src/routes/route-plans.js'
    };
  });

  const routePlanPastTimeMeta = {
    id: 'ROUTE_004',
    feature: 'Lập kế hoạch lộ trình',
    description: 'Không cho tạo route plan với thời gian bắt đầu ở quá khứ',
    steps: '1. Gọi POST /route-plans với ThoiGianBatDau quá khứ',
    expected: 'API trả 400.'
  };

  await runCase(routePlanPastTimeMeta, async () => {
    const response = await apiRequest({
      path: '/route-plans',
      method: 'POST',
      token: context.dispatcher.token,
      body: {
        MaXe: vehiclePlan?.MaXe || 1,
        MaTaiXe: context.driverSecondary?.driverId || 2,
        ThoiGianBatDau: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        ticketIds: [routePlanTicket.ticketId]
      }
    });
    assert(response.response.status === 400, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `API chặn startTime quá khứ với message="${response.data.message}".`,
      note: 'Validation: backend/src/routes/route-plans.js'
    };
  });

  const routeDetailMeta = {
    id: 'ROUTE_005',
    feature: 'Quản lý tuyến/chuyến',
    description: 'Xem chi tiết route plan vừa tạo',
    steps: '1. Gọi GET /routes/:id với route QA vừa tạo',
    expected: 'API trả route, stops và navigationTrip.'
  };

  if (!context.routePlan) {
    addBlockedCase(routeDetailMeta, 'Không có route plan QA do case tạo route plan trước đó không pass.');
  } else {
    await runCase(routeDetailMeta, async () => {
      const response = await apiRequest({
        path: `/routes/${context.routePlan.routeId}`,
        token: context.dispatcher.token
      });
      assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
      assert(Array.isArray(response.data?.data?.stops) && response.data.data.stops.length > 0, 'Chi tiết route không có stops');
      assert(response.data?.data?.navigationTrip, 'Thiếu navigationTrip');
      return {
        actual: `Route detail trả ${response.data.data.stops.length} stop và navigationTrip cho khách ${response.data.data.navigationTrip.customerName}.`,
        note: 'API: GET /api/v1/routes/:id'
      };
    });
  }

  const routePlanBusyVehicleMeta = {
    id: 'ROUTE_006',
    feature: 'Phân công tài xế/xe',
    description: 'Không cho lập route plan với xe đang bận',
    steps: '1. Dùng lại xe của route QA đang pending\n2. Gọi POST /route-plans với vé khác',
    expected: 'API trả 409 conflict.'
  };

  if (!context.routePlan) {
    addBlockedCase(routePlanBusyVehicleMeta, 'Không có route QA pending để tái sử dụng xe bận.');
  } else {
    await runCase(routePlanBusyVehicleMeta, async () => {
      const response = await apiRequest({
        path: '/route-plans',
        method: 'POST',
        token: context.dispatcher.token,
        body: {
          MaXe: context.routePlan.vehicleId,
          MaTaiXe: context.driverWorkflow?.driverId || 1,
          ThoiGianBatDau: buildFutureIso(180),
          ticketIds: [routeWorkflowTicket.ticketId]
        }
      });
      assert(response.response.status === 409, `HTTP thực tế ${response.response.status}`);
      return {
        actual: `API chặn xe bận với message="${response.data.message}".`,
        note: 'Busy vehicle rule: backend/src/routes/route-plans.js'
      };
    });
  }

  const routePlanBusyDriverMeta = {
    id: 'ROUTE_007',
    feature: 'Phân công tài xế/xe',
    description: 'Không cho lập route plan với tài xế đang bận',
    steps: '1. Dùng lại tài xế của route QA đang pending\n2. Gọi POST /route-plans với vé khác',
    expected: 'API trả 409 conflict.'
  };

  if (!context.routePlan) {
    addBlockedCase(routePlanBusyDriverMeta, 'Không có route QA pending để tái sử dụng tài xế bận.');
  } else {
    await runCase(routePlanBusyDriverMeta, async () => {
      const response = await apiRequest({
        path: '/route-plans',
        method: 'POST',
        token: context.dispatcher.token,
        body: {
          MaXe: vehicleWorkflow?.MaXe || 1,
          MaTaiXe: context.routePlan.driverId,
          ThoiGianBatDau: buildFutureIso(200),
          ticketIds: [routeWorkflowTicket.ticketId]
        }
      });
      assert(response.response.status === 409, `HTTP thực tế ${response.response.status}`);
      return {
        actual: `API chặn tài xế bận với message="${response.data.message}".`,
        note: 'Busy driver rule: backend/src/routes/route-plans.js'
      };
    });
  }

  const routeUpdateMeta = {
    id: 'ROUTE_008',
    feature: 'Điều chỉnh lộ trình',
    description: 'Điều phối cập nhật thời gian bắt đầu và ghi chú route pending',
    steps: '1. Gọi PUT /routes/:id cho route QA pending\n2. Đổi thời gian bắt đầu và note',
    expected: 'API trả 200 và lưu dữ liệu mới.'
  };

  if (!context.routePlan) {
    addBlockedCase(routeUpdateMeta, 'Không có route QA pending để update.');
  } else {
    await runCase(routeUpdateMeta, async () => {
      const nextStart = buildFutureIso(240);
      const response = await apiRequest({
        path: `/routes/${context.routePlan.routeId}`,
        method: 'PUT',
        token: context.dispatcher.token,
        body: {
          ThoiGianBatDau: nextStart,
          LoTrinhDuKien: `${routePlanTicket.pickup} -> ${routePlanTicket.dropoff}`,
          GhiChu: `${context.testData.prefix} updated note`,
          TrangThaiLoTrinh: 'Chưa thực hiện'
        }
      });
      assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
      return {
        actual: `Cập nhật route pending thành công, start=${response.data.data.ThoiGianBatDau}.`,
        note: 'API: PUT /api/v1/routes/:id'
      };
    });
  }

  const routeCompleteBlockedMeta = {
    id: 'ROUTE_009',
    feature: 'Quản lý tuyến/chuyến',
    description: 'Không cho chuyển route sang Hoàn thành khi stop chưa xử lý xong',
    steps: '1. Gọi PUT /routes/:id với TrangThaiLoTrinh=Hoàn thành cho route pending còn stop chưa done',
    expected: 'API trả 422.'
  };

  if (!context.routePlan) {
    addBlockedCase(routeCompleteBlockedMeta, 'Không có route QA pending để test complete blocked.');
  } else {
    await runCase(routeCompleteBlockedMeta, async () => {
      const response = await apiRequest({
        path: `/routes/${context.routePlan.routeId}`,
        method: 'PUT',
        token: context.dispatcher.token,
        body: { TrangThaiLoTrinh: 'Hoàn thành' }
      });
      assert(response.response.status === 422, `HTTP thực tế ${response.response.status}`);
      return {
        actual: `API chặn complete sớm với message="${response.data.message}".`,
        note: 'Validation: backend/src/routes/routes.js'
      };
    });
  }

  const directCreateMeta = {
    id: 'ROUTE_010',
    feature: 'Quản lý tuyến/chuyến',
    description: 'Tạo route trực tiếp qua POST /routes',
    steps: '1. Dùng vé test riêng với tài xế/xe rảnh\n2. Gọi POST /routes',
    expected: 'API trả 201 và tạo route legacy thành công.'
  };

  if (!context.driverWorkflow || !vehicleWorkflow) {
    addBlockedCase(directCreateMeta, 'Không đủ driver/vehicle rảnh để tạo route workflow.');
  } else {
    await runCase(directCreateMeta, async () => {
      const response = await apiRequest({
        path: '/routes',
        method: 'POST',
        token: context.dispatcher.token,
        body: {
          MaXe: vehicleWorkflow.MaXe,
          MaTaiXe: context.driverWorkflow.driverId,
          ThoiGianBatDau: buildFutureIso(150),
          GhiChu: `${context.testData.prefix} workflow route`,
          ticketIds: [routeWorkflowTicket.ticketId]
        }
      });
      assert(response.response.status === 201, `HTTP thực tế ${response.response.status}`);
      context.routeWorkflow = {
        routeId: response.data.data.route.MaLoTrinh,
        driverId: context.driverWorkflow.driverId,
        vehicleId: vehicleWorkflow.MaXe,
        ticketId: routeWorkflowTicket.ticketId
      };
      return {
        actual: `Tạo route trực tiếp thành công với routeId=${context.routeWorkflow.routeId}.`,
        note: 'API: POST /api/v1/routes'
      };
    });
  }

  const cancelFutureRouteMeta = {
    id: 'ROUTE_011',
    feature: 'Quản lý tuyến/chuyến',
    description: 'Hủy route pending có thời gian bắt đầu trong tương lai',
    steps: '1. Gọi PUT /routes/:id với TrangThaiLoTrinh=Đã hủy cho route workflow pending tương lai',
    expected: 'API nên trả 200, route chuyển Đã hủy và vé liên quan cập nhật trạng thái.'
  };

  if (!context.routeWorkflow) {
    addBlockedCase(cancelFutureRouteMeta, 'Không có route workflow để test hủy.');
  } else {
    await runCase(cancelFutureRouteMeta, async () => {
      const response = await apiRequest({
        path: `/routes/${context.routeWorkflow.routeId}`,
        method: 'PUT',
        token: context.dispatcher.token,
        body: { TrangThaiLoTrinh: 'Đã hủy' }
      });

      if (response.response.status !== 200) {
        addCriticalFinding(
          'ROUTE_CANCEL_FUTURE_FAIL',
          'Hủy route có start time tương lai bị lỗi 500 do vi phạm CHECK constraint ThoiGianKetThuc >= ThoiGianBatDau.'
        );
        ensureRiskArea('Điều phối chuyến / hủy chuyến tương lai');
        throw Object.assign(new Error('Route cancel future failed'), {
          actual: `API thực tế trả ${response.response.status} với body=${toPrettyJson(response.data)}.`,
          note: 'Root cause nằm ở backend/src/routes/routes.js: nextEndTime tự set về thời điểm hiện tại khi route còn ở tương lai.'
        });
      }

      return {
        actual: `Hủy route workflow thành công, trạng thái hiện tại=${response.data.data.TrangThaiLoTrinh}.`,
        note: 'API: PUT /api/v1/routes/:id'
      };
    });
  }

  const driverRejectMeta = {
    id: 'DAPP_001',
    feature: 'App tài xế',
    description: 'Tài xế từ chối chuyến được phân công khi chuyến còn pending',
    steps: '1. Login tài xế workflow\n2. Gọi PUT /routes/:id với TrangThaiLoTrinh=Đã hủy và ghi chú từ chối',
    expected: 'API nên cho phép tài xế hủy/từ chối chuyến pending được giao và trả 200.'
  };

  if (!context.routeWorkflow || !context.driverWorkflow) {
    addBlockedCase(driverRejectMeta, 'Thiếu route workflow hoặc tài xế workflow.');
  } else {
    await runCase(driverRejectMeta, async () => {
      const driverLogin = await login(context.driverWorkflow.username, context.driverWorkflow.password);
      const driverToken = driverLogin.data.data.accessToken;
      const response = await apiRequest({
        path: `/routes/${context.routeWorkflow.routeId}`,
        method: 'PUT',
        token: driverToken,
        body: {
          TrangThaiLoTrinh: 'Đã hủy',
          GhiChu: `${context.testData.prefix} driver reject`
        }
      });

      if (response.response.status !== 200) {
        addCriticalFinding(
          'DRIVER_REJECT_ROUTE_FAIL',
          'Luồng tài xế từ chối chuyến pending lỗi cùng nguyên nhân với bug hủy route tương lai.'
        );
        ensureRiskArea('Ứng dụng tài xế / từ chối chuyến');
        throw Object.assign(new Error('Driver reject failed'), {
          actual: `API thực tế trả ${response.response.status} với body=${toPrettyJson(response.data)}.`,
          note: 'Front-end DriverTripsPage gọi cùng endpoint PUT /routes/:id nên chức năng từ chối chuyến bị ảnh hưởng.'
        });
      }

      return {
        actual: 'Tài xế từ chối chuyến thành công.',
        note: 'API: PUT /api/v1/routes/:id từ flow DriverTripsPage'
      };
    });
  }

  const driverRouteListMeta = {
    id: 'DAPP_002',
    feature: 'App tài xế',
    description: 'Tài xế xem được danh sách chuyến của chính mình',
    steps: '1. Login tài xế workflow\n2. Gọi GET /routes/by-driver/:driverId',
    expected: 'API trả 200 và có route workflow trong danh sách.'
  };

  await runCase(driverRouteListMeta, async () => {
    assert(context.driverWorkflow, 'Thiếu driver workflow');
    const driverLogin = await login(context.driverWorkflow.username, context.driverWorkflow.password);
    const driverToken = driverLogin.data.data.accessToken;
    const response = await apiRequest({
      path: `/routes/by-driver/${context.driverWorkflow.driverId}`,
      token: driverToken
    });
    assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
    assert((response.data?.data || []).some((item) => item.MaLoTrinh === context.routeWorkflow.routeId), 'Không thấy route workflow trong danh sách chuyến tài xế');
    return {
      actual: `Danh sách chuyến tài xế trả ${(response.data.data || []).length} dòng và có route workflow.`,
      note: 'API: GET /api/v1/routes/by-driver/:driverId'
    };
  });

  const driverOwnRouteDetailMeta = {
    id: 'DAPP_003',
    feature: 'App tài xế',
    description: 'Tài xế xem được chi tiết chuyến của chính mình',
    steps: '1. Login tài xế workflow\n2. Gọi GET /routes/:id với route workflow',
    expected: 'API trả 200.'
  };

  await runCase(driverOwnRouteDetailMeta, async () => {
    assert(context.driverWorkflow && context.routeWorkflow, 'Thiếu context workflow');
    const driverLogin = await login(context.driverWorkflow.username, context.driverWorkflow.password);
    const driverToken = driverLogin.data.data.accessToken;
    const response = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}`,
      token: driverToken
    });
    assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `Tài xế mở được chi tiết route ${context.routeWorkflow.routeId} với ${response.data.data.stops.length} stop.`,
      note: 'API: GET /api/v1/routes/:id'
    };
  });

  const driverOtherRouteDetailMeta = {
    id: 'DAPP_004',
    feature: 'App tài xế',
    description: 'Tài xế không xem được route của tài xế khác',
    steps: '1. Login tài xế workflow\n2. Gọi GET /routes/:id với routePlan của tài xế khác',
    expected: 'API trả 403.'
  };

  if (!context.routePlan) {
    addBlockedCase(driverOtherRouteDetailMeta, 'Thiếu route plan để test cross-driver authorization.');
  } else {
    await runCase(driverOtherRouteDetailMeta, async () => {
      const driverLogin = await login(context.driverWorkflow.username, context.driverWorkflow.password);
      const driverToken = driverLogin.data.data.accessToken;
      const response = await apiRequest({
        path: `/routes/${context.routePlan.routeId}`,
        token: driverToken
      });
      assert(response.response.status === 403, `HTTP thực tế ${response.response.status}`);
      return {
        actual: `API chặn truy cập route của tài xế khác với message="${response.data.message}".`,
        note: 'Authorization check: canAccessRoute'
      };
    });
  }

  const pendingStopBlockedMeta = {
    id: 'DAPP_005',
    feature: 'App tài xế',
    description: 'Không cho cập nhật trạng thái stop khi route còn pending',
    steps: '1. Login tài xế workflow\n2. Gọi PATCH /routes/:routeId/stops/:stopId/status khi route chưa bắt đầu',
    expected: 'API trả 422.'
  };

  await runCase(pendingStopBlockedMeta, async () => {
    assert(context.driverWorkflow && context.routeWorkflow, 'Thiếu context workflow');
    const driverLogin = await login(context.driverWorkflow.username, context.driverWorkflow.password);
    const driverToken = driverLogin.data.data.accessToken;
    const routeDetail = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}`,
      token: driverToken
    });
    const stopId = routeDetail.data.data.stops[0].MaChiTiet;
    const response = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}/stops/${stopId}/status`,
      method: 'PATCH',
      token: driverToken,
      body: { status: 'Đã đến điểm đón' }
    });
    assert(response.response.status === 422, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `API chặn cập nhật stop khi route pending với message="${response.data.message}".`,
      note: 'Validation: backend/src/routes/routes.js PATCH stop status'
    };
  });

  const driverStartRouteMeta = {
    id: 'DAPP_006',
    feature: 'App tài xế',
    description: 'Tài xế bắt đầu chuyến được giao',
    steps: '1. Login tài xế workflow\n2. Gọi PUT /routes/:id với TrangThaiLoTrinh=Đang thực hiện',
    expected: 'API trả 200 và route chuyển sang Đang thực hiện.'
  };

  await runCase(driverStartRouteMeta, async () => {
    const driverLogin = await login(context.driverWorkflow.username, context.driverWorkflow.password);
    const driverToken = driverLogin.data.data.accessToken;
    const response = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}`,
      method: 'PUT',
      token: driverToken,
      body: { TrangThaiLoTrinh: 'Đang thực hiện' }
    });
    assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `Route workflow chuyển sang trạng thái ${response.data.data.TrangThaiLoTrinh}.`,
      note: 'API: PUT /api/v1/routes/:id'
    };
  });

  const driverStopArrivedMeta = {
    id: 'DAPP_007',
    feature: 'App tài xế',
    description: 'Tài xế cập nhật stop sang Đã đến điểm đón',
    steps: '1. Route workflow đã ở trạng thái Đang thực hiện\n2. Gọi PATCH stop status = Đã đến điểm đón',
    expected: 'API trả 200 và trạng thái stop cập nhật.'
  };

  await runCase(driverStopArrivedMeta, async () => {
    const driverLogin = await login(context.driverWorkflow.username, context.driverWorkflow.password);
    const driverToken = driverLogin.data.data.accessToken;
    const routeDetail = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}`,
      token: driverToken
    });
    const stopId = routeDetail.data.data.stops[0].MaChiTiet;
    const response = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}/stops/${stopId}/status`,
      method: 'PATCH',
      token: driverToken,
      body: { status: 'Đã đến điểm đón' }
    });
    assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `Stop ${stopId} được cập nhật sang Đã đến điểm đón.`,
      note: 'API: PATCH /api/v1/routes/:routeId/stops/:stopId/status'
    };
  });

  const driverStopPickedMeta = {
    id: 'DAPP_008',
    feature: 'App tài xế',
    description: 'Tài xế cập nhật stop sang Đã đón khách',
    steps: '1. Gọi PATCH stop status = Đã đón khách cho stop workflow',
    expected: 'API trả 200 và vé chuyển sang Đang trung chuyển.'
  };

  await runCase(driverStopPickedMeta, async () => {
    const driverLogin = await login(context.driverWorkflow.username, context.driverWorkflow.password);
    const driverToken = driverLogin.data.data.accessToken;
    const routeDetail = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}`,
      token: driverToken
    });
    const stop = routeDetail.data.data.stops[0];
    const response = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}/stops/${stop.MaChiTiet}/status`,
      method: 'PATCH',
      token: driverToken,
      body: { status: 'Đã đón khách' }
    });
    assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
    const ticketCheck = await dbQuery(
      'SELECT TrangThaiVe FROM VeTrungChuyen WHERE MaVe = @ticketId',
      { ticketId: { type: sql.Int, value: stop.MaVe } }
    );
    assert(ticketCheck.recordset[0].TrangThaiVe === 'Đang trung chuyển', `TrangThaiVe thực tế ${ticketCheck.recordset[0].TrangThaiVe}`);
    return {
      actual: `Stop được cập nhật Đã đón khách và vé ${stop.MaVe} chuyển sang "Đang trung chuyển".`,
      note: 'API + DB persistence VeTrungChuyen'
    };
  });

  const driverStopDroppedMeta = {
    id: 'DAPP_009',
    feature: 'App tài xế',
    description: 'Tài xế cập nhật stop cuối cùng sang Đã trả khách và route auto complete',
    steps: '1. Gọi PATCH stop status = Đã trả khách cho stop cuối cùng duy nhất\n2. Kiểm tra response routeAutoCompleted',
    expected: 'API trả 200, stop cập nhật và route tự chuyển Hoàn thành.'
  };

  await runCase(driverStopDroppedMeta, async () => {
    const driverLogin = await login(context.driverWorkflow.username, context.driverWorkflow.password);
    const driverToken = driverLogin.data.data.accessToken;
    const routeDetail = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}`,
      token: driverToken
    });
    const stop = routeDetail.data.data.stops[0];
    const response = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}/stops/${stop.MaChiTiet}/status`,
      method: 'PATCH',
      token: driverToken,
      body: { status: 'Đã trả khách' }
    });
    assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
    assert(response.data?.data?.routeAutoCompleted === true, 'routeAutoCompleted != true');
    const routeCheck = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}`,
      token: context.dispatcher.token
    });
    assert(routeCheck.data.data.route.TrangThaiLoTrinh === 'Hoàn thành', `Route status thực tế ${routeCheck.data.data.route.TrangThaiLoTrinh}`);
    return {
      actual: `Stop cuối được trả khách, route ${context.routeWorkflow.routeId} auto-complete thành Hoàn thành.`,
      note: 'API: PATCH stop status -> auto complete route'
    };
  });

  const mapCoordsMeta = {
    id: 'MAP_001',
    feature: 'Map chỉ đường',
    description: 'Route detail có tọa độ hợp lệ cho route workflow',
    steps: '1. Gọi GET /routes/:id cho route workflow\n2. Kiểm tra pickupLat/pickupLng/dropoffLat/dropoffLng',
    expected: 'navigationTrip trả tọa độ hợp lệ khác null.'
  };

  await runCase(mapCoordsMeta, async () => {
    const response = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}`,
      token: context.dispatcher.token
    });
    const navigationTrip = response.data.data.navigationTrip;
    assert(navigationTrip.pickupLat != null && navigationTrip.pickupLng != null, 'Pickup coordinates null');
    assert(navigationTrip.dropoffLat != null && navigationTrip.dropoffLng != null, 'Dropoff coordinates null');
    return {
      actual: `navigationTrip có pickup=(${navigationTrip.pickupLat}, ${navigationTrip.pickupLng}) và dropoff=(${navigationTrip.dropoffLat}, ${navigationTrip.dropoffLng}).`,
      note: 'API: GET /api/v1/routes/:id + lookupAddressCoordinates'
    };
  });

  const mapOsrmMeta = {
    id: 'MAP_002',
    feature: 'Map chỉ đường',
    description: 'Gọi OSRM public API cho route workflow thành công',
    steps: '1. Lấy tọa độ pickup/dropoff của route workflow\n2. Gọi trực tiếp OSRM route/v1/driving',
    expected: 'OSRM trả code Ok và có geometry.'
  };

  await runCase(mapOsrmMeta, async () => {
    const detail = await apiRequest({
      path: `/routes/${context.routeWorkflow.routeId}`,
      token: context.dispatcher.token
    });
    const trip = detail.data.data.navigationTrip;
    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving/${trip.pickupLng},${trip.pickupLat};${trip.dropoffLng},${trip.dropoffLat}?overview=full&geometries=geojson&steps=true`;
    const response = await fetch(osrmUrl, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    assert(response.ok, `HTTP OSRM thực tế ${response.status}`);
    assert(data.code === 'Ok', `OSRM code thực tế ${data.code}`);
    assert(Array.isArray(data.routes) && data.routes.length > 0, 'OSRM không trả routes');
    return {
      actual: `OSRM trả Ok với distance=${Math.round((data.routes[0].distance || 0) / 1000)}km và duration=${Math.round((data.routes[0].duration || 0) / 60)} phút.`,
      note: 'External API: router.project-osrm.org'
    };
  });

  const directMissingRouteMeta = {
    id: 'MAP_003',
    feature: 'Map chỉ đường',
    description: 'Tạo route với địa chỉ không map được để kiểm tra thiếu tọa độ',
    steps: '1. Sau khi route workflow hoàn thành, tạo route mới từ vé test địa chỉ unknown\n2. Gọi GET /routes/:id',
    expected: 'Route detail trả navigationTrip có lat/lng null.'
  };

  if (!context.driverWorkflow || !vehicleWorkflow) {
    addBlockedCase(directMissingRouteMeta, 'Thiếu tài nguyên workflow để tạo route missing coords.');
  } else {
    await runCase(directMissingRouteMeta, async () => {
      const create = await apiRequest({
        path: '/routes',
        method: 'POST',
        token: context.dispatcher.token,
        body: {
          MaXe: vehicleWorkflow.MaXe,
          MaTaiXe: context.driverWorkflow.driverId,
          ThoiGianBatDau: buildFutureIso(300),
          GhiChu: `${context.testData.prefix} missing coords route`,
          ticketIds: [routeMissingTicket.ticketId]
        }
      });
      assert(create.response.status === 201, `HTTP create thực tế ${create.response.status}`);
      context.routeMissingCoords = {
        routeId: create.data.data.route.MaLoTrinh,
        driverId: context.driverWorkflow.driverId
      };

      const detail = await apiRequest({
        path: `/routes/${context.routeMissingCoords.routeId}`,
        token: context.dispatcher.token
      });
      const trip = detail.data.data.navigationTrip;
      assert(trip.pickupLat == null && trip.pickupLng == null, 'Pickup coords không null như kỳ vọng');
      assert(trip.dropoffLat == null && trip.dropoffLng == null, 'Dropoff coords không null như kỳ vọng');
      return {
        actual: `Route missing coords tạo thành công với routeId=${context.routeMissingCoords.routeId}; navigationTrip trả toàn bộ tọa độ null.`,
        note: 'API: POST /routes + GET /routes/:id'
      };
    });
  }

  const reportsSuccessMeta = {
    id: 'API_001',
    feature: 'Báo cáo tổng hợp',
    description: 'Lấy báo cáo tổng hợp thành công',
    steps: '1. Login điều phối\n2. Gọi GET /reports/summary',
    expected: 'API trả 200 và danh sách báo cáo.'
  };

  await runCase(reportsSuccessMeta, async () => {
    const response = await apiRequest({
      path: '/reports/summary',
      token: context.dispatcher.token
    });
    assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
    assert(Array.isArray(response.data?.data), 'Báo cáo không phải mảng');
    return {
      actual: `API báo cáo trả ${response.data.data.length} bản ghi.`,
      note: 'API: GET /api/v1/reports/summary'
    };
  });

  const reportsInvalidDateMeta = {
    id: 'API_002',
    feature: 'Báo cáo tổng hợp',
    description: 'Validate khoảng ngày báo cáo không hợp lệ',
    steps: '1. Gọi GET /reports/summary?fromDate=2026-05-01&toDate=2026-04-01',
    expected: 'API trả 400.'
  };

  await runCase(reportsInvalidDateMeta, async () => {
    const response = await apiRequest({
      path: '/reports/summary?fromDate=2026-05-01&toDate=2026-04-01',
      token: context.dispatcher.token
    });
    assert(response.response.status === 400, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `API chặn khoảng ngày sai với message="${response.data.message}".`,
      note: 'Validation: backend/src/routes/reports.js'
    };
  });

  const responseSchemaMeta = {
    id: 'API_003',
    feature: 'API Backend',
    description: 'Success response wrapper tuân theo schema success/message/data/errorCode',
    steps: '1. Gọi POST /auth/login thành công\n2. Kiểm tra keys trong JSON',
    expected: 'Response chứa đủ success, message, data, errorCode.'
  };

  await runCase(responseSchemaMeta, async () => {
    const { response, data } = await login(context.dispatcher.username, context.dispatcher.password);
    assert(response.status === 200, `HTTP thực tế ${response.status}`);
    ['success', 'message', 'data', 'errorCode'].forEach((key) => {
      assert(Object.prototype.hasOwnProperty.call(data, key), `Thiếu key ${key}`);
    });
    return {
      actual: `Response wrapper hợp lệ với keys=${Object.keys(data).join(', ')}.`,
      note: 'HTTP helper: backend/src/utils/http.js'
    };
  });

  const invalidIdMeta = {
    id: 'API_004',
    feature: 'API Backend',
    description: 'API detail validate ID không hợp lệ',
    steps: '1. Gọi GET /customers/abc',
    expected: 'API trả 400.'
  };

  await runCase(invalidIdMeta, async () => {
    const response = await apiRequest({
      path: '/customers/abc',
      token: context.dispatcher.token
    });
    assert(response.response.status === 400, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `API chặn id không hợp lệ với message="${response.data.message}".`,
      note: 'Validation: backend/src/routes/customers.js'
    };
  });

  const routesListForbiddenMeta = {
    id: 'API_005',
    feature: 'API Backend',
    description: 'Tài xế không truy cập được danh sách tổng hợp routes',
    steps: '1. Login tài xế\n2. Gọi GET /routes',
    expected: 'API trả 403.'
  };

  await runCase(routesListForbiddenMeta, async () => {
    const driverLogin = await login('taixe1', '123456');
    const response = await apiRequest({
      path: '/routes',
      token: driverLogin.data.data.accessToken
    });
    assert(response.response.status === 403, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `API chặn driver xem /routes với message="${response.data.message}".`,
      note: 'Authorization: backend/src/routes/routes.js GET /routes'
    };
  });

  const driverDisableBusyMeta = {
    id: 'DRIVER_007',
    feature: 'Quản lý tài xế',
    description: 'Không cho ngừng hoạt động tài xế đang được phân công',
    steps: '1. Dùng tài xế của route plan đang pending\n2. Gọi DELETE /drivers/:id',
    expected: 'API trả 409 conflict.'
  };

  if (!context.routePlan) {
    addBlockedCase(driverDisableBusyMeta, 'Không có tài xế bận QA để test disable blocked.');
  } else {
    await runCase(driverDisableBusyMeta, async () => {
      const response = await apiRequest({
        path: `/drivers/${context.routePlan.driverId}`,
        method: 'DELETE',
        token: context.dispatcher.token
      });
      assert(response.response.status === 409, `HTTP thực tế ${response.response.status}`);
      return {
        actual: `API chặn disable tài xế bận với message="${response.data.message}".`,
        note: 'Rule: assertDriverCanBeDisabled trong backend/src/routes/drivers.js'
      };
    });
  }

  const driverDisableIdleMeta = {
    id: 'DRIVER_008',
    feature: 'Quản lý tài xế',
    description: 'Ngừng hoạt động tài xế QA sau khi test xong',
    steps: '1. Gọi DELETE /drivers/:id cho tài xế QA không gắn route',
    expected: 'API trả 200 và tài xế chuyển sang ngừng hoạt động.'
  };

  await runCase(driverDisableIdleMeta, async () => {
    assert(context.createdDriver, 'Chưa có tài xế QA');
    const response = await apiRequest({
      path: `/drivers/${context.createdDriver.driverId}`,
      method: 'DELETE',
      token: context.dispatcher.token
    });
    assert(response.response.status === 200, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `Tài xế QA được chuyển sang trạng thái ${response.data.data.TrangThaiTaiXe}.`,
      note: 'API: DELETE /api/v1/drivers/:id'
    };
  });

  const driverRoleBlockedMeta = {
    id: 'DRIVER_009',
    feature: 'Quản lý tài xế',
    description: 'Tài xế không truy cập được API danh sách drivers',
    steps: '1. Login taixe1\n2. Gọi GET /drivers',
    expected: 'API trả 403.'
  };

  await runCase(driverRoleBlockedMeta, async () => {
    const driverLogin = await login('taixe1', '123456');
    const response = await apiRequest({
      path: '/drivers',
      token: driverLogin.data.data.accessToken
    });
    assert(response.response.status === 403, `HTTP thực tế ${response.response.status}`);
    return {
      actual: `API chặn tài xế truy cập /drivers với message="${response.data.message}".`,
      note: 'Route mount requireRole(DISPATCHER_ROLE)'
    };
  });

  const dbVehicleConstraintMeta = {
    id: 'DB_001',
    feature: 'Database constraints',
    description: 'Constraint chặn xe có số chỗ < 4',
    steps: '1. Thực thi INSERT trực tiếp vào XeTrungChuyen với SoCho=3 trong transaction test',
    expected: 'SQL Server chặn bởi CK_XeTrungChuyen_SoCho.'
  };

  await runCase(dbVehicleConstraintMeta, async () => {
    let transaction;
    try {
      const pool = await getDbPool();
      transaction = new sql.Transaction(pool);
      await transaction.begin();
      await new sql.Request(transaction)
        .input('BienSo', sql.VarChar(20), `99A-${String(Date.now()).slice(-5)}`)
        .input('LoaiXe', sql.NVarChar(50), 'Xe 4 chỗ')
        .input('SoCho', sql.Int, 3)
        .input('TrangThaiXe', sql.NVarChar(30), 'Rảnh')
        .query(`
          INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe)
          VALUES (@BienSo, @LoaiXe, @SoCho, @TrangThaiXe)
        `);
      throw Object.assign(new Error('INSERT sai constraint nhưng không bị chặn'), {
        actual: 'DB cho phép insert XeTrungChuyen với SoCho=3.',
        note: 'Constraint expected: CK_XeTrungChuyen_SoCho'
      });
    } catch (error) {
      const message = String(error.message || '');
      if (!/CK_XeTrungChuyen_SoCho/i.test(message)) {
        throw error;
      }
      return {
        actual: `SQL Server chặn insert sai constraint với message chứa CK_XeTrungChuyen_SoCho.`,
        note: 'Database: database/database.sql'
      };
    } finally {
      if (transaction && transaction._aborted !== true) {
        await transaction.rollback().catch(() => {});
      }
    }
  });

  const dbTicketConstraintMeta = {
    id: 'DB_002',
    feature: 'Database constraints',
    description: 'Constraint chặn vé có số lượng ghế > 10',
    steps: '1. Tạo customer tạm trong transaction\n2. INSERT VeTrungChuyen với SoLuongGhe=11',
    expected: 'SQL Server chặn bởi CK_VeTrungChuyen_SoLuongGhe.'
  };

  await runCase(dbTicketConstraintMeta, async () => {
    let transaction;
    try {
      const pool = await getDbPool();
      transaction = new sql.Transaction(pool);
      await transaction.begin();
      const customer = await new sql.Request(transaction)
        .input('TenKhachHang', sql.NVarChar(100), `${context.testData.prefix} DB Constraint`)
        .input('SoDienThoai', sql.VarChar(15), `01${String(Date.now()).slice(-8)}`)
        .input('DiaChiDon', sql.NVarChar(255), 'A')
        .input('DiaChiTra', sql.NVarChar(255), 'B')
        .input('TrangThai', sql.NVarChar(30), 'Hoạt động')
        .query(`
          INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai)
          OUTPUT INSERTED.MaKhachHang
          VALUES (@TenKhachHang, @SoDienThoai, @DiaChiDon, @DiaChiTra, @TrangThai)
        `);

      await new sql.Request(transaction)
        .input('KhungGioTrungChuyen', sql.NVarChar(100), '08:00 - 09:00')
        .input('SoLuongGhe', sql.Int, 11)
        .input('TrangThaiVe', sql.NVarChar(50), 'Cần trung chuyển')
        .input('MaKhachHang', sql.Int, customer.recordset[0].MaKhachHang)
        .query(`
          INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang)
          VALUES (@KhungGioTrungChuyen, @SoLuongGhe, @TrangThaiVe, @MaKhachHang)
        `);
      throw Object.assign(new Error('INSERT vé sai constraint nhưng không bị chặn'), {
        actual: 'DB cho phép insert VeTrungChuyen với SoLuongGhe=11.',
        note: 'Constraint expected: CK_VeTrungChuyen_SoLuongGhe'
      });
    } catch (error) {
      const message = String(error.message || '');
      if (!/CK_VeTrungChuyen_SoLuongGhe/i.test(message)) {
        throw error;
      }
      return {
        actual: 'SQL Server chặn insert vé sai constraint với CK_VeTrungChuyen_SoLuongGhe.',
        note: 'Database: database/database.sql'
      };
    } finally {
      if (transaction && transaction._aborted !== true) {
        await transaction.rollback().catch(() => {});
      }
    }
  });

  const dbRouteConstraintMeta = {
    id: 'DB_003',
    feature: 'Database constraints',
    description: 'Constraint chặn route có thời gian kết thúc nhỏ hơn thời gian bắt đầu',
    steps: '1. UPDATE thử một route trong transaction với ThoiGianKetThuc < ThoiGianBatDau',
    expected: 'SQL Server chặn bởi CK_LoTrinh_TrungChuyen_ThoiGian.'
  };

  await runCase(dbRouteConstraintMeta, async () => {
    let transaction;
    try {
      const pool = await getDbPool();
      transaction = new sql.Transaction(pool);
      await transaction.begin();
      await new sql.Request(transaction).query(`
        UPDATE TOP (1) LoTrinhTrungChuyen
        SET ThoiGianKetThuc = DATEADD(MINUTE, -30, ThoiGianBatDau)
      `);
      throw Object.assign(new Error('UPDATE route sai constraint nhưng không bị chặn'), {
        actual: 'DB cho phép cập nhật route với end < start.',
        note: 'Constraint expected: CK_LoTrinh_TrungChuyen_ThoiGian'
      });
    } catch (error) {
      const message = String(error.message || '');
      if (!/CK_LoTrinh_TrungChuyen_ThoiGian/i.test(message)) {
        throw error;
      }
      return {
        actual: 'SQL Server chặn cập nhật route sai constraint với CK_LoTrinh_TrungChuyen_ThoiGian.',
        note: 'Database: database/database.sql'
      };
    } finally {
      if (transaction && transaction._aborted !== true) {
        await transaction.rollback().catch(() => {});
      }
    }
  });

  fs.writeFileSync(
    CONTEXT_PATH,
    JSON.stringify(
      {
        dispatcher: {
          username: context.dispatcher.username,
          password: context.dispatcher.password
        },
        driverWorkflow: context.driverWorkflow,
        routeWorkflow: context.routeWorkflow,
        routeMissingCoords: context.routeMissingCoords,
        environment: environmentMeta
      },
      null,
      2
    ),
    'utf8'
  );

  await runPlaywrightUiTests();

  addNotRunCase(
    {
      id: 'UI_007',
      feature: 'UI/UX',
      description: 'Kiểm tra đầy đủ loading state trên toàn bộ modal CRUD dispatcher',
      steps: '1. Trigger từng modal add/edit/delete của Customers/Drivers/Vehicles\n2. Theo dõi loading state trên nhiều đường lỗi/thành công',
      expected: 'Mọi modal đều có loading state, disabled state và rollback UI ổn định.'
    },
    'Đợt này mới cover loading state gián tiếp qua API/UI flows chính; chưa exhaust hết mọi modal và mọi nhánh giao diện.'
  );

  addNotRunCase(
    {
      id: 'UI_008',
      feature: 'Responsive UI',
      description: 'Kiểm tra responsive toàn bộ màn hình dispatcher trên nhiều breakpoint',
      steps: '1. Test desktop/tablet/mobile cho overview/plan/adjust/track/reports\n2. Kiểm tra overflow, wrap và khả năng thao tác',
      expected: 'Layout không vỡ và thao tác được trên các breakpoint mục tiêu.'
    },
    'Đã test cơ bản màn login ở mobile; chưa chạy full matrix viewport cho toàn bộ dashboard dispatcher.'
  );

  addNotRunCase(
    {
      id: 'MAP_008',
      feature: 'Map chỉ đường',
      description: 'Kiểm tra timeout mạng thật của OSRM thay vì mô phỏng 500/intercept',
      steps: '1. Giảm mạng hoặc chặn timeout thật với router.project-osrm.org\n2. Mở chi tiết chuyến có tọa độ',
      expected: 'UI hiển thị lỗi phù hợp và không treo giao diện.'
    },
    'Đợt này đã test lỗi OSRM bằng intercept 500 trên UI; chưa inject timeout mạng thật ở mức hệ điều hành.'
  );

  addNotRunCase(
    {
      id: 'SEC_001',
      feature: 'Authentication & Authorization',
      description: 'Kiểm tra khóa tạm thời tài khoản sau 5 lần đăng nhập sai',
      steps: '1. Tạo hoặc dùng account test riêng\n2. Đăng nhập sai liên tiếp >= 5 lần\n3. Xác minh lock 15 phút và unlock sau timeout',
      expected: 'API trả 423 sau khi quá số lần sai và tự mở khóa đúng thời gian.'
    },
    'Chưa thực thi vì lock timeout 15 phút sẽ kéo dài phiên kiểm thử hiện tại; cần batch riêng để không ảnh hưởng tiến độ.'
  );
}

function writeCsv() {
  const headers = [
    'TC ID',
    '[Tên Chức Năng]',
    'Mô tả',
    'Bước thực hiện',
    'Kết quả mong đợi',
    'Kết quả thực tế',
    'Trạng thái',
    'Ghi chú'
  ];

  const lines = [
    headers.map(csvEscape).join(','),
    ...results.map((row) =>
      headers
        .map((header) => csvEscape(row[header]))
        .join(',')
    )
  ];

  fs.writeFileSync(TEST_REPORT_CSV_PATH, `\uFEFF${lines.join('\n')}`, 'utf8');
}

function writeSummary() {
  const total = results.length;
  const pass = countByStatus('PASS');
  const fail = countByStatus('FAIL');
  const blocked = countByStatus('BLOCKED');
  const notRun = countByStatus('NOT RUN');

  const summaryLines = [
    '# Test Summary',
    '',
    `- Ngày chạy: ${new Date().toLocaleString('vi-VN')}`,
    `- Tổng số test case: ${total}`,
    `- PASS: ${pass}`,
    `- FAIL: ${fail}`,
    `- BLOCKED: ${blocked}`,
    `- NOT RUN: ${notRun}`,
    '',
    '## Lỗi nghiêm trọng',
    summary.criticalFindings.length
      ? summary.criticalFindings.map((item) => `- ${item.id}: ${item.message}`).join('\n')
      : '- Không ghi nhận lỗi mức Critical trong đợt chạy này.',
    '',
    '## Chức năng rủi ro cao',
    summary.highRiskAreas.length
      ? summary.highRiskAreas.map((item) => `- ${item}`).join('\n')
      : '- Chưa ghi nhận vùng rủi ro cao ngoài các case fail hiện tại.',
    '',
    '## Đề xuất ưu tiên sửa lỗi',
    '- Ưu tiên sửa bug hủy chuyến/từ chối chuyến có thời gian bắt đầu trong tương lai vì đang chặn cả điều phối viên lẫn tài xế.',
    '- Loại bỏ phụ thuộc `maps.google.com` ở `TrackStatusPage` để thống nhất với stack Leaflet/OpenStreetMap hiện tại.',
    '- Chạy lại regression cho luồng route sau khi sửa bug cancel để xác nhận đồng bộ vé, xe, tài xế và projection route_plans.'
  ];

  fs.writeFileSync(TEST_SUMMARY_MD_PATH, `${summaryLines.join('\n')}\n`, 'utf8');
}

async function shutdown() {
  await stopOtpBackend().catch(() => {});
  if (dbPool) {
    await dbPool.close().catch(() => {});
    dbPool = null;
  }
}

main()
  .then(() => {
    writeCsv();
    writeSummary();
  })
  .catch((error) => {
    pushResult(
      {
        id: 'HARNESS_001',
        feature: 'QA Harness',
        description: 'Harness tạo báo cáo tổng thể',
        steps: '1. Chạy scripts/qa/generate_test_report.js',
        expected: 'Script hoàn tất và sinh báo cáo.'
      },
      {
        status: 'FAIL',
        actual: error.stack || error.message || 'Harness failed.',
        note: 'Lỗi ở script tạo report.'
      }
    );
    writeCsv();
    writeSummary();
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdown();
  });
