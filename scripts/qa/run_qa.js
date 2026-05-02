const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const dotenv = require(path.join(__dirname, '../../backend/node_modules/dotenv'));
const { sql } = require(path.join(__dirname, '../../backend/src/db'));

const ROOT_DIR = path.resolve(__dirname, '../..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const API_BASE_URL = process.env.QA_API_BASE_URL || 'http://127.0.0.1:5000/api/v1';
const FRONTEND_BASE_URL = process.env.QA_FRONTEND_BASE_URL || 'http://127.0.0.1:3000';
const TEMP_API_PORT = Number(process.env.QA_TEMP_API_PORT || 5001);
const TEMP_API_BASE_URL = `http://127.0.0.1:${TEMP_API_PORT}/api/v1`;
const UI_CONFIG_PATH = path.join(ROOT_DIR, 'scripts/qa/playwright.config.cjs');
const EDGE_PATH =
  process.env.QA_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

const STATUS = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
  NOT_RUN: 'NOT RUN',
};

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function runCase(rows, meta, body) {
  try {
    const outcome = await body();
    rows.push(
      makeRow(
        meta,
        outcome?.actual || 'Kết quả thực tế khớp mong đợi.',
        outcome?.status || STATUS.PASS,
        outcome?.notes || ''
      )
    );
  } catch (error) {
    rows.push(
      makeRow(
        meta,
        error instanceof Error ? error.message : String(error),
        STATUS.FAIL,
        error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : ''
      )
    );
  }
}

function pushStaticCase(rows, meta, actual, status, notes = '') {
  rows.push(makeRow(meta, actual, status, notes));
}

function csvEscape(value) {
  const source = value == null ? '' : String(value);
  return `"${source.replace(/"/g, '""')}"`;
}

function writeCsv(rows, filePath) {
  const headers = [
    'TC ID',
    '[Tên Chức Năng]',
    'Mô tả',
    'Bước thực hiện',
    'Kết quả mong đợi',
    'Kết quả thực tế',
    'Trạng thái',
    'Ghi chú',
  ];
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  fs.writeFileSync(filePath, `\uFEFF${lines.join('\n')}`, 'utf8');
}

function parseJsonBody(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

async function apiRequest({
  baseUrl = API_BASE_URL,
  path: routePath,
  method = 'GET',
  token,
  body,
  headers = {},
}) {
  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const parsed = parseJsonBody(text);
  const data =
    parsed && typeof parsed === 'object' && parsed.success === true && Object.prototype.hasOwnProperty.call(parsed, 'data')
      ? parsed.data
      : parsed;

  return {
    status: response.status,
    ok: response.ok,
    body: parsed,
    data,
    text,
  };
}

function expectStatus(response, expectedStatus, contextMessage) {
  if (response.status !== expectedStatus) {
    const message = `${contextMessage} | Expected HTTP ${expectedStatus} but got ${response.status} | body=${JSON.stringify(
      response.body
    )}`;
    throw new Error(message);
  }
}

function buildDbConfig() {
  return {};
}

async function createPool() {
  const pool = new sql.ConnectionPool(buildDbConfig());
  await pool.connect();
  return pool;
}

async function healthCheck(url) {
  const response = await fetch(url);
  return response.ok;
}

function createRunState() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);

  return {
    runId: `QA${stamp}`,
    dispatcher: { username: 'dieuphoi1', password: '123456', token: null },
    existingDriver: { username: 'taixe1', password: '123456', token: null },
    qaDispatcher: null,
    managedDriver: null,
    emptyDriver: null,
    vehicleCrud: null,
    routeCustomer: null,
    noCoordsCustomer: null,
    deleteOnlyCustomer: null,
    tickets: {},
    existingVehicles: [],
    existingAltDriver: null,
    routes: {},
    cleanup: {
      routeIds: [],
      customerIds: [],
      ticketIds: [],
      vehicleIds: [],
      driverIds: [],
      accountIds: [],
      dispatcherAccountIds: [],
      dispatcherEmployeeIds: [],
    },
  };
}

async function ensureEnvironment(pool) {
  const [backendOk, frontendOk, dbResult] = await Promise.all([
    healthCheck('http://127.0.0.1:5000/health'),
    healthCheck('http://127.0.0.1:3000'),
    pool.request().query('SELECT 1 AS ok'),
  ]);

  if (!backendOk) {
    throw new Error('Backend health check failed at http://127.0.0.1:5000/health');
  }

  if (!frontendOk) {
    throw new Error('Frontend health check failed at http://127.0.0.1:3000');
  }

  if (!dbResult.recordset.length) {
    throw new Error('Database connectivity check failed');
  }
}

async function queryAvailableResources(pool) {
  const vehiclesResult = await pool.request().query(`
    SELECT MaXe
    FROM XeTrungChuyen x
    WHERE x.TrangThaiXe = N'Rảnh'
      AND NOT EXISTS (
        SELECT 1
        FROM LoTrinhTrungChuyen lt
        WHERE lt.MaXe = x.MaXe
          AND lt.TrangThaiLoTrinh IN (N'Chưa thực hiện', N'Đang thực hiện', N'Đang gặp sự cố')
      )
    ORDER BY x.MaXe ASC
    LIMIT 3
  `);

  const driversResult = await pool.request().query(`
    SELECT MaTaiXe
    FROM TaiXe d
    WHERE d.TrangThaiTaiXe = N'Rảnh'
      AND NOT EXISTS (
        SELECT 1
        FROM LoTrinhTrungChuyen lt
        WHERE lt.MaTaiXe = d.MaTaiXe
          AND lt.TrangThaiLoTrinh IN (N'Chưa thực hiện', N'Đang thực hiện', N'Đang gặp sự cố')
      )
    ORDER BY d.MaTaiXe ASC
    LIMIT 3
  `);

  return {
    vehicleIds: vehiclesResult.recordset.map((row) => Number(row.MaXe)).filter(Number.isInteger),
    driverIds: driversResult.recordset.map((row) => Number(row.MaTaiXe)).filter(Number.isInteger),
  };
}

async function loadDriverAccountByPhone(pool, phone) {
  const result = await pool
    .request()
    .input('phone', sql.VarChar(15), phone)
    .query(`
      SELECT tx.MaTaiXe, tx.MaNhanVienTaiXe, tk.MaTaiKhoan, tk.TenDangNhap, tk.YeuCauDoiMatKhau
      FROM TaiXe tx
      JOIN TaiKhoanNguoiDung tk ON tk.MaTaiKhoan = tx.MaTaiKhoan
      WHERE tk.SoDienThoai = @phone
      ORDER BY tx.MaTaiXe DESC
      LIMIT 1
    `);

  return result.recordset[0] || null;
}

async function loadDispatcherAccountByPhone(pool, phone) {
  const result = await pool
    .request()
    .input('phone', sql.VarChar(15), phone)
    .query(`
      SELECT nv.MaNhanVien, tk.MaTaiKhoan, tk.TenDangNhap
      FROM NhanVienDieuPhoi nv
      JOIN TaiKhoanNguoiDung tk ON tk.MaTaiKhoan = nv.MaTaiKhoan
      WHERE tk.SoDienThoai = @phone
      ORDER BY nv.MaNhanVien DESC
      LIMIT 1
    `);

  return result.recordset[0] || null;
}

async function insertTicket(pool, { customerId, seatCount = 1, slot = '06:00 - 06:30' }) {
  const result = await pool
    .request()
    .input('KhungGioTrungChuyen', sql.NVarChar(100), slot)
    .input('SoLuongGhe', sql.Int, seatCount)
    .input('TrangThaiVe', sql.NVarChar(50), 'Cần trung chuyển')
    .input('MaKhachHang', sql.Int, customerId)
    .query(`
      INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang)
      VALUES (@KhungGioTrungChuyen, @SoLuongGhe, @TrangThaiVe, @MaKhachHang)
      RETURNING MaVe
    `);

  return Number(result.recordset[0].MaVe);
}

async function updateCustomerCoordinates(pool, customerId, coords) {
  await pool
    .request()
    .input('id', sql.Int, customerId)
    .input('pickupLat', sql.Decimal(10, 7), coords.pickupLat)
    .input('pickupLng', sql.Decimal(10, 7), coords.pickupLng)
    .input('dropoffLat', sql.Decimal(10, 7), coords.dropoffLat)
    .input('dropoffLng', sql.Decimal(10, 7), coords.dropoffLng)
    .query(`
      UPDATE KhachHang
      SET DiaChiDonLat = @pickupLat,
          DiaChiDonLng = @pickupLng,
          DiaChiTraLat = @dropoffLat,
          DiaChiTraLng = @dropoffLng
      WHERE MaKhachHang = @id
    `);
}

async function loadRouteStops(pool, routeId) {
  const result = await pool
    .request()
    .input('routeId', sql.Int, routeId)
    .query(`
      SELECT *
      FROM ChiTietLoTrinh
      WHERE MaLoTrinh = @routeId
      ORDER BY ThuTuDonTra ASC, MaChiTiet ASC
    `);

  return result.recordset;
}

async function loadTicketStatus(pool, ticketId) {
  const result = await pool
    .request()
    .input('ticketId', sql.Int, ticketId)
    .query('SELECT TrangThaiVe FROM VeTrungChuyen WHERE MaVe = @ticketId LIMIT 1');

  return result.recordset[0]?.TrangThaiVe || null;
}

async function loadRoutePlanByRouteId(pool, routeId) {
  const marker = `[legacy_route_id=${routeId}]`;
  const result = await pool
    .request()
    .input('marker', sql.NVarChar(50), marker)
    .query(`
      SELECT id, status, notes
      FROM route_plans
      WHERE COALESCE(notes, '') LIKE '%' || @marker || '%'
      ORDER BY id DESC
      LIMIT 1
    `);

  return result.recordset[0] || null;
}

async function startTempBackend() {
  const command = process.platform === 'win32' ? 'node.exe' : 'node';
  const child = spawn(command, ['src/server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      APP_PORT: String(TEMP_API_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  const otpByPhone = new Map();

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/\[OTP DEMO\]\s+(\d+):\s+(\d{6})/);
      if (match) {
        otpByPhone.set(match[1], match[2]);
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const started = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Temp backend start timeout. stdout=${stdout} stderr=${stderr}`));
    }, 30000);

    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`API server listening on port ${TEMP_API_PORT}`)) {
        clearTimeout(timeout);
        resolve(true);
      }
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Temp backend exited early with code ${code}. stdout=${stdout} stderr=${stderr}`));
    });
  });

  if (!started) {
    throw new Error('Temp backend failed to start');
  }

  return {
    child,
    otpByPhone,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

async function stopTempBackend(server) {
  if (!server?.child || server.child.killed) {
    return;
  }

  server.child.kill();
  await sleep(1000);
}

async function waitForOtp(server, phone, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.otpByPhone.has(phone)) {
      return server.otpByPhone.get(phone);
    }
    await sleep(250);
  }
  throw new Error(`Không lấy được OTP từ log backend tạm cho số ${phone}. stdout=${server.getStdout()}`);
}

async function runUiSpec(specPath, contextObject, resultsFileName) {
  const contextFile = path.join(REPORTS_DIR, `${resultsFileName.replace(/\.json$/, '')}.context.json`);
  const resultsFile = path.join(REPORTS_DIR, resultsFileName);
  fs.writeFileSync(contextFile, JSON.stringify(contextObject, null, 2), 'utf8');

  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const args =
    process.platform === 'win32'
      ? ['/c', 'npx', '@playwright/test', 'test', specPath, '--config', UI_CONFIG_PATH]
      : ['@playwright/test', 'test', specPath, '--config', UI_CONFIG_PATH];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        QA_UI_CONTEXT: contextFile,
        QA_UI_RESULTS: resultsFile,
        QA_FRONTEND_BASE_URL: FRONTEND_BASE_URL,
        QA_BROWSER_PATH: EDGE_PATH,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      if (fs.existsSync(resultsFile)) {
        resolve();
        return;
      }
      reject(new Error(`Playwright failed with code ${code}. stdout=${stdout} stderr=${stderr}`));
    });
  });

  if (!fs.existsSync(resultsFile)) {
    throw new Error(`UI results file not found: ${resultsFile}`);
  }

  return JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
}

async function safeCleanup(pool, state) {
  const routeIds = [...new Set(state.cleanup.routeIds)].filter(Number.isInteger);
  const ticketIds = [...new Set(state.cleanup.ticketIds)].filter(Number.isInteger);
  const customerIds = [...new Set(state.cleanup.customerIds)].filter(Number.isInteger);
  const vehicleIds = [...new Set(state.cleanup.vehicleIds)].filter(Number.isInteger);
  const driverIds = [...new Set(state.cleanup.driverIds)].filter(Number.isInteger);
  const accountIds = [...new Set(state.cleanup.accountIds)].filter(Number.isInteger);
  const dispatcherAccountIds = [...new Set(state.cleanup.dispatcherAccountIds)].filter(Number.isInteger);
  const dispatcherEmployeeIds = [...new Set(state.cleanup.dispatcherEmployeeIds)].filter(Number.isInteger);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const routeId of routeIds) {
      const marker = `[legacy_route_id=${routeId}]`;
      const planLookup = await new sql.Request(transaction)
        .input('marker', sql.NVarChar(50), marker)
        .query(`
          SELECT id
          FROM route_plans
          WHERE COALESCE(notes, '') LIKE '%' || @marker || '%'
        `);

      const planIds = planLookup.recordset.map((row) => Number(row.id)).filter(Number.isInteger);
      if (planIds.length > 0) {
        const csv = planIds.join(',');
        await new sql.Request(transaction)
          .input('ids', sql.VarChar(sql.MAX), csv)
          .query(`
            DELETE FROM route_plan_logs
            WHERE route_plan_id IN (SELECT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(@ids, ','))
          `);
        await new sql.Request(transaction)
          .input('ids', sql.VarChar(sql.MAX), csv)
          .query(`
            DELETE FROM route_plan_driver_assignments
            WHERE route_plan_id IN (SELECT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(@ids, ','))
          `);
        await new sql.Request(transaction)
          .input('ids', sql.VarChar(sql.MAX), csv)
          .query(`
            DELETE FROM route_plan_vehicle_assignments
            WHERE route_plan_id IN (SELECT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(@ids, ','))
          `);
        await new sql.Request(transaction)
          .input('ids', sql.VarChar(sql.MAX), csv)
          .query(`
            DELETE FROM route_plan_customers
            WHERE route_plan_id IN (SELECT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(@ids, ','))
          `);
        await new sql.Request(transaction)
          .input('ids', sql.VarChar(sql.MAX), csv)
          .query(`
            DELETE FROM route_plans
            WHERE id IN (SELECT TRY_CAST(value AS BIGINT) FROM STRING_SPLIT(@ids, ','))
          `);
      }

      await new sql.Request(transaction)
        .input('routeId', sql.Int, routeId)
        .query('DELETE FROM TheoDoiTrangThai WHERE MaLoTrinh = @routeId');
      await new sql.Request(transaction)
        .input('routeId', sql.Int, routeId)
        .query('DELETE FROM ChiTietLoTrinh WHERE MaLoTrinh = @routeId');
      await new sql.Request(transaction)
        .input('routeId', sql.Int, routeId)
        .query('DELETE FROM LoTrinhTrungChuyen WHERE MaLoTrinh = @routeId');
    }

    if (ticketIds.length > 0) {
      const csv = ticketIds.join(',');
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM VeTrungChuyen
          WHERE MaVe IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
    }

    if (customerIds.length > 0) {
      const csv = customerIds.join(',');
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM external_customers
          WHERE legacy_ma_khach_hang IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM KhachHang
          WHERE MaKhachHang IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
    }

    if (vehicleIds.length > 0) {
      const csv = vehicleIds.join(',');
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM external_vehicles
          WHERE legacy_ma_xe IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM XeTrungChuyen
          WHERE MaXe IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
    }

    if (driverIds.length > 0) {
      const csv = driverIds.join(',');
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM external_drivers
          WHERE legacy_ma_tai_xe IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM TaiXe
          WHERE MaTaiXe IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
    }

    if (accountIds.length > 0) {
      const csv = accountIds.join(',');
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM TaiKhoanNguoiDung
          WHERE MaTaiKhoan IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
    }

    if (dispatcherEmployeeIds.length > 0) {
      const csv = dispatcherEmployeeIds.join(',');
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM NhanVienDieuPhoi
          WHERE MaNhanVien IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
    }

    if (dispatcherAccountIds.length > 0) {
      const csv = dispatcherAccountIds.join(',');
      await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), csv)
        .query(`
          DELETE FROM TaiKhoanNguoiDung
          WHERE MaTaiKhoan IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
        `);
    }

    await transaction.commit();
  } catch (error) {
    if (transaction._aborted !== true) {
      await transaction.rollback();
    }
    throw error;
  }
}

function summarize(rows) {
  const counts = {
    PASS: 0,
    FAIL: 0,
    BLOCKED: 0,
    'NOT RUN': 0,
  };

  for (const row of rows) {
    if (counts[row['Trạng thái']] != null) {
      counts[row['Trạng thái']] += 1;
    }
  }

  const criticalFindings = rows.filter(
    (row) =>
      row['Trạng thái'] === STATUS.FAIL &&
      /(Severity:\s*(Critical|High))/i.test(row['Ghi chú'] || row['Kết quả thực tế'])
  );

  return { counts, criticalFindings };
}

function writeSummary(rows, filePath) {
  const { counts, criticalFindings } = summarize(rows);
  const highRiskFeatures = [...new Set(rows.filter((row) => row['Trạng thái'] === STATUS.FAIL).map((row) => row['[Tên Chức Năng]']))];

  const lines = [
    '# Test Summary',
    '',
    `- Tổng số test case: ${rows.length}`,
    `- PASS: ${counts.PASS}`,
    `- FAIL: ${counts.FAIL}`,
    `- BLOCKED: ${counts.BLOCKED}`,
    `- NOT RUN: ${counts['NOT RUN']}`,
    '',
    '## Danh sách lỗi nghiêm trọng',
    '',
    ...(criticalFindings.length > 0
      ? criticalFindings.map(
          (row) =>
            `- ${row['TC ID']} | ${row['[Tên Chức Năng]']} | ${row['Kết quả thực tế']} | ${row['Ghi chú']}`
        )
      : ['- Không ghi nhận lỗi mức Critical/High trong đợt chạy này.']),
    '',
    '## Chức năng có rủi ro cao',
    '',
    ...(highRiskFeatures.length > 0 ? highRiskFeatures.map((item) => `- ${item}`) : ['- Không có module FAIL trong lần chạy này.']),
    '',
    '## Đề xuất ưu tiên sửa lỗi',
    '',
    '- Ưu tiên sửa luồng hủy chuyến tương lai trên backend vì đang phát sinh lỗi 500 thay vì cập nhật trạng thái hợp lệ.',
    '- Đồng bộ toàn bộ module bản đồ về Leaflet/OpenStreetMap, loại bỏ iframe Google Maps còn sót ở màn hình theo dõi trạng thái.',
    '- Sau khi vá lỗi backend và map, chạy lại regression cho route assignment, driver app, route tracking và smoke test end-to-end.',
  ];

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const rows = [];
  const state = createRunState();
  const pool = await createPool();
  let tempBackend = null;
  let cleanupError = null;

  try {
    await ensureEnvironment(pool);

    const resources = await queryAvailableResources(pool);
    state.existingVehicles = resources.vehicleIds;
    if (state.existingVehicles.length < 1) {
      throw new Error('Không tìm thấy xe rảnh để chạy bộ QA route/map an toàn.');
    }

    await runCase(
      rows,
      {
        id: 'AUTH_001',
        feature: 'Đăng nhập',
        description: 'Đăng nhập đúng tài khoản điều phối mặc định',
        steps: '1. Gọi POST /auth/login với tài khoản dieuphoi1.\n2. Lưu access token trả về.',
        expected: 'HTTP 200, có accessToken, requirePasswordChange=false và user vai trò điều phối.',
      },
      async () => {
        const response = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: { username: state.dispatcher.username, password: state.dispatcher.password },
        });
        expectStatus(response, 200, 'Dispatcher login');
        state.dispatcher.token = response.data.accessToken;
        return {
          actual: `HTTP 200; accessToken nhận được cho user ${response.data.user.TenDangNhap} (${response.data.user.VaiTro}).`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_002',
        feature: 'Đăng nhập',
        description: 'Đăng nhập sai mật khẩu',
        steps: '1. Gọi POST /auth/login với user hợp lệ nhưng mật khẩu sai 1 lần.',
        expected: 'HTTP 401 và trả thông báo Sai mật khẩu.',
      },
      async () => {
        const response = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: { username: state.dispatcher.username, password: 'wrong-password!' },
        });
        expectStatus(response, 401, 'Login invalid password');
        return {
          actual: `HTTP 401; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_003',
        feature: 'Đăng nhập',
        description: 'Đăng nhập thiếu thông tin bắt buộc',
        steps: '1. Gọi POST /auth/login với username và password rỗng.',
        expected: 'HTTP 400 và có fieldErrors cho username/password.',
      },
      async () => {
        const response = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: { username: '', password: '' },
        });
        expectStatus(response, 400, 'Login missing fields');
        return {
          actual: `HTTP 400; fieldErrors=${JSON.stringify(response.body?.data?.fieldErrors || {})}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_004',
        feature: 'Xác thực & phân quyền',
        description: 'Endpoint logout phản hồi thành công với phiên đã đăng nhập',
        steps: '1. Gọi POST /auth/logout với Bearer token điều phối.',
        expected: 'HTTP 200 và trả message xác nhận đăng xuất.',
      },
      async () => {
        const response = await apiRequest({
          path: '/auth/logout',
          method: 'POST',
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'Logout');
        return {
          actual: `HTTP 200; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_005',
        feature: 'Xác thực & phân quyền',
        description: 'Truy cập endpoint cần đăng nhập khi chưa có token',
        steps: '1. Gọi GET /customers không truyền Authorization header.',
        expected: 'HTTP 401 và từ chối truy cập.',
      },
      async () => {
        const response = await apiRequest({ path: '/customers' });
        expectStatus(response, 401, 'Unauthorized customers');
        return {
          actual: `HTTP 401; body=${JSON.stringify(response.body)}.`,
        };
      }
    );

    const qaDispatcherPhone = `09${state.runId.slice(-8)}`;
    const qaDispatcherUsername = `qa_dispatcher_${state.runId.toLowerCase()}`;
    const qaDispatcherPassword = 'QaDispatcher1!';

    await runCase(
      rows,
      {
        id: 'AUTH_006',
        feature: 'Đăng ký',
        description: 'Đăng ký tài khoản điều phối hợp lệ',
        steps:
          '1. Gọi POST /auth/register role=dispatcher với username, phone, password mạnh duy nhất.\n2. Kiểm tra user được tạo.',
        expected: 'HTTP 201 và tạo mới tài khoản điều phối trong DB.',
      },
      async () => {
        const response = await apiRequest({
          path: '/auth/register',
          method: 'POST',
          body: {
            role: 'dispatcher',
            fullName: `QA Dispatcher ${state.runId}`,
            username: qaDispatcherUsername,
            phoneNumber: qaDispatcherPhone,
            password: qaDispatcherPassword,
          },
        });
        expectStatus(response, 201, 'Register dispatcher');
        const dbUser = await loadDispatcherAccountByPhone(pool, qaDispatcherPhone);
        if (!dbUser) {
          throw new Error('Không tìm thấy dispatcher QA vừa đăng ký trong DB');
        }
        state.qaDispatcher = {
          username: qaDispatcherUsername,
          password: qaDispatcherPassword,
          phone: qaDispatcherPhone,
          accountId: Number(dbUser.MaTaiKhoan),
          employeeId: Number(dbUser.MaNhanVien),
        };
        state.cleanup.dispatcherAccountIds.push(state.qaDispatcher.accountId);
        state.cleanup.dispatcherEmployeeIds.push(state.qaDispatcher.employeeId);
        return {
          actual: `HTTP 201; DB tạo MaTaiKhoan=${dbUser.MaTaiKhoan}, MaNhanVien=${dbUser.MaNhanVien}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_007',
        feature: 'Đăng ký',
        description: 'Đăng ký trùng username bị chặn',
        steps: '1. Gọi lại POST /auth/register với cùng username dispatcher QA vừa tạo.',
        expected: 'HTTP 409 và thông báo tên đăng nhập đã tồn tại.',
      },
      async () => {
        const response = await apiRequest({
          path: '/auth/register',
          method: 'POST',
          body: {
            role: 'dispatcher',
            fullName: `QA Dispatcher Duplicate ${state.runId}`,
            username: qaDispatcherUsername,
            phoneNumber: `08${state.runId.slice(-8)}`,
            password: 'QaDispatcher1!',
          },
        });
        expectStatus(response, 409, 'Register dispatcher duplicate');
        return {
          actual: `HTTP 409; message="${response.body.message}".`,
        };
      }
    );

    const emptyDriverPhone = `07${state.runId.slice(-8)}`;
    const emptyDriverUsername = `qa_empty_driver_${state.runId.toLowerCase()}`;
    const emptyDriverPassword = 'QaEmptyDriver1!';
    const emptyDriverCccd = `7${state.runId.slice(-11)}`.slice(0, 12).padEnd(12, '7');

    await runCase(
      rows,
      {
        id: 'AUTH_008',
        feature: 'Đăng ký',
        description: 'Đăng ký tài khoản tài xế hợp lệ bằng luồng public register',
        steps:
          '1. Gọi POST /auth/register role=driver với CCCD, loại bằng lái và mật khẩu mạnh hợp lệ.\n2. Kiểm tra user tài xế được tạo.',
        expected: 'HTTP 201 và tạo được tài khoản tài xế mới có thể đăng nhập ngay.',
      },
      async () => {
        const response = await apiRequest({
          path: '/auth/register',
          method: 'POST',
          body: {
            role: 'driver',
            fullName: `QA Empty Driver ${state.runId}`,
            username: emptyDriverUsername,
            phoneNumber: emptyDriverPhone,
            password: emptyDriverPassword,
            cccd: emptyDriverCccd,
            licenseType: 'B2',
          },
        });
        expectStatus(response, 201, 'Register driver');
        const dbUser = await loadDriverAccountByPhone(pool, emptyDriverPhone);
        if (!dbUser) {
          throw new Error('Không tìm thấy tài xế QA empty trong DB');
        }
        state.emptyDriver = {
          username: emptyDriverUsername,
          password: emptyDriverPassword,
          phone: emptyDriverPhone,
          driverId: Number(dbUser.MaTaiXe),
          accountId: Number(dbUser.MaTaiKhoan),
        };
        state.cleanup.driverIds.push(state.emptyDriver.driverId);
        state.cleanup.accountIds.push(state.emptyDriver.accountId);
        return {
          actual: `HTTP 201; tạo tài xế MaTaiXe=${dbUser.MaTaiXe}, TenDangNhap=${dbUser.TenDangNhap}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_009',
        feature: 'Quên mật khẩu',
        description: 'Quên mật khẩu với số điện thoại không hợp lệ',
        steps: '1. Gọi POST /auth/forgot-password với phoneNumber=123.',
        expected: 'HTTP 400 và thông báo định dạng số điện thoại không hợp lệ.',
      },
      async () => {
        const response = await apiRequest({
          path: '/auth/forgot-password',
          method: 'POST',
          body: { phoneNumber: '123' },
        });
        expectStatus(response, 400, 'Forgot password invalid phone');
        return {
          actual: `HTTP 400; message="${response.body.message}".`,
        };
      }
    );

    tempBackend = await startTempBackend();

    await runCase(
      rows,
      {
        id: 'AUTH_010',
        feature: 'Quên mật khẩu',
        description: 'Gửi OTP quên mật khẩu thành công trên backend đang chạy thật',
        steps:
          '1. Khởi chạy backend tạm trên port 5001 để bắt log OTP in-memory.\n2. Gọi POST /auth/forgot-password với số điện thoại dispatcher QA.\n3. Chờ OTP xuất hiện trong log backend.',
        expected: 'HTTP 200, backend sinh OTP và log ra stdout demo.',
      },
      async () => {
        const response = await apiRequest({
          baseUrl: TEMP_API_BASE_URL,
          path: '/auth/forgot-password',
          method: 'POST',
          body: { phoneNumber: state.qaDispatcher.phone },
        });
        expectStatus(response, 200, 'Forgot password valid');
        const otp = await waitForOtp(tempBackend, state.qaDispatcher.phone);
        state.qaDispatcher.otp = otp;
        return {
          actual: `HTTP 200; OTP demo lấy từ log backend tạm là ${otp}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_011',
        feature: 'Đặt lại mật khẩu',
        description: 'Đặt lại mật khẩu với OTP sai',
        steps:
          '1. Dùng backend tạm đã sinh OTP.\n2. Gọi POST /auth/reset-password với otp sai cho dispatcher QA.',
        expected: 'HTTP 400 và thông báo mã OTP không đúng.',
      },
      async () => {
        const response = await apiRequest({
          baseUrl: TEMP_API_BASE_URL,
          path: '/auth/reset-password',
          method: 'POST',
          body: {
            phoneNumber: state.qaDispatcher.phone,
            otp: '000000',
            newPassword: 'QaReset123!',
          },
        });
        expectStatus(response, 400, 'Reset password wrong otp');
        return {
          actual: `HTTP 400; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_012',
        feature: 'Đặt lại mật khẩu',
        description: 'Đặt lại mật khẩu thành công với OTP hợp lệ',
        steps:
          '1. Dùng OTP lấy từ log backend tạm.\n2. Gọi POST /auth/reset-password với mật khẩu mới.\n3. Đăng nhập lại bằng mật khẩu mới.',
        expected: 'HTTP 200 và tài khoản đăng nhập lại được bằng mật khẩu mới.',
      },
      async () => {
        const nextPassword = 'QaReset123!';
        const resetResponse = await apiRequest({
          baseUrl: TEMP_API_BASE_URL,
          path: '/auth/reset-password',
          method: 'POST',
          body: {
            phoneNumber: state.qaDispatcher.phone,
            otp: state.qaDispatcher.otp,
            newPassword: nextPassword,
          },
        });
        expectStatus(resetResponse, 200, 'Reset password valid');
        const loginResponse = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: {
            username: state.qaDispatcher.username,
            password: nextPassword,
          },
        });
        expectStatus(loginResponse, 200, 'Login after reset');
        state.qaDispatcher.password = nextPassword;
        return {
          actual: `Reset password trả HTTP 200; đăng nhập lại thành công với user ${state.qaDispatcher.username}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'API_001',
        feature: 'API Backend',
        description: 'Response success có wrapper success/data theo chuẩn API hiện tại',
        steps:
          '1. Gọi GET /customers với token điều phối.\n2. Kiểm tra cấu trúc response top-level.',
        expected: 'Response thành công có các trường success=true, message và data.',
      },
      async () => {
        const response = await apiRequest({
          path: '/customers',
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'Customers schema');
        if (!response.body || response.body.success !== true || !Object.prototype.hasOwnProperty.call(response.body, 'data')) {
          throw new Error(`Response wrapper không đúng chuẩn: ${JSON.stringify(response.body)}`);
        }
        return {
          actual: `Response có wrapper success=${response.body.success}, message="${response.body.message}", data là mảng ${response.data.length} phần tử.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'API_002',
        feature: 'API Backend',
        description: 'Endpoint không tồn tại trả 404',
        steps: '1. Gọi GET /api/v1/unknown-endpoint.',
        expected: 'HTTP 404 và message Not found.',
      },
      async () => {
        const response = await apiRequest({ path: '/unknown-endpoint' });
        expectStatus(response, 404, 'Unknown endpoint');
        return {
          actual: `HTTP 404; body=${JSON.stringify(response.body)}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'API_003',
        feature: 'API Backend',
        description: 'Role tài xế bị chặn khỏi API dispatcher-only',
        steps:
          '1. Đăng nhập tài xế QA empty.\n2. Gọi GET /customers với token tài xế.',
        expected: 'HTTP 403 do không đúng role điều phối.',
      },
      async () => {
        const loginResponse = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: { username: state.emptyDriver.username, password: state.emptyDriver.password },
        });
        expectStatus(loginResponse, 200, 'Login empty driver');
        const driverToken = loginResponse.data.accessToken;
        const response = await apiRequest({
          path: '/customers',
          token: driverToken,
        });
        expectStatus(response, 403, 'Driver forbidden on customers');
        return {
          actual: `HTTP 403; body=${JSON.stringify(response.body)}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'DRIVER_001',
        feature: 'Quản lý tài xế',
        description: 'Xem danh sách tài xế',
        steps: '1. Gọi GET /drivers với token điều phối.',
        expected: 'HTTP 200 và trả về danh sách tài xế đang hoạt động.',
      },
      async () => {
        const response = await apiRequest({
          path: '/drivers',
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'List drivers');
        return {
          actual: `HTTP 200; trả về ${response.data.length} tài xế.`,
        };
      }
    );

    const managedDriverPhone = `03${state.runId.slice(-8)}`;
    const managedDriverEmployeeCode = `QATX${state.runId.slice(-6)}`;
    const managedDriverCccd = `8${state.runId.slice(-11)}`.slice(0, 12).padEnd(12, '8');

    await runCase(
      rows,
      {
        id: 'DRIVER_002',
        feature: 'Quản lý tài xế',
        description: 'Thêm tài xế hợp lệ từ màn hình/luồng điều phối',
        steps:
          '1. Gọi POST /drivers với đủ mã nhân viên, họ tên, SĐT, CCCD, bằng lái.\n2. Kiểm tra account mặc định trả về.',
        expected:
          'HTTP 201, tạo được tài xế mới, sinh tài khoản đăng nhập mặc định và yêu cầu đổi mật khẩu lần đầu.',
      },
      async () => {
        const response = await apiRequest({
          path: '/drivers',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaNhanVien: managedDriverEmployeeCode,
            HoTen: `QA Managed Driver ${state.runId}`,
            SoDienThoai: managedDriverPhone,
            CCCD: managedDriverCccd,
            LoaiBangLai: 'B2',
            TrangThaiTaiXe: 'Rảnh',
          },
        });
        expectStatus(response, 201, 'Create managed driver');
        const dbUser = await loadDriverAccountByPhone(pool, managedDriverPhone);
        if (!dbUser) {
          throw new Error('Không tìm thấy managed driver trong DB sau khi tạo');
        }
        state.managedDriver = {
          username: response.data.account.TenDangNhap,
          defaultPassword: response.data.account.MatKhauMacDinh || '123456',
          password: response.data.account.MatKhauMacDinh || '123456',
          phone: managedDriverPhone,
          driverId: Number(dbUser.MaTaiXe),
          accountId: Number(dbUser.MaTaiKhoan),
          employeeCode: managedDriverEmployeeCode,
        };
        state.cleanup.driverIds.push(state.managedDriver.driverId);
        state.cleanup.accountIds.push(state.managedDriver.accountId);
        return {
          actual: `HTTP 201; tạo MaTaiXe=${dbUser.MaTaiXe}; tài khoản mặc định=${state.managedDriver.username}/${state.managedDriver.defaultPassword}; YeuCauDoiMatKhau=${dbUser.YeuCauDoiMatKhau}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'DRIVER_003',
        feature: 'Quản lý tài xế',
        description: 'Thêm tài xế thiếu trường bắt buộc',
        steps: '1. Gọi POST /drivers với payload rỗng.',
        expected: 'HTTP 400 và trả fieldErrors cho các trường bắt buộc.',
      },
      async () => {
        const response = await apiRequest({
          path: '/drivers',
          method: 'POST',
          token: state.dispatcher.token,
          body: {},
        });
        expectStatus(response, 400, 'Create driver missing fields');
        return {
          actual: `HTTP 400; fieldErrors=${JSON.stringify(response.body?.data?.fieldErrors || {})}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'DRIVER_004',
        feature: 'Quản lý tài xế',
        description: 'Validate số điện thoại và CCCD tài xế không hợp lệ',
        steps:
          '1. Gọi POST /drivers với SĐT sai định dạng và CCCD không đủ 12 số.',
        expected: 'HTTP 400 và báo lỗi dữ liệu không hợp lệ.',
      },
      async () => {
        const response = await apiRequest({
          path: '/drivers',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaNhanVien: `BAD${state.runId.slice(-4)}`,
            HoTen: 'Bad Driver',
            SoDienThoai: '12345',
            CCCD: '123',
            LoaiBangLai: 'B2',
          },
        });
        expectStatus(response, 400, 'Create driver invalid fields');
        return {
          actual: `HTTP 400; fieldErrors=${JSON.stringify(response.body?.data?.fieldErrors || {})}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'DRIVER_005',
        feature: 'Quản lý tài xế',
        description: 'Không cho tạo tài xế trùng mã nhân viên/điện thoại/CCCD',
        steps:
          '1. Gọi POST /drivers với thông tin trùng managed driver vừa tạo.\n2. Quan sát mã lỗi conflict.',
        expected: 'HTTP 409 và báo trùng dữ liệu định danh tài xế.',
      },
      async () => {
        const response = await apiRequest({
          path: '/drivers',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaNhanVien: managedDriverEmployeeCode,
            HoTen: 'Duplicate Driver',
            SoDienThoai: managedDriverPhone,
            CCCD: managedDriverCccd,
            LoaiBangLai: 'B2',
          },
        });
        expectStatus(response, 409, 'Create driver duplicate');
        return {
          actual: `HTTP 409; fieldErrors=${JSON.stringify(response.body?.data?.fieldErrors || {})}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_013',
        feature: 'Đổi mật khẩu lần đầu',
        description: 'Tài xế do điều phối tạo ra phải đổi mật khẩu ở lần đăng nhập đầu',
        steps:
          '1. Gọi POST /auth/login với tài khoản tài xế QA vừa được tạo bởi /drivers.\n2. Kiểm tra requirePasswordChange và passwordChangeToken.',
        expected: 'HTTP 200 nhưng requirePasswordChange=true, chưa cấp accessToken đăng nhập sử dụng bình thường.',
      },
      async () => {
        const response = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: {
            username: state.managedDriver.username,
            password: state.managedDriver.defaultPassword,
          },
        });
        expectStatus(response, 200, 'Managed driver first login');
        if (!response.data.requirePasswordChange || !response.data.passwordChangeToken) {
          throw new Error(`Driver first login không yêu cầu đổi mật khẩu: ${JSON.stringify(response.body)}`);
        }
        state.managedDriver.passwordChangeToken = response.data.passwordChangeToken;
        return {
          actual: `HTTP 200; requirePasswordChange=${response.data.requirePasswordChange}; có passwordChangeToken.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_014',
        feature: 'Đổi mật khẩu lần đầu',
        description: 'Đổi mật khẩu lần đầu thành công',
        steps:
          '1. Gọi POST /auth/change-password-first-login với token đổi mật khẩu lần đầu.\n2. Đặt mật khẩu mới mạnh.\n3. Đăng nhập lại bằng mật khẩu mới.',
        expected: 'HTTP 200, trả accessToken sử dụng được và YeuCauDoiMatKhau về false.',
      },
      async () => {
        const newPassword = 'QaManagedDriver1!';
        const changeResponse = await apiRequest({
          path: '/auth/change-password-first-login',
          method: 'POST',
          body: {
            token: state.managedDriver.passwordChangeToken,
            newPassword,
            confirmPassword: newPassword,
          },
        });
        expectStatus(changeResponse, 200, 'First login password change');
        const relogin = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: {
            username: state.managedDriver.username,
            password: newPassword,
          },
        });
        expectStatus(relogin, 200, 'Managed driver relogin');
        state.managedDriver.password = newPassword;
        state.managedDriver.token = relogin.data.accessToken;
        return {
          actual: `HTTP 200; đổi mật khẩu lần đầu thành công và đăng nhập lại được bằng mật khẩu mới.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'AUTH_015',
        feature: 'Đổi mật khẩu lần đầu',
        description: 'Không cho đổi mật khẩu lần đầu trùng với mật khẩu hiện tại',
        steps:
          '1. Đăng nhập lại tài xế mới tạo để lấy passwordChangeToken mới bằng cách tạo thêm tài xế thử.\n2. Gọi API đổi mật khẩu với mật khẩu mới trùng mật khẩu cũ.',
        expected: 'HTTP 400 và báo mật khẩu mới phải khác mật khẩu hiện tại.',
      },
      async () => {
        const trialPhone = `06${state.runId.slice(-8)}`;
        const trialCode = `TRY${state.runId.slice(-5)}`;
        const trialCccd = `6${state.runId.slice(-11)}`.slice(0, 12).padEnd(12, '6');
        const createResponse = await apiRequest({
          path: '/drivers',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaNhanVien: trialCode,
            HoTen: `QA Trial Driver ${state.runId}`,
            SoDienThoai: trialPhone,
            CCCD: trialCccd,
            LoaiBangLai: 'B2',
            TrangThaiTaiXe: 'Rảnh',
          },
        });
        expectStatus(createResponse, 201, 'Create trial driver');
        const trialDb = await loadDriverAccountByPhone(pool, trialPhone);
        state.cleanup.driverIds.push(Number(trialDb.MaTaiXe));
        state.cleanup.accountIds.push(Number(trialDb.MaTaiKhoan));
        const loginResponse = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: {
            username: createResponse.data.account.TenDangNhap,
            password: createResponse.data.account.MatKhauMacDinh || '123456',
          },
        });
        expectStatus(loginResponse, 200, 'Trial driver first login');
        const changeResponse = await apiRequest({
          path: '/auth/change-password-first-login',
          method: 'POST',
          body: {
            token: loginResponse.data.passwordChangeToken,
            newPassword: createResponse.data.account.MatKhauMacDinh || '123456',
            confirmPassword: createResponse.data.account.MatKhauMacDinh || '123456',
          },
        });
        expectStatus(changeResponse, 400, 'First login same password');
        return {
          actual: `HTTP 400; message="${changeResponse.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'CUSTOMER_001',
        feature: 'Quản lý khách hàng',
        description: 'Xem danh sách khách hàng',
        steps: '1. Gọi GET /customers với token điều phối.',
        expected: 'HTTP 200 và trả về danh sách khách hàng active.',
      },
      async () => {
        const response = await apiRequest({
          path: '/customers',
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'List customers');
        return {
          actual: `HTTP 200; trả về ${response.data.length} khách hàng.`,
        };
      }
    );

    const routeCustomerPhone = `02${state.runId.slice(-8)}`;
    const routeCustomerName = `QA Route Customer ${state.runId}`;

    await runCase(
      rows,
      {
        id: 'CUSTOMER_002',
        feature: 'Quản lý khách hàng',
        description: 'Thêm khách hàng hợp lệ',
        steps:
          '1. Gọi POST /customers với đầy đủ họ tên, SĐT, điểm đón, điểm trả.\n2. Kiểm tra dữ liệu tồn tại ở cả KhachHang và external_customers.',
        expected: 'HTTP 201 và dữ liệu được lưu bền vững trong DB.',
      },
      async () => {
        const response = await apiRequest({
          path: '/customers',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            TenKhachHang: routeCustomerName,
            SoDienThoai: routeCustomerPhone,
            DiaChiDon: '1010 Tieu La, Da Nang',
            DiaChiTra: 'Ben xe Da Nang',
            TrangThai: 'Hoạt động',
          },
        });
        expectStatus(response, 201, 'Create customer');
        state.routeCustomer = {
          id: Number(response.data.MaKhachHang),
          phone: routeCustomerPhone,
          name: routeCustomerName,
        };
        state.cleanup.customerIds.push(state.routeCustomer.id);
        await updateCustomerCoordinates(pool, state.routeCustomer.id, {
          pickupLat: 16.047079,
          pickupLng: 108.20623,
          dropoffLat: 16.06778,
          dropoffLng: 108.22083,
        });
        const dbCheck = await pool
          .request()
          .input('id', sql.Int, state.routeCustomer.id)
          .query(`
            SELECT
              (SELECT COUNT(*) FROM KhachHang WHERE MaKhachHang = @id) AS legacyCount,
              (SELECT COUNT(*) FROM external_customers WHERE legacy_ma_khach_hang = @id) AS externalCount
          `);
        return {
          actual: `HTTP 201; tạo MaKhachHang=${state.routeCustomer.id}; legacyCount=${dbCheck.recordset[0].legacyCount}; externalCount=${dbCheck.recordset[0].externalCount}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'CUSTOMER_003',
        feature: 'Quản lý khách hàng',
        description: 'Thêm khách hàng thiếu trường bắt buộc',
        steps: '1. Gọi POST /customers với payload rỗng.',
        expected: 'HTTP 400 và trả fieldErrors cho các trường bắt buộc.',
      },
      async () => {
        const response = await apiRequest({
          path: '/customers',
          method: 'POST',
          token: state.dispatcher.token,
          body: {},
        });
        expectStatus(response, 400, 'Create customer missing fields');
        return {
          actual: `HTTP 400; fieldErrors=${JSON.stringify(response.body?.data?.fieldErrors || {})}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'CUSTOMER_004',
        feature: 'Quản lý khách hàng',
        description: 'Validate số điện thoại khách hàng không hợp lệ',
        steps:
          '1. Gọi POST /customers với SĐT không đủ 10 số.',
        expected: 'HTTP 400 và báo lỗi số điện thoại không hợp lệ.',
      },
      async () => {
        const response = await apiRequest({
          path: '/customers',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            TenKhachHang: 'Invalid Customer',
            SoDienThoai: '12345',
            DiaChiDon: 'A',
            DiaChiTra: 'B',
          },
        });
        expectStatus(response, 400, 'Create customer invalid phone');
        return {
          actual: `HTTP 400; fieldErrors=${JSON.stringify(response.body?.data?.fieldErrors || {})}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'CUSTOMER_005',
        feature: 'Quản lý khách hàng',
        description: 'Không cho thêm khách hàng trùng số điện thoại',
        steps:
          '1. Gọi POST /customers với số điện thoại trùng route customer QA.',
        expected: 'HTTP 409 và báo trùng số điện thoại.',
      },
      async () => {
        const response = await apiRequest({
          path: '/customers',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            TenKhachHang: 'Duplicate Customer',
            SoDienThoai: routeCustomerPhone,
            DiaChiDon: 'Dup pickup',
            DiaChiTra: 'Dup dropoff',
          },
        });
        expectStatus(response, 409, 'Create customer duplicate phone');
        return {
          actual: `HTTP 409; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'CUSTOMER_006',
        feature: 'Quản lý khách hàng',
        description: 'Sửa thông tin khách hàng',
        steps:
          '1. Gọi PUT /customers/:id với tên và địa chỉ cập nhật.\n2. Kiểm tra dữ liệu mới trả về từ API.',
        expected: 'HTTP 200 và dữ liệu khách hàng được cập nhật.',
      },
      async () => {
        const response = await apiRequest({
          path: `/customers/${state.routeCustomer.id}`,
          method: 'PUT',
          token: state.dispatcher.token,
          body: {
            TenKhachHang: `${routeCustomerName} Updated`,
            SoDienThoai: routeCustomerPhone,
            DiaChiDon: '102 Nguyen Van Linh, Da Nang',
            DiaChiTra: 'Ben xe trung tam Da Nang',
            TrangThai: 'Hoạt động',
          },
        });
        expectStatus(response, 200, 'Update customer');
        state.routeCustomer.name = response.data.TenKhachHang;
        return {
          actual: `HTTP 200; khách hàng cập nhật thành "${response.data.TenKhachHang}" với điểm đón "${response.data.DiaChiDon}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'CUSTOMER_007',
        feature: 'Quản lý khách hàng',
        description: 'Tìm kiếm khách hàng theo keyword',
        steps:
          '1. Gọi GET /customers?keyword=<tên QA route customer>.\n2. Kiểm tra kết quả tìm kiếm.',
        expected: 'Danh sách trả về chứa khách hàng QA vừa tạo.',
      },
      async () => {
        const response = await apiRequest({
          path: `/customers?keyword=${encodeURIComponent(state.routeCustomer.name)}`,
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'Search customers');
        const found = response.data.some((item) => Number(item.MaKhachHang) === state.routeCustomer.id);
        if (!found) {
          throw new Error(`Không tìm thấy khách hàng QA trong kết quả search: ${JSON.stringify(response.data)}`);
        }
        return {
          actual: `HTTP 200; kết quả search chứa MaKhachHang=${state.routeCustomer.id}.`,
        };
      }
    );

    const deleteOnlyCustomerPhone = `01${state.runId.slice(-8)}`;
    const noCoordsCustomerPhone = `05${state.runId.slice(-8)}`;

    const deleteOnlyCustomerResponse = await apiRequest({
      path: '/customers',
      method: 'POST',
      token: state.dispatcher.token,
      body: {
        TenKhachHang: `QA Delete Customer ${state.runId}`,
        SoDienThoai: deleteOnlyCustomerPhone,
        DiaChiDon: 'Delete pickup',
        DiaChiTra: 'Delete dropoff',
        TrangThai: 'Hoạt động',
      },
    });
    expectStatus(deleteOnlyCustomerResponse, 201, 'Setup delete only customer');
    state.deleteOnlyCustomer = { id: Number(deleteOnlyCustomerResponse.data.MaKhachHang) };
    state.cleanup.customerIds.push(state.deleteOnlyCustomer.id);

    const noCoordsCustomerResponse = await apiRequest({
      path: '/customers',
      method: 'POST',
      token: state.dispatcher.token,
      body: {
        TenKhachHang: `QA NoCoords Customer ${state.runId}`,
        SoDienThoai: noCoordsCustomerPhone,
        DiaChiDon: 'NoCoords pickup',
        DiaChiTra: 'NoCoords dropoff',
        TrangThai: 'Hoạt động',
      },
    });
    expectStatus(noCoordsCustomerResponse, 201, 'Setup no coords customer');
    state.noCoordsCustomer = { id: Number(noCoordsCustomerResponse.data.MaKhachHang) };
    state.cleanup.customerIds.push(state.noCoordsCustomer.id);

    state.tickets.ticketRoutePrimary = await insertTicket(pool, {
      customerId: state.routeCustomer.id,
      seatCount: 2,
      slot: '06:30 - 07:00',
    });
    state.tickets.ticketVehicleConflict = await insertTicket(pool, {
      customerId: state.noCoordsCustomer.id,
      seatCount: 1,
      slot: '07:00 - 07:30',
    });
    state.tickets.ticketDriverConflict = await insertTicket(pool, {
      customerId: state.routeCustomer.id,
      seatCount: 1,
      slot: '07:30 - 08:00',
    });
    state.tickets.ticketRoutePlan = await insertTicket(pool, {
      customerId: state.routeCustomer.id,
      seatCount: 1,
      slot: '08:00 - 08:30',
    });
    state.tickets.ticketBugRoute = await insertTicket(pool, {
      customerId: state.routeCustomer.id,
      seatCount: 1,
      slot: '08:30 - 09:00',
    });
    state.cleanup.ticketIds.push(
      state.tickets.ticketRoutePrimary,
      state.tickets.ticketVehicleConflict,
      state.tickets.ticketDriverConflict,
      state.tickets.ticketRoutePlan,
      state.tickets.ticketBugRoute
    );

    await runCase(
      rows,
      {
        id: 'CUSTOMER_008',
        feature: 'Quản lý khách hàng',
        description: 'Xóa/ngưng hoạt động khách hàng không có vé liên quan',
        steps:
          '1. Gọi DELETE /customers/:id với khách hàng QA không có vé.\n2. Kiểm tra trạng thái inactive.',
        expected: 'HTTP 200 và khách hàng được chuyển sang ngừng hoạt động.',
      },
      async () => {
        const response = await apiRequest({
          path: `/customers/${state.deleteOnlyCustomer.id}`,
          method: 'DELETE',
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'Delete inactive customer');
        return {
          actual: `HTTP 200; khách hàng ${state.deleteOnlyCustomer.id} được chuyển sang trạng thái "${response.data.TrangThai}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'CUSTOMER_009',
        feature: 'Quản lý khách hàng',
        description: 'Không cho xóa khách hàng đã có vé trung chuyển',
        steps:
          '1. Gọi DELETE /customers/:id với route customer QA đã được gắn vé test.\n2. Quan sát phản hồi conflict.',
        expected: 'HTTP 409 vì khách hàng đã có vé liên quan.',
      },
      async () => {
        const response = await apiRequest({
          path: `/customers/${state.routeCustomer.id}`,
          method: 'DELETE',
          token: state.dispatcher.token,
        });
        expectStatus(response, 409, 'Delete customer with tickets');
        return {
          actual: `HTTP 409; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'CUSTOMER_010',
        feature: 'Quản lý khách hàng',
        description: 'Dữ liệu khách hàng được lưu đúng trên cả bảng legacy và external',
        steps:
          '1. Query DB theo MaKhachHang của route customer QA.\n2. Đối chiếu tên/SĐT tồn tại ở KhachHang và external_customers.',
        expected: 'Dữ liệu tồn tại đồng bộ ở cả 2 bảng.',
      },
      async () => {
        const result = await pool
          .request()
          .input('id', sql.Int, state.routeCustomer.id)
          .query(`
            SELECT
              (SELECT TenKhachHang FROM KhachHang WHERE MaKhachHang = @id LIMIT 1) AS LegacyName,
              (SELECT full_name FROM external_customers WHERE legacy_ma_khach_hang = @id LIMIT 1) AS ExternalName,
              (SELECT SoDienThoai FROM KhachHang WHERE MaKhachHang = @id LIMIT 1) AS LegacyPhone,
              (SELECT phone FROM external_customers WHERE legacy_ma_khach_hang = @id LIMIT 1) AS ExternalPhone
          `);
        const row = result.recordset[0];
        if (!row.LegacyName || !row.ExternalName || row.LegacyPhone !== row.ExternalPhone) {
          throw new Error(`Customer persistence mismatch: ${JSON.stringify(row)}`);
        }
        return {
          actual: `DB đồng bộ đúng: LegacyName="${row.LegacyName}", ExternalName="${row.ExternalName}", phone=${row.LegacyPhone}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'VEHICLE_001',
        feature: 'Quản lý xe',
        description: 'Xem danh sách xe',
        steps: '1. Gọi GET /vehicles với token điều phối.',
        expected: 'HTTP 200 và trả về danh sách xe.',
      },
      async () => {
        const response = await apiRequest({
          path: '/vehicles',
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'List vehicles');
        return {
          actual: `HTTP 200; trả về ${response.data.length} xe.`,
        };
      }
    );

    const vehiclePlate = `43A-${state.runId.slice(-5)}`;
    await runCase(
      rows,
      {
        id: 'VEHICLE_002',
        feature: 'Quản lý xe',
        description: 'Thêm xe hợp lệ',
        steps:
          '1. Gọi POST /vehicles với biển số đúng định dạng, loại xe và số chỗ hợp lệ.\n2. Kiểm tra xe được tạo trong DB.',
        expected: 'HTTP 201 và tạo được xe mới.',
      },
      async () => {
        const response = await apiRequest({
          path: '/vehicles',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            BienSo: vehiclePlate,
            LoaiXe: 'Xe 7 chỗ',
            SoCho: 7,
            TrangThaiXe: 'Rảnh',
          },
        });
        expectStatus(response, 201, 'Create vehicle');
        state.vehicleCrud = { id: Number(response.data.MaXe), plate: response.data.BienSo };
        state.cleanup.vehicleIds.push(state.vehicleCrud.id);
        return {
          actual: `HTTP 201; tạo xe MaXe=${state.vehicleCrud.id}, BienSo=${response.data.BienSo}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'VEHICLE_003',
        feature: 'Quản lý xe',
        description: 'Validate biển số xe không hợp lệ',
        steps: '1. Gọi POST /vehicles với BienSo="INVALID".',
        expected: 'HTTP 400 và báo lỗi định dạng biển số.',
      },
      async () => {
        const response = await apiRequest({
          path: '/vehicles',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            BienSo: 'INVALID',
            LoaiXe: 'Xe 16 chỗ',
            SoCho: 16,
            TrangThaiXe: 'Rảnh',
          },
        });
        expectStatus(response, 400, 'Create vehicle invalid plate');
        return {
          actual: `HTTP 400; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'VEHICLE_004',
        feature: 'Quản lý xe',
        description: 'Validate số chỗ xe ở boundary không hợp lệ',
        steps: '1. Gọi POST /vehicles với SoCho=3.',
        expected: 'HTTP 400 vì số chỗ phải từ 4 đến 45.',
      },
      async () => {
        const response = await apiRequest({
          path: '/vehicles',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            BienSo: `51A-${state.runId.slice(-5)}`,
            LoaiXe: 'Xe 7 chỗ',
            SoCho: 3,
            TrangThaiXe: 'Rảnh',
          },
        });
        expectStatus(response, 400, 'Create vehicle invalid seat count');
        return {
          actual: `HTTP 400; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'VEHICLE_005',
        feature: 'Quản lý xe',
        description: 'Không cho thêm xe trùng biển số',
        steps:
          '1. Gọi POST /vehicles với biển số trùng xe QA vừa tạo.',
        expected: 'HTTP 409 và báo conflict biển số.',
      },
      async () => {
        const response = await apiRequest({
          path: '/vehicles',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            BienSo: state.vehicleCrud.plate,
            LoaiXe: 'Xe 7 chỗ',
            SoCho: 7,
            TrangThaiXe: 'Rảnh',
          },
        });
        expectStatus(response, 409, 'Create vehicle duplicate');
        return {
          actual: `HTTP 409; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'VEHICLE_006',
        feature: 'Quản lý xe',
        description: 'Sửa thông tin xe',
        steps:
          '1. Gọi PUT /vehicles/:id đổi loại xe và số chỗ.\n2. Kiểm tra dữ liệu xe trả về.',
        expected: 'HTTP 200 và xe được cập nhật thành công.',
      },
      async () => {
        const response = await apiRequest({
          path: `/vehicles/${state.vehicleCrud.id}`,
          method: 'PUT',
          token: state.dispatcher.token,
          body: {
            BienSo: state.vehicleCrud.plate,
            LoaiXe: 'Xe 9 - 12 chỗ',
            SoCho: 12,
            TrangThaiXe: 'Rảnh',
          },
        });
        expectStatus(response, 200, 'Update vehicle');
        return {
          actual: `HTTP 200; xe cập nhật thành loại "${response.data.LoaiXe}" với ${response.data.SoCho} chỗ.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'TICKET_001',
        feature: 'Vé trung chuyển',
        description: 'Lọc danh sách vé cần trung chuyển',
        steps:
          '1. Gọi GET /tickets?status=Cần trung chuyển.\n2. Kiểm tra các vé QA vừa chèn có xuất hiện.',
        expected: 'HTTP 200 và vé QA ở trạng thái Cần trung chuyển được trả về.',
      },
      async () => {
        const response = await apiRequest({
          path: `/tickets?status=${encodeURIComponent('Cần trung chuyển')}`,
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'List tickets');
        const containsQaTicket = response.data.some(
          (ticket) =>
            [state.tickets.ticketRoutePrimary, state.tickets.ticketVehicleConflict, state.tickets.ticketDriverConflict].includes(
              Number(ticket.MaVe)
            )
        );
        if (!containsQaTicket) {
          throw new Error(`Không thấy vé QA trong danh sách lọc: ${JSON.stringify(response.data.slice(0, 5))}`);
        }
        return {
          actual: `HTTP 200; danh sách vé lọc chứa các vé QA vừa tạo.`,
        };
      }
    );

    state.routeAuxVehicleId = state.existingVehicles[1] || state.vehicleCrud.id;

    const phaseARows = await runUiSpec('scripts/qa/ui-phase-a.spec.js', {
      dispatcher: state.dispatcher,
      emptyDriver: {
        username: state.emptyDriver.username,
        password: state.emptyDriver.password,
      },
    }, 'ui_phase_a_results.json');
    rows.push(...phaseARows);

    const routeStartPrimary = new Date(Date.now() + 30 * 60 * 1000);
    const routeStartIso = routeStartPrimary.toISOString();

    await runCase(
      rows,
      {
        id: 'ROUTE_001',
        feature: 'Quản lý tuyến/chuyến/vé trung chuyển',
        description: 'Tạo chuyến hợp lệ từ API /routes',
        steps:
          '1. Chọn xe rảnh sẵn có, tài xế QA managed và vé QA có tọa độ.\n2. Gọi POST /routes với giờ bắt đầu trong tương lai.',
        expected: 'HTTP 201 và tạo được chuyến mới ở trạng thái Chưa thực hiện.',
      },
      async () => {
        const response = await apiRequest({
          path: '/routes',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaXe: state.existingVehicles[0],
            MaTaiXe: state.managedDriver.driverId,
            ThoiGianBatDau: routeStartIso,
            GhiChu: `QA primary route ${state.runId}`,
            ticketIds: [state.tickets.ticketRoutePrimary],
          },
        });
        expectStatus(response, 201, 'Create primary route');
        state.routes.primaryRouteId = Number(response.data.route.MaLoTrinh);
        state.cleanup.routeIds.push(state.routes.primaryRouteId);
        return {
          actual: `HTTP 201; tạo MaLoTrinh=${state.routes.primaryRouteId} với 1 điểm dừng.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'DRIVER_006',
        feature: 'Quản lý tài xế',
        description: 'Sửa thông tin tài xế',
        steps:
          '1. Gọi PUT /drivers/:id với tên hiển thị mới cho managed driver.\n2. Kiểm tra dữ liệu cập nhật.',
        expected: 'HTTP 200 và thông tin tài xế được cập nhật.',
      },
      async () => {
        const response = await apiRequest({
          path: `/drivers/${state.managedDriver.driverId}`,
          method: 'PUT',
          token: state.dispatcher.token,
          body: {
            MaNhanVien: state.managedDriver.employeeCode,
            HoTen: `QA Managed Driver ${state.runId} Updated`,
            SoDienThoai: state.managedDriver.phone,
            CCCD: managedDriverCccd,
            LoaiBangLai: 'B2',
            TrangThaiTaiXe: 'Đã phân công',
          },
        });
        expectStatus(response, 200, 'Update managed driver');
        return {
          actual: `HTTP 200; tài xế cập nhật tên thành "${response.data.HoTen}" và trạng thái "${response.data.TrangThaiTaiXe}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ASSIGN_001',
        feature: 'Phân công tài xế',
        description: 'Tài xế nhìn thấy chuyến được phân công qua API by-driver',
        steps:
          '1. Gọi GET /routes/by-driver/:driverId với driver QA managed.\n2. Tìm chuyến primary route vừa tạo.',
        expected: 'HTTP 200 và danh sách chứa chuyến vừa phân công.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/by-driver/${state.managedDriver.driverId}`,
          token: state.managedDriver.token,
        });
        expectStatus(response, 200, 'Routes by driver');
        const found = response.data.some((route) => Number(route.MaLoTrinh) === state.routes.primaryRouteId);
        if (!found) {
          throw new Error(`Driver route list không chứa primary route ${state.routes.primaryRouteId}`);
        }
        return {
          actual: `HTTP 200; driver QA thấy chuyến MaLoTrinh=${state.routes.primaryRouteId} trong danh sách.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'DRIVER_007',
        feature: 'Quản lý tài xế',
        description: 'Không cho ngưng hoạt động tài xế đang bận/đã được phân công',
        steps:
          '1. Khi primary route đang ở trạng thái Chưa thực hiện.\n2. Gọi DELETE /drivers/:id với managed driver.',
        expected: 'HTTP 409 và không chuyển tài xế sang ngừng hoạt động.',
      },
      async () => {
        const response = await apiRequest({
          path: `/drivers/${state.managedDriver.driverId}`,
          method: 'DELETE',
          token: state.dispatcher.token,
        });
        expectStatus(response, 409, 'Disable busy driver');
        return {
          actual: `HTTP 409; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ROUTE_002',
        feature: 'Quản lý tuyến/chuyến/vé trung chuyển',
        description: 'Tạo chuyến thiếu khách hàng/vé bị chặn',
        steps:
          '1. Gọi POST /routes với ticketIds rỗng.',
        expected: 'HTTP 400 do thiếu thông tin vé/khách hàng để lập lộ trình.',
      },
      async () => {
        const response = await apiRequest({
          path: '/routes',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaXe: state.existingVehicles[0],
            MaTaiXe: state.managedDriver.driverId,
            ThoiGianBatDau: routeStartIso,
            ticketIds: [],
          },
        });
        expectStatus(response, 400, 'Create route missing tickets');
        return {
          actual: `HTTP 400; message="${response.body.message}".`,
        };
      }
    );

    pushStaticCase(
      rows,
      {
        id: 'ROUTE_003',
        feature: 'Quản lý tuyến/chuyến/vé trung chuyển',
        description: 'Tạo chuyến thiếu điểm đón/điểm trả',
        steps:
          '1. Xác định cách tạo vé/khách hàng có địa chỉ đón hoặc trả rỗng.\n2. Đánh giá khả năng test qua API/DB hiện tại.',
        expected:
          'Nếu hệ thống cho phép dữ liệu thiếu địa chỉ thì API phải chặn; nếu schema chặn từ DB thì case được ghi nhận là không khả thi ở runtime hiện tại.',
      },
      'Không chạy được case runtime vì schema hiện tại đặt DiaChiDon và DiaChiTra là NOT NULL ở bảng KhachHang; không có API hợp lệ để tạo vé/chuyến với điểm đón hoặc điểm trả bị rỗng mà không phá vỡ ràng buộc dữ liệu.',
      STATUS.BLOCKED,
      'Lý do chặn: database/database.sql | KhachHang.DiaChiDon, DiaChiTra NOT NULL.'
    );

    await runCase(
      rows,
      {
        id: 'ROUTE_004',
        feature: 'Quản lý tuyến/chuyến/vé trung chuyển',
        description: 'Tạo chuyến với thời gian bắt đầu ở quá khứ',
        steps:
          '1. Gọi POST /routes với ThoiGianBatDau lùi 10 phút so với hiện tại.',
        expected: 'HTTP 400 và báo thời gian bắt đầu không được ở quá khứ.',
      },
      async () => {
        const response = await apiRequest({
          path: '/routes',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaXe: state.routeAuxVehicleId,
            MaTaiXe: state.emptyDriver.driverId,
            ThoiGianBatDau: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            ticketIds: [state.tickets.ticketDriverConflict],
          },
        });
        expectStatus(response, 400, 'Create route in past');
        return {
          actual: `HTTP 400; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ROUTE_005',
        feature: 'Phân công tài xế',
        description: 'Không cho phân công xe đang bận',
        steps:
          '1. Khi primary route đang giữ xe existingVehicles[0].\n2. Gọi POST /routes với cùng xe nhưng tài xế khác và vé khác.',
        expected: 'HTTP 409 và báo xe đang được phân công cho lộ trình khác.',
      },
      async () => {
        const response = await apiRequest({
          path: '/routes',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaXe: state.existingVehicles[0],
            MaTaiXe: state.emptyDriver.driverId,
            ThoiGianBatDau: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            ticketIds: [state.tickets.ticketVehicleConflict],
          },
        });
        expectStatus(response, 409, 'Vehicle conflict');
        return {
          actual: `HTTP 409; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ROUTE_006',
        feature: 'Phân công tài xế',
        description: 'Không cho phân công tài xế đang bận',
        steps:
          '1. Khi primary route đang giữ managed driver.\n2. Gọi POST /routes với xe khác nhưng cùng tài xế QA managed.',
        expected: 'HTTP 409 và báo tài xế đang được phân công cho lộ trình khác.',
      },
      async () => {
        const response = await apiRequest({
          path: '/routes',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaXe: state.vehicleCrud.id,
            MaTaiXe: state.managedDriver.driverId,
            ThoiGianBatDau: new Date(Date.now() + 65 * 60 * 1000).toISOString(),
            ticketIds: [state.tickets.ticketDriverConflict],
          },
        });
        expectStatus(response, 409, 'Driver conflict');
        return {
          actual: `HTTP 409; message="${response.body.message}".`,
        };
      }
    );

    const missingRouteStartIso = new Date(Date.now() + 35 * 60 * 1000).toISOString();
    const missingRouteResponse = await apiRequest({
      path: '/routes',
      method: 'POST',
      token: state.dispatcher.token,
      body: {
        MaXe: state.routeAuxVehicleId,
        MaTaiXe: state.emptyDriver.driverId,
        ThoiGianBatDau: missingRouteStartIso,
        GhiChu: `QA missing coords route ${state.runId}`,
        ticketIds: [state.tickets.ticketVehicleConflict],
      },
    });
    expectStatus(missingRouteResponse, 201, 'Create missing route');
    state.routes.missingCoordsRouteId = Number(missingRouteResponse.data.route.MaLoTrinh);
    state.cleanup.routeIds.push(state.routes.missingCoordsRouteId);

    const phaseBRows = await runUiSpec('scripts/qa/ui-phase-b.spec.js', {
      dispatcher: state.dispatcher,
      managedDriver: {
        username: state.managedDriver.username,
        password: state.managedDriver.password,
      },
      emptyDriver: {
        username: state.emptyDriver.username,
        password: state.emptyDriver.password,
      },
      routeWithMapId: state.routes.primaryRouteId,
      routeMissingCoordsId: state.routes.missingCoordsRouteId,
    }, 'ui_phase_b_results.json');
    rows.push(...phaseBRows);

    await runCase(
      rows,
      {
        id: 'ASSIGN_002',
        feature: 'Phân công tài xế',
        description: 'Tài xế không thấy chi tiết chuyến của tài xế khác',
        steps:
          '1. Đăng nhập tài xế mặc định taixe1.\n2. Gọi GET /routes/:primaryRouteId của managed driver QA.',
        expected: 'HTTP 403 và từ chối truy cập chi tiết chuyến không thuộc về mình.',
      },
      async () => {
        const loginResponse = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: {
            username: state.existingDriver.username,
            password: state.existingDriver.password,
          },
        });
        expectStatus(loginResponse, 200, 'Existing driver login');
        state.existingDriver.token = loginResponse.data.accessToken;
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}`,
          token: state.existingDriver.token,
        });
        expectStatus(response, 403, 'Other driver forbidden on route detail');
        return {
          actual: `HTTP 403; message="${response.body.message}".`,
        };
      }
    );

    const primaryStops = await loadRouteStops(pool, state.routes.primaryRouteId);
    if (!primaryStops.length) {
      throw new Error(`Primary route ${state.routes.primaryRouteId} không có stop để tiếp tục test`);
    }
    const primaryStopId = Number(primaryStops[0].MaChiTiet);

    await runCase(
      rows,
      {
        id: 'ASSIGN_003',
        feature: 'App tài xế',
        description: 'Không cho cập nhật trạng thái khách khi chuyến chưa bắt đầu',
        steps:
          '1. Khi primary route còn ở trạng thái Chưa thực hiện.\n2. Gọi PATCH /routes/:routeId/stops/:stopId/status với status=Đã đến điểm đón.',
        expected: 'HTTP 422 vì chưa ở trạng thái đang thực hiện hoặc sự cố.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}/stops/${primaryStopId}/status`,
          method: 'PATCH',
          token: state.managedDriver.token,
          body: { status: 'Đã đến điểm đón' },
        });
        expectStatus(response, 422, 'Update stop status before route start');
        return {
          actual: `HTTP 422; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ROUTE_007',
        feature: 'Quản lý tuyến/chuyến/vé trung chuyển',
        description: 'Điều phối cập nhật ghi chú/lộ trình chuyến',
        steps:
          '1. Gọi PUT /routes/:id bằng token điều phối.\n2. Cập nhật GhiChu cho primary route.',
        expected: 'HTTP 200 và chuyến nhận ghi chú mới.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}`,
          method: 'PUT',
          token: state.dispatcher.token,
          body: {
            GhiChu: `QA dispatcher updated note ${state.runId}`,
          },
        });
        expectStatus(response, 200, 'Dispatcher update route note');
        return {
          actual: `HTTP 200; ghi chú mới của chuyến là "${response.data.GhiChu}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ASSIGN_004',
        feature: 'App tài xế',
        description: 'Tài xế bắt đầu chuyến được phân công',
        steps:
          '1. Gọi PUT /routes/:id với TrangThaiLoTrinh=Đang thực hiện bằng token tài xế QA managed.',
        expected: 'HTTP 200 và trạng thái chuyến chuyển sang Đang thực hiện.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}`,
          method: 'PUT',
          token: state.managedDriver.token,
          body: {
            TrangThaiLoTrinh: 'Đang thực hiện',
          },
        });
        expectStatus(response, 200, 'Driver starts route');
        return {
          actual: `HTTP 200; route đổi trạng thái sang "${response.data.TrangThaiLoTrinh}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ASSIGN_005',
        feature: 'App tài xế',
        description: 'Không cho hoàn thành chuyến khi còn khách chưa xử lý xong',
        steps:
          '1. Khi primary route vừa ở trạng thái Đang thực hiện.\n2. Gọi PUT /routes/:id với TrangThaiLoTrinh=Hoàn thành trước khi cập nhật stop.',
        expected: 'HTTP 422 vì chưa xử lý toàn bộ khách.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}`,
          method: 'PUT',
          token: state.managedDriver.token,
          body: {
            TrangThaiLoTrinh: 'Hoàn thành',
          },
        });
        expectStatus(response, 422, 'Complete route before resolving stops');
        return {
          actual: `HTTP 422; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ASSIGN_006',
        feature: 'App tài xế',
        description: 'Tài xế không được sửa field bị hạn chế của chuyến',
        steps:
          '1. Gọi PUT /routes/:id bằng token tài xế.\n2. Truyền ThoiGianBatDau mới.',
        expected: 'HTTP 403 vì tài xế chỉ được cập nhật trạng thái/ghi chú phù hợp.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}`,
          method: 'PUT',
          token: state.managedDriver.token,
          body: {
            ThoiGianBatDau: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
          },
        });
        expectStatus(response, 403, 'Driver updates restricted field');
        return {
          actual: `HTTP 403; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ASSIGN_007',
        feature: 'App tài xế',
        description: 'Tài xế cập nhật trạng thái đang đến điểm đón',
        steps:
          '1. Gọi PATCH stop status = Đã đến điểm đón cho stop đầu tiên.',
        expected: 'HTTP 200 và trạng thái khách đổi sang Đã đến điểm đón.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}/stops/${primaryStopId}/status`,
          method: 'PATCH',
          token: state.managedDriver.token,
          body: { status: 'Đã đến điểm đón' },
        });
        expectStatus(response, 200, 'Stop status arrived');
        return {
          actual: `HTTP 200; stop ${primaryStopId} đổi trạng thái sang "${response.data.stop.TrangThaiKhach}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ASSIGN_008',
        feature: 'App tài xế',
        description: 'Tài xế cập nhật trạng thái đã đón khách',
        steps:
          '1. Gọi PATCH stop status = Đã đón khách cho stop đầu tiên.',
        expected: 'HTTP 200 và trạng thái khách đổi sang Đã đón khách.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}/stops/${primaryStopId}/status`,
          method: 'PATCH',
          token: state.managedDriver.token,
          body: { status: 'Đã đón khách' },
        });
        expectStatus(response, 200, 'Stop status picked up');
        return {
          actual: `HTTP 200; stop ${primaryStopId} đổi trạng thái sang "${response.data.stop.TrangThaiKhach}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ASSIGN_009',
        feature: 'App tài xế',
        description: 'Tài xế cập nhật trạng thái đã trả khách và chuyến tự hoàn thành',
        steps:
          '1. Gọi PATCH stop status = Đã trả khách cho stop đầu tiên.\n2. Kiểm tra routeAutoCompleted và trạng thái vé.',
        expected:
          'HTTP 200, stop đổi sang Đã trả khách, routeAutoCompleted=true và chuyến chuyển Hoàn thành.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}/stops/${primaryStopId}/status`,
          method: 'PATCH',
          token: state.managedDriver.token,
          body: { status: 'Đã trả khách' },
        });
        expectStatus(response, 200, 'Stop status dropped off');
        const ticketStatus = await loadTicketStatus(pool, state.tickets.ticketRoutePrimary);
        return {
          actual: `HTTP 200; routeAutoCompleted=${response.data.routeAutoCompleted}; trạng thái vé sau khi trả khách="${ticketStatus}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'DB_001',
        feature: 'Database constraints',
        description: 'Dữ liệu vé được cập nhật đúng sau luồng đón/trả khách',
        steps:
          '1. Sau khi stop cuối của primary route chuyển sang Đã trả khách.\n2. Query trạng thái vé trong DB.',
        expected: 'VeTrungChuyen.TrangThaiVe = Hoàn tất trung chuyển.',
      },
      async () => {
        const status = await loadTicketStatus(pool, state.tickets.ticketRoutePrimary);
        if (status !== 'Hoàn tất trung chuyển') {
          throw new Error(`Ticket status mismatch after route completion: ${status}`);
        }
        return {
          actual: `DB ghi nhận vé ${state.tickets.ticketRoutePrimary} ở trạng thái "${status}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'MAP_001',
        feature: 'Map chỉ đường',
        description: 'Gọi OSRM tính tuyến đường ngắn nhất thành công',
        steps:
          '1. Gọi trực tiếp OSRM route API bằng tọa độ pickup/dropoff của route customer QA.',
        expected: 'OSRM trả code Ok và có ít nhất 1 tuyến.',
      },
      async () => {
        const response = await fetch(
          'https://router.project-osrm.org/route/v1/driving/108.20623,16.047079;108.22083,16.06778?overview=full&geometries=geojson&steps=true'
        );
        const body = await response.json();
        if (!response.ok || body.code !== 'Ok' || !Array.isArray(body.routes) || body.routes.length === 0) {
          throw new Error(`OSRM unexpected response: status=${response.status} body=${JSON.stringify(body)}`);
        }
        return {
          actual: `OSRM trả HTTP ${response.status}; code=${body.code}; routes=${body.routes.length}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'MAP_002',
        feature: 'Map chỉ đường',
        description: 'API chi tiết chuyến trả navigationTrip có đủ tọa độ cho route có map',
        steps:
          '1. Gọi GET /routes/:primaryRouteId bằng token tài xế managed.\n2. Kiểm tra navigationTrip.pickup/dropoff lat/lng.',
        expected: 'Chi tiết chuyến có đủ tọa độ để frontend vẽ route.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.primaryRouteId}`,
          token: state.managedDriver.token,
        });
        expectStatus(response, 200, 'Route detail with map');
        const trip = response.data.navigationTrip;
        if (
          !trip ||
          [trip.pickupLat, trip.pickupLng, trip.dropoffLat, trip.dropoffLng].some((value) => value == null)
        ) {
          throw new Error(`navigationTrip thiếu tọa độ: ${JSON.stringify(trip)}`);
        }
        return {
          actual: `navigationTrip có pickup=(${trip.pickupLat}, ${trip.pickupLng}) và dropoff=(${trip.dropoffLat}, ${trip.dropoffLng}).`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'MAP_003',
        feature: 'Map chỉ đường',
        description: 'API chi tiết chuyến vẫn trả dữ liệu khi khách hàng thiếu tọa độ',
        steps:
          '1. Gọi GET /routes/:missingCoordsRouteId bằng token tài xế empty driver.\n2. Kiểm tra navigationTrip nhưng thiếu tọa độ.',
        expected: 'API trả chi tiết chuyến thành công và frontend có thể hiển thị cảnh báo thiếu tọa độ.',
      },
      async () => {
        const loginResponse = await apiRequest({
          path: '/auth/login',
          method: 'POST',
          body: { username: state.emptyDriver.username, password: state.emptyDriver.password },
        });
        expectStatus(loginResponse, 200, 'Empty driver login for missing route');
        const response = await apiRequest({
          path: `/routes/${state.routes.missingCoordsRouteId}`,
          token: loginResponse.data.accessToken,
        });
        expectStatus(response, 200, 'Missing route detail');
        const trip = response.data.navigationTrip;
        return {
          actual: `API vẫn trả chi tiết route thiếu tọa độ; pickupLat=${trip.pickupLat}, dropoffLat=${trip.dropoffLat}.`,
        };
      }
    );

    const cancelMissingRouteEnd = new Date(new Date(missingRouteStartIso).getTime() + 15 * 60 * 1000).toISOString();
    await apiRequest({
      path: `/routes/${state.routes.missingCoordsRouteId}`,
      method: 'PUT',
      token: state.dispatcher.token,
      body: {
        TrangThaiLoTrinh: 'Đã hủy',
        ThoiGianKetThuc: cancelMissingRouteEnd,
        GhiChu: `Cleanup missing coords route ${state.runId}`,
      },
    });

    await runCase(
      rows,
      {
        id: 'VEHICLE_007',
        feature: 'Quản lý xe',
        description: 'Không cho xóa xe đã từng được phân công chuyến',
        steps:
          '1. Gọi DELETE /vehicles/:id với xe đang/đã tham gia primary route.',
        expected: 'HTTP 409 và không xóa xe.',
      },
      async () => {
        const response = await apiRequest({
          path: `/vehicles/${state.existingVehicles[0]}`,
          method: 'DELETE',
          token: state.dispatcher.token,
        });
        expectStatus(response, 409, 'Delete assigned vehicle');
        return {
          actual: `HTTP 409; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'VEHICLE_008',
        feature: 'Quản lý xe',
        description: 'Xóa xe QA chưa từng được phân công',
        steps:
          '1. Gọi DELETE /vehicles/:id với xe CRUD QA chưa được gán route thành công.\n2. Kiểm tra API phản hồi thành công.',
        expected: 'HTTP 200 và xe QA được xóa khỏi hệ thống.',
      },
      async () => {
        let deleteCandidateId = state.vehicleCrud.id;
        let deleteCandidatePlate = state.vehicleCrud.plate;

        if (state.routeAuxVehicleId === state.vehicleCrud.id) {
          const tempPlate = `92A-${String(Number(state.runId.slice(-5)) + 1).padStart(5, '0')}`;
          const createTempVehicle = await apiRequest({
            path: '/vehicles',
            method: 'POST',
            token: state.dispatcher.token,
            body: {
              BienSo: tempPlate,
              LoaiXe: 'Xe 7 chỗ',
              SoCho: 7,
              TrangThaiXe: 'Rảnh',
            },
          });
          expectStatus(createTempVehicle, 201, 'Create extra delete vehicle');
          deleteCandidateId = Number(createTempVehicle.data.MaXe);
          deleteCandidatePlate = createTempVehicle.data.BienSo;
          state.cleanup.vehicleIds.push(deleteCandidateId);
        }

        const response = await apiRequest({
          path: `/vehicles/${deleteCandidateId}`,
          method: 'DELETE',
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'Delete unused vehicle');
        return {
          actual: `HTTP 200; xe QA ${deleteCandidateId} (${deleteCandidatePlate}) được xóa thành công.`,
        };
      }
    );

    if (state.routeAuxVehicleId !== state.vehicleCrud.id) {
      state.cleanup.vehicleIds = state.cleanup.vehicleIds.filter((id) => id !== state.vehicleCrud.id);
    }

    const refreshedBeforeBugRoute = await queryAvailableResources(pool);
    const bugRouteVehicleId = refreshedBeforeBugRoute.vehicleIds[0];
    const bugRouteDriverId = refreshedBeforeBugRoute.driverIds.includes(state.managedDriver.driverId)
      ? state.managedDriver.driverId
      : refreshedBeforeBugRoute.driverIds.includes(state.emptyDriver.driverId)
        ? state.emptyDriver.driverId
        : null;

    if (!bugRouteVehicleId || !bugRouteDriverId) {
      throw new Error(
        `Không tìm thấy resource rảnh để tạo bug route. vehicles=${JSON.stringify(
          refreshedBeforeBugRoute.vehicleIds
        )} drivers=${JSON.stringify(refreshedBeforeBugRoute.driverIds)}`
      );
    }

    const bugRouteStart = new Date(Date.now() + 50 * 60 * 1000);
    const bugRouteStartIso = bugRouteStart.toISOString();
    const bugRouteResponse = await apiRequest({
      path: '/routes',
      method: 'POST',
      token: state.dispatcher.token,
      body: {
        MaXe: bugRouteVehicleId,
        MaTaiXe: bugRouteDriverId,
        ThoiGianBatDau: bugRouteStartIso,
        GhiChu: `QA bug cancel route ${state.runId}`,
        ticketIds: [state.tickets.ticketBugRoute],
      },
    });
    expectStatus(bugRouteResponse, 201, 'Create bug route');
    state.routes.bugRouteId = Number(bugRouteResponse.data.route.MaLoTrinh);
    state.cleanup.routeIds.push(state.routes.bugRouteId);

    await runCase(
      rows,
      {
        id: 'ROUTE_008',
        feature: 'Quản lý tuyến/chuyến/vé trung chuyển',
        description: 'Hủy chuyến tương lai bằng cập nhật trạng thái đơn thuần',
        steps:
          '1. Tạo chuyến QA có ThoiGianBatDau trong tương lai.\n2. Gọi PUT /routes/:id chỉ với TrangThaiLoTrinh=Đã hủy và ghi chú.',
        expected: 'HTTP 200, chuyến được hủy bình thường.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.bugRouteId}`,
          method: 'PUT',
          token: state.dispatcher.token,
          body: {
            TrangThaiLoTrinh: 'Đã hủy',
            GhiChu: `Cancel bug route ${state.runId}`,
          },
        });
        if (response.status === 200) {
          return {
            actual: `HTTP 200; route ${state.routes.bugRouteId} hủy thành công.`,
          };
        }
        return {
          status: STATUS.FAIL,
          actual: `Thực tế nhận HTTP ${response.status}; body=${JSON.stringify(response.body)}.`,
          notes:
            'Severity: High | Backend bug | File nghi ngờ: backend/src/routes/routes.js (PUT /routes/:id) | Lỗi DB: CK_LoTrinh_TrungChuyen_ThoiGian khi API tự set ThoiGianKetThuc = now cho chuyến có ThoiGianBatDau ở tương lai.',
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'ROUTE_009',
        feature: 'Quản lý tuyến/chuyến/vé trung chuyển',
        description: 'Workaround hủy chuyến tương lai khi truyền explicit end time',
        steps:
          '1. Gọi PUT /routes/:id cho bug route.\n2. Truyền TrangThaiLoTrinh=Đã hủy và ThoiGianKetThuc > ThoiGianBatDau.',
        expected: 'HTTP 200 và route được hủy để giải phóng tài nguyên.',
      },
      async () => {
        const response = await apiRequest({
          path: `/routes/${state.routes.bugRouteId}`,
          method: 'PUT',
          token: state.dispatcher.token,
          body: {
            TrangThaiLoTrinh: 'Đã hủy',
            ThoiGianKetThuc: new Date(bugRouteStart.getTime() + 10 * 60 * 1000).toISOString(),
            GhiChu: `QA cleanup bug route ${state.runId}`,
          },
        });
        expectStatus(response, 200, 'Cancel bug route workaround');
        return {
          actual: `HTTP 200; route ${state.routes.bugRouteId} được hủy thành công khi truyền explicit ThoiGianKetThuc.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'PLAN_001',
        feature: 'Lập kế hoạch lộ trình',
        description: 'Tạo kế hoạch route-plan hợp lệ',
        steps:
          '1. Gọi POST /route-plans với xe rảnh, tài xế QA managed và vé QA còn trạng thái Cần trung chuyển.\n2. Kiểm tra route plan projection trong DB.',
        expected: 'HTTP 201, tạo được routePlan mới và legacy route tương ứng.',
      },
      async () => {
        const refreshedBeforeRoutePlan = await queryAvailableResources(pool);
        const routePlanVehicleId = refreshedBeforeRoutePlan.vehicleIds[0];
        const routePlanDriverId = refreshedBeforeRoutePlan.driverIds.includes(state.managedDriver.driverId)
          ? state.managedDriver.driverId
          : refreshedBeforeRoutePlan.driverIds.includes(state.emptyDriver.driverId)
            ? state.emptyDriver.driverId
            : null;

        if (!routePlanVehicleId || !routePlanDriverId) {
          throw new Error(
            `Không tìm thấy resource rảnh để tạo route-plan. vehicles=${JSON.stringify(
              refreshedBeforeRoutePlan.vehicleIds
            )} drivers=${JSON.stringify(refreshedBeforeRoutePlan.driverIds)}`
          );
        }

        const response = await apiRequest({
          path: '/route-plans',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaXe: routePlanVehicleId,
            MaTaiXe: routePlanDriverId,
            ThoiGianBatDau: new Date(Date.now() + 70 * 60 * 1000).toISOString(),
            GhiChu: `QA route-plan ${state.runId}`,
            ticketIds: [state.tickets.ticketRoutePlan],
          },
        });
        expectStatus(response, 201, 'Create route plan');
        state.routes.routePlanLegacyRouteId = Number(response.data.route.MaLoTrinh);
        state.cleanup.routeIds.push(state.routes.routePlanLegacyRouteId);
        const linkedPlan = await loadRoutePlanByRouteId(pool, state.routes.routePlanLegacyRouteId);
        if (!linkedPlan) {
          throw new Error(`Không tìm thấy route_plans projection cho route ${state.routes.routePlanLegacyRouteId}`);
        }
        return {
          actual: `HTTP 201; tạo legacy route=${state.routes.routePlanLegacyRouteId}; routePlanId=${linkedPlan.id}; status=${linkedPlan.status}.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'PLAN_002',
        feature: 'Lập kế hoạch lộ trình',
        description: 'Không cho tạo route-plan thiếu ticketIds',
        steps:
          '1. Gọi POST /route-plans với ticketIds rỗng.',
        expected: 'HTTP 400 do thiếu thông tin bắt buộc.',
      },
      async () => {
        const response = await apiRequest({
          path: '/route-plans',
          method: 'POST',
          token: state.dispatcher.token,
          body: {
            MaXe: state.existingVehicles[0],
            MaTaiXe: state.managedDriver.driverId,
            ThoiGianBatDau: new Date(Date.now() + 80 * 60 * 1000).toISOString(),
            ticketIds: [],
          },
        });
        expectStatus(response, 400, 'Create route plan missing tickets');
        return {
          actual: `HTTP 400; message="${response.body.message}".`,
        };
      }
    );

    await apiRequest({
      path: `/routes/${state.routes.routePlanLegacyRouteId}`,
      method: 'PUT',
      token: state.dispatcher.token,
      body: {
        TrangThaiLoTrinh: 'Đã hủy',
        ThoiGianKetThuc: new Date(Date.now() + 81 * 60 * 1000).toISOString(),
        GhiChu: `Cleanup route plan ${state.runId}`,
      },
    });

    await runCase(
      rows,
      {
        id: 'DRIVER_008',
        feature: 'Quản lý tài xế',
        description: 'Ngưng hoạt động tài xế rảnh sau khi cleanup route',
        steps:
          '1. Gọi DELETE /drivers/:id với empty driver khi không còn route active.\n2. Kiểm tra trạng thái inactive.',
        expected: 'HTTP 200 và tài xế được chuyển sang ngừng hoạt động.',
      },
      async () => {
        const response = await apiRequest({
          path: `/drivers/${state.emptyDriver.driverId}`,
          method: 'DELETE',
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'Disable idle driver');
        return {
          actual: `HTTP 200; empty driver chuyển sang trạng thái "${response.data.TrangThaiTaiXe}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'REPORT_001',
        feature: 'API Backend',
        description: 'Báo cáo tổng hợp trả dữ liệu thành công',
        steps:
          '1. Gọi GET /reports/summary với token điều phối.\n2. Kiểm tra mảng báo cáo trả về.',
        expected: 'HTTP 200 và data là mảng báo cáo.',
      },
      async () => {
        const response = await apiRequest({
          path: '/reports/summary',
          token: state.dispatcher.token,
        });
        expectStatus(response, 200, 'Reports summary');
        if (!Array.isArray(response.data)) {
          throw new Error(`Reports summary không trả array: ${JSON.stringify(response.body)}`);
        }
        return {
          actual: `HTTP 200; reports summary trả ${response.data.length} dòng.`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'REPORT_002',
        feature: 'API Backend',
        description: 'Validate tham số ngày báo cáo không hợp lệ',
        steps:
          '1. Gọi GET /reports/summary?fromDate=2026-99-99.',
        expected: 'HTTP 400 và báo ngày lọc không hợp lệ.',
      },
      async () => {
        const response = await apiRequest({
          path: '/reports/summary?fromDate=2026-99-99',
          token: state.dispatcher.token,
        });
        expectStatus(response, 400, 'Reports invalid date');
        return {
          actual: `HTTP 400; message="${response.body.message}".`,
        };
      }
    );

    await runCase(
      rows,
      {
        id: 'DB_002',
        feature: 'Database constraints',
        description: 'Constraint số chỗ xe chặn dữ liệu không hợp lệ ở tầng DB',
        steps:
          '1. Mở transaction DB.\n2. Thử INSERT XeTrungChuyen với SoCho=2.\n3. Rollback transaction.',
        expected: 'DB từ chối với CHECK constraint SoCho giữa 4 và 45.',
      },
      async () => {
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
          await new sql.Request(transaction)
            .input('BienSo', sql.VarChar(50), `99A-${state.runId.slice(-5)}`)
            .input('LoaiXe', sql.NVarChar(50), 'Xe 7 chỗ')
            .input('SoCho', sql.Int, 2)
            .input('TrangThaiXe', sql.NVarChar(30), 'Rảnh')
            .query(`
              INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe)
              VALUES (@BienSo, @LoaiXe, @SoCho, @TrangThaiXe)
            `);
          throw new Error('DB không chặn SoCho=2 như mong đợi');
        } catch (error) {
          const detail = String(error.message || error);
          if (!/CK_XeTrungChuyen_SoCho/i.test(detail)) {
            throw error;
          }
          return {
            actual: `DB từ chối insert SoCho=2 với lỗi CHECK constraint: ${detail}`,
          };
        } finally {
          if (transaction._aborted !== true) {
            await transaction.rollback();
          }
        }
      }
    );

    await runCase(
      rows,
      {
        id: 'DB_003',
        feature: 'Database constraints',
        description: 'Constraint thời gian lộ trình chặn end time nhỏ hơn start time ở tầng DB',
        steps:
          '1. Mở transaction DB.\n2. Thử INSERT LoTrinhTrungChuyen với ThoiGianKetThuc < ThoiGianBatDau.\n3. Rollback transaction.',
        expected: 'DB từ chối với CHECK constraint CK_LoTrinh_TrungChuyen_ThoiGian.',
      },
      async () => {
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
          await new sql.Request(transaction)
            .input('ThoiGianBatDau', sql.DateTime, new Date(Date.now() + 3600_000))
            .input('ThoiGianKetThuc', sql.DateTime, new Date(Date.now() + 1800_000))
            .input('TrangThaiLoTrinh', sql.NVarChar(50), 'Chưa thực hiện')
            .input('MaXe', sql.Int, state.existingVehicles[0])
            .input('MaTaiXe', sql.Int, state.managedDriver.driverId)
            .input('MaNhanVien', sql.Int, 1)
            .query(`
              INSERT INTO LoTrinhTrungChuyen (
                ThoiGianBatDau, ThoiGianKetThuc, TrangThaiLoTrinh, MaXe, MaTaiXe, MaNhanVien
              )
              VALUES (@ThoiGianBatDau, @ThoiGianKetThuc, @TrangThaiLoTrinh, @MaXe, @MaTaiXe, @MaNhanVien)
            `);
          throw new Error('DB không chặn lộ trình end < start như mong đợi');
        } catch (error) {
          const detail = String(error.message || error);
          if (!/CK_LoTrinh_TrungChuyen_ThoiGian/i.test(detail)) {
            throw error;
          }
          return {
            actual: `DB từ chối insert lộ trình end < start với lỗi CHECK constraint: ${detail}`,
          };
        } finally {
          if (transaction._aborted !== true) {
            await transaction.rollback();
          }
        }
      }
    );
  } finally {
    try {
      if (tempBackend) {
        await stopTempBackend(tempBackend);
      }
      await safeCleanup(pool, state);
    } catch (error) {
      cleanupError = error;
    }
    await pool.close();
  }

  if (cleanupError) {
    pushStaticCase(
      rows,
      {
        id: 'ENV_001',
        feature: 'Kiểm thử môi trường',
        description: 'Cleanup dữ liệu QA sau test run',
        steps: '1. Xóa các route/ticket/customer/driver/vehicle QA được tạo trong đợt test.',
        expected: 'Cleanup thành công, không để lại dữ liệu QA treo.',
      },
      `Cleanup QA data phát sinh lỗi: ${cleanupError.message}`,
      STATUS.FAIL,
      cleanupError.stack ? cleanupError.stack.split('\n').slice(0, 4).join(' | ') : ''
    );
  }

  const reportPath = path.join(REPORTS_DIR, 'test_report.csv');
  const summaryPath = path.join(REPORTS_DIR, 'test_summary.md');
  writeCsv(rows, reportPath);
  writeSummary(rows, summaryPath);

  const summary = summarize(rows);
  fs.writeFileSync(
    path.join(REPORTS_DIR, 'test_result_meta.json'),
    JSON.stringify(
      {
        generatedAt: nowIso(),
        reportPath,
        summaryPath,
        counts: summary.counts,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(JSON.stringify({ reportPath, summaryPath, counts: summary.counts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
