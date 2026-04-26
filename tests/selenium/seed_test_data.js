const path = require('path');

const config = require('./config');

const dotenv = require(path.join(config.backendDir, 'node_modules', 'dotenv'));
const sql = require(path.join(config.backendDir, 'node_modules', 'mssql'));
const bcrypt = require(path.join(config.backendDir, 'node_modules', 'bcryptjs'));

dotenv.config({ path: path.join(config.backendDir, '.env') });

const DISPATCHER_ROLE = 'Nhân viên điều phối';
const DRIVER_ROLE = 'Tài xế';
const PASSWORD = 'Test@12345';
const TEST_NOTE = 'SELENIUM_QA';

function buildDbConfig() {
  return {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER || 'localhost',
    port: Number(process.env.SQL_PORT || 1433),
    database: process.env.SQL_DATABASE,
    options: {
      encrypt: String(process.env.SQL_ENCRYPT || '').toLowerCase() === 'true',
      trustServerCertificate: String(process.env.SQL_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() === 'true'
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

async function createPool() {
  const pool = new sql.ConnectionPool(buildDbConfig());
  await pool.connect();
  return pool;
}

async function apiRequest({ path: requestPath, method = 'GET', token, body }) {
  const response = await fetch(`${config.apiBaseUrl}${requestPath}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  const data =
    parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'data')
      ? parsed.data
      : parsed;

  return { status: response.status, ok: response.ok, body: parsed, data, text };
}

async function upsertAccount(pool, { username, phone, role, fullName }) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const existing = await pool
    .request()
    .input('username', sql.VarChar(50), username)
    .query('SELECT TOP 1 MaTaiKhoan FROM TaiKhoanNguoiDung WHERE TenDangNhap = @username');

  if (existing.recordset.length) {
    const id = Number(existing.recordset[0].MaTaiKhoan);
    await pool
      .request()
      .input('id', sql.Int, id)
      .input('hash', sql.VarChar(255), passwordHash)
      .input('phone', sql.VarChar(15), phone)
      .input('role', sql.NVarChar(30), role)
      .query(`
        UPDATE TaiKhoanNguoiDung
        SET MatKhauMaHoa = @hash,
            SoDienThoai = @phone,
            VaiTro = @role,
            TrangThaiTaiKhoan = 1,
            YeuCauDoiMatKhau = 0,
            SoLanDangNhapSai = 0,
            KhoaTamThoiDenLuc = NULL
        WHERE MaTaiKhoan = @id
      `);
    return id;
  }

  const created = await pool
    .request()
    .input('username', sql.VarChar(50), username)
    .input('hash', sql.VarChar(255), passwordHash)
    .input('phone', sql.VarChar(15), phone)
    .input('role', sql.NVarChar(30), role)
    .query(`
      INSERT INTO TaiKhoanNguoiDung (
        TenDangNhap, MatKhauMaHoa, SoDienThoai, VaiTro, TrangThaiTaiKhoan, YeuCauDoiMatKhau
      )
      OUTPUT INSERTED.MaTaiKhoan
      VALUES (@username, @hash, @phone, @role, 1, 0)
    `);

  return Number(created.recordset[0].MaTaiKhoan);
}

async function upsertDispatcher(pool, account) {
  const accountId = await upsertAccount(pool, { ...account, role: DISPATCHER_ROLE });
  const existing = await pool
    .request()
    .input('accountId', sql.Int, accountId)
    .query('SELECT TOP 1 MaNhanVien FROM NhanVienDieuPhoi WHERE MaTaiKhoan = @accountId');

  if (existing.recordset.length) {
    const dispatcherId = Number(existing.recordset[0].MaNhanVien);
    await pool
      .request()
      .input('id', sql.Int, dispatcherId)
      .input('name', sql.NVarChar(100), account.fullName)
      .input('phone', sql.VarChar(15), account.phone)
      .query(`
        UPDATE NhanVienDieuPhoi
        SET HoTen = @name, SoDienThoai = @phone, TrangThai = N'Hoạt động'
        WHERE MaNhanVien = @id
      `);
    return { ...account, role: 'dispatcher', password: PASSWORD, accountId, dispatcherId };
  }

  const created = await pool
    .request()
    .input('name', sql.NVarChar(100), account.fullName)
    .input('phone', sql.VarChar(15), account.phone)
    .input('accountId', sql.Int, accountId)
    .query(`
      INSERT INTO NhanVienDieuPhoi (HoTen, SoDienThoai, TrangThai, MaTaiKhoan)
      OUTPUT INSERTED.MaNhanVien
      VALUES (@name, @phone, N'Hoạt động', @accountId)
    `);

  return {
    ...account,
    role: 'dispatcher',
    password: PASSWORD,
    accountId,
    dispatcherId: Number(created.recordset[0].MaNhanVien)
  };
}

async function syncExternalDriver(pool, driverId, account, status = 'Rảnh') {
  const driverCode = driverId < 1000 ? `TX${String(driverId).padStart(3, '0')}` : `TX${driverId}`;
  const workStatus = status === 'Ngừng hoạt động' ? 'INACTIVE' : 'ACTIVE';
  const availabilityStatus =
    status === 'Đã phân công'
      ? 'ASSIGNED'
      : status === 'Đang thực hiện'
        ? 'BUSY'
        : status === 'Ngừng hoạt động'
          ? 'OFF'
          : 'AVAILABLE';
  const isActive = status === 'Ngừng hoạt động' ? 0 : 1;

  const existing = await pool
    .request()
    .input('driverId', sql.Int, driverId)
    .query('SELECT TOP 1 id FROM external_drivers WHERE legacy_ma_tai_xe = @driverId');

  const request = pool
    .request()
    .input('driverId', sql.Int, driverId)
    .input('driverCode', sql.NVarChar(20), driverCode)
    .input('employeeCode', sql.NVarChar(20), account.employeeCode)
    .input('fullName', sql.NVarChar(100), account.fullName)
    .input('phone', sql.VarChar(15), account.phone)
    .input('nationalId', sql.VarChar(20), account.cccd)
    .input('licenseClass', sql.NVarChar(50), account.licenseType || 'B2')
    .input('workStatus', sql.NVarChar(20), workStatus)
    .input('availabilityStatus', sql.NVarChar(20), availabilityStatus)
    .input('isActive', sql.Bit, isActive);

  if (existing.recordset.length) {
    await request.query(`
      UPDATE external_drivers
      SET driver_code = @driverCode,
          employee_code = @employeeCode,
          full_name = @fullName,
          phone = @phone,
          national_id = @nationalId,
          license_class = @licenseClass,
          work_status = @workStatus,
          availability_status = @availabilityStatus,
          is_active = @isActive,
          updated_at = GETDATE()
      WHERE legacy_ma_tai_xe = @driverId
    `);
    return;
  }

  await request.query(`
    INSERT INTO external_drivers (
      legacy_ma_tai_xe, driver_code, employee_code, full_name, phone, national_id,
      license_class, work_status, availability_status, is_active
    )
    VALUES (
      @driverId, @driverCode, @employeeCode, @fullName, @phone, @nationalId,
      @licenseClass, @workStatus, @availabilityStatus, @isActive
    )
  `);
}

async function upsertDriver(pool, account, status = 'Rảnh') {
  const accountId = await upsertAccount(pool, { ...account, role: DRIVER_ROLE });
  const existing = await pool
    .request()
    .input('accountId', sql.Int, accountId)
    .query('SELECT TOP 1 MaTaiXe FROM TaiXe WHERE MaTaiKhoan = @accountId');

  if (existing.recordset.length) {
    const driverId = Number(existing.recordset[0].MaTaiXe);
    await pool
      .request()
      .input('id', sql.Int, driverId)
      .input('code', sql.VarChar(20), account.employeeCode)
      .input('name', sql.NVarChar(100), account.fullName)
      .input('phone', sql.VarChar(15), account.phone)
      .input('cccd', sql.VarChar(20), account.cccd)
      .input('license', sql.NVarChar(20), account.licenseType || 'B2')
      .input('status', sql.NVarChar(30), status)
      .query(`
        UPDATE TaiXe
        SET MaNhanVienTaiXe = @code,
            HoTen = @name,
            SoDienThoai = @phone,
            CCCD = @cccd,
            LoaiBangLai = @license,
            TrangThaiTaiXe = @status
        WHERE MaTaiXe = @id
      `);
    await syncExternalDriver(pool, driverId, account, status);
    return { ...account, role: 'driver', password: PASSWORD, accountId, driverId };
  }

  const created = await pool
    .request()
    .input('code', sql.VarChar(20), account.employeeCode)
    .input('name', sql.NVarChar(100), account.fullName)
    .input('phone', sql.VarChar(15), account.phone)
    .input('cccd', sql.VarChar(20), account.cccd)
    .input('license', sql.NVarChar(20), account.licenseType || 'B2')
    .input('status', sql.NVarChar(30), status)
    .input('accountId', sql.Int, accountId)
    .query(`
      INSERT INTO TaiXe (MaNhanVienTaiXe, HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe, MaTaiKhoan)
      OUTPUT INSERTED.MaTaiXe
      VALUES (@code, @name, @phone, @cccd, @license, @status, @accountId)
    `);

  const driverId = Number(created.recordset[0].MaTaiXe);
  await syncExternalDriver(pool, driverId, account, status);
  return { ...account, role: 'driver', password: PASSWORD, accountId, driverId };
}

async function cancelOldQaRoutes(pool) {
  const result = await pool.request().input('note', sql.NVarChar(100), `%${TEST_NOTE}%`).query(`
    SELECT MaLoTrinh, MaXe, MaTaiXe
    FROM LoTrinhTrungChuyen
    WHERE ISNULL(GhiChu, N'') LIKE @note
      AND TrangThaiLoTrinh IN (N'Chưa thực hiện', N'Đang thực hiện', N'Đang gặp sự cố')
  `);

  for (const route of result.recordset) {
    await pool
      .request()
      .input('id', sql.Int, route.MaLoTrinh)
      .query(`
        UPDATE LoTrinhTrungChuyen
        SET TrangThaiLoTrinh = N'Đã hủy',
            ThoiGianKetThuc = CASE
              WHEN ThoiGianBatDau > GETDATE() THEN DATEADD(MINUTE, 1, ThoiGianBatDau)
              ELSE GETDATE()
            END
        WHERE MaLoTrinh = @id
      `);
    await pool.request().input('id', sql.Int, route.MaXe).query("UPDATE XeTrungChuyen SET TrangThaiXe = N'Rảnh' WHERE MaXe = @id");
    await pool.request().input('id', sql.Int, route.MaTaiXe).query("UPDATE TaiXe SET TrangThaiTaiXe = N'Rảnh' WHERE MaTaiXe = @id");
  }
}

async function createVehicle(pool, runId, label) {
  const suffix = String((Number(runId.slice(-5)) + label.length * 137) % 100000).padStart(5, '0');
  const plate = `${label}-`.startsWith('99') ? `${label}-${suffix}` : `99${label}-${suffix}`;
  const normalizedPlate = /^99[A-Z]-\d{5}$/.test(plate) ? plate : `99A-${suffix}`;

  const created = await pool
    .request()
    .input('plate', sql.VarChar(50), normalizedPlate)
    .input('type', sql.NVarChar(50), 'Xe 16 chỗ')
    .input('seats', sql.Int, 16)
    .query(`
      INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe)
      OUTPUT INSERTED.MaXe, INSERTED.BienSo
      VALUES (@plate, @type, @seats, N'Rảnh')
    `);

  const vehicleId = Number(created.recordset[0].MaXe);
  const plateNumber = created.recordset[0].BienSo;

  await pool
    .request()
    .input('vehicleId', sql.Int, vehicleId)
    .input('vehicleCode', sql.NVarChar(20), `XE${String(vehicleId).padStart(8, '0')}`)
    .input('plate', sql.VarChar(20), plateNumber)
    .input('vehicleType', sql.NVarChar(50), 'Xe 16 chỗ')
    .input('capacity', sql.Int, 16)
    .query(`
      INSERT INTO external_vehicles (
        legacy_ma_xe, vehicle_code, plate_number, vehicle_type, capacity, seat_count,
        operational_status, availability_status, is_active
      )
      VALUES (@vehicleId, @vehicleCode, @plate, @vehicleType, @capacity, @capacity, N'ACTIVE', N'AVAILABLE', 1)
    `);

  return { id: vehicleId, plate: plateNumber };
}

async function createCustomerTicket(pool, runId, label, options = {}) {
  const phone = `08${String((Number(runId.slice(-8)) + label.length * 193) % 100000000).padStart(8, '0')}`;
  const fullName = `Selenium ${label} ${runId.slice(-6)}`;
  const pickup = options.pickup || `56 Chu Mạnh Trinh ${runId.slice(-4)}`;
  const dropoff = options.dropoff || 'Bến xe Đà Nẵng';

  const request = pool
    .request()
    .input('name', sql.NVarChar(100), fullName)
    .input('phone', sql.VarChar(15), phone)
    .input('pickup', sql.NVarChar(255), pickup)
    .input('dropoff', sql.NVarChar(255), dropoff)
    .input('pickupLat', sql.Decimal(10, 7), options.withCoords === false ? null : 16.0612)
    .input('pickupLng', sql.Decimal(10, 7), options.withCoords === false ? null : 108.2218)
    .input('dropoffLat', sql.Decimal(10, 7), options.withCoords === false ? null : 16.0677)
    .input('dropoffLng', sql.Decimal(10, 7), options.withCoords === false ? null : 108.1886);

  const customer = await request.query(`
    INSERT INTO KhachHang (
      TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai,
      DiaChiDonLat, DiaChiDonLng, DiaChiTraLat, DiaChiTraLng
    )
    OUTPUT INSERTED.MaKhachHang
    VALUES (
      @name, @phone, @pickup, @dropoff, N'Hoạt động',
      @pickupLat, @pickupLng, @dropoffLat, @dropoffLng
    )
  `);

  const customerId = Number(customer.recordset[0].MaKhachHang);
  await pool
    .request()
    .input('customerId', sql.Int, customerId)
    .input('customerCode', sql.NVarChar(20), `KH${String(customerId).padStart(8, '0')}`)
    .input('name', sql.NVarChar(100), fullName)
    .input('phone', sql.VarChar(15), phone)
    .input('pickup', sql.NVarChar(255), pickup)
    .input('dropoff', sql.NVarChar(255), dropoff)
    .query(`
      INSERT INTO external_customers (
        legacy_ma_khach_hang, customer_code, full_name, phone,
        default_pickup_address, default_dropoff_address, status, is_active
      )
      VALUES (@customerId, @customerCode, @name, @phone, @pickup, @dropoff, N'ACTIVE', 1)
    `);

  const ticket = await pool
    .request()
    .input('slot', sql.NVarChar(100), '07:00 - 08:00')
    .input('seats', sql.Int, 1)
    .input('customerId', sql.Int, customerId)
    .query(`
      INSERT INTO VeTrungChuyen (KhungGioTrungChuyen, SoLuongGhe, TrangThaiVe, MaKhachHang)
      OUTPUT INSERTED.MaVe
      VALUES (@slot, @seats, N'Cần trung chuyển', @customerId)
    `);

  return {
    customerId,
    ticketId: Number(ticket.recordset[0].MaVe),
    fullName,
    phone,
    pickup,
    dropoff
  };
}

async function loginDispatcher(username, password) {
  const response = await apiRequest({
    path: '/auth/login',
    method: 'POST',
    body: { username, password }
  });

  if (response.status !== 200 || !response.data?.accessToken) {
    throw new Error(`Không đăng nhập được dispatcher test qua API. HTTP ${response.status}: ${response.text}`);
  }

  return response.data.accessToken;
}

async function createRouteViaApi(token, { vehicleId, driverId, ticketId, note, minutesAhead = 20 }) {
  const response = await apiRequest({
    path: '/routes',
    method: 'POST',
    token,
    body: {
      MaXe: vehicleId,
      MaTaiXe: driverId,
      ThoiGianBatDau: new Date(Date.now() + minutesAhead * 60 * 1000).toISOString(),
      GhiChu: note,
      ticketIds: [ticketId]
    }
  });

  if (response.status !== 201 || !response.data?.route?.MaLoTrinh) {
    throw new Error(`Không tạo được route QA qua API. HTTP ${response.status}: ${response.text}`);
  }

  return {
    id: Number(response.data.route.MaLoTrinh),
    code: `CX${String(response.data.route.MaLoTrinh).padStart(8, '0')}`
  };
}

async function prepareTestData() {
  const runId = `SEL${Date.now()}`;
  const pool = await createPool();
  try {
    await cancelOldQaRoutes(pool);

    const dispatcher = await upsertDispatcher(pool, {
      username: 'dispatcher_test',
      phone: '0890000001',
      fullName: 'Dispatcher Selenium Test'
    });
    const emptyDriver = await upsertDriver(pool, {
      username: 'driver_test',
      phone: '0890000002',
      fullName: 'Driver Selenium Test',
      employeeCode: 'SELDRV001',
      cccd: '089000000002',
      licenseType: 'B2'
    });
    const assignedDriver = await upsertDriver(pool, {
      username: 'driver_assigned_test',
      phone: '0890000003',
      fullName: 'Driver Assigned Selenium',
      employeeCode: 'SELDRV002',
      cccd: '089000000003',
      licenseType: 'B2'
    });
    const missingCoordsDriver = await upsertDriver(pool, {
      username: 'driver_missing_map_test',
      phone: '0890000004',
      fullName: 'Driver Missing Map Selenium',
      employeeCode: 'SELDRV003',
      cccd: '089000000004',
      licenseType: 'B2'
    });
    const cancelDriver = await upsertDriver(pool, {
      username: 'driver_cancel_test',
      phone: '0890000005',
      fullName: 'Driver Cancel Selenium',
      employeeCode: 'SELDRV004',
      cccd: '089000000005',
      licenseType: 'B2'
    });
    const planDriver = await upsertDriver(pool, {
      username: `driver_plan_${runId.slice(-6)}`,
      phone: `0891${runId.slice(-6)}`,
      fullName: `Driver Plan Selenium ${runId.slice(-4)}`,
      employeeCode: `SELP${runId.slice(-5)}`,
      cccd: `0891${runId.slice(-8)}`,
      licenseType: 'B2'
    });

    const token = await loginDispatcher(dispatcher.username, dispatcher.password);

    const routeVehicle = await createVehicle(pool, runId, '99A');
    const missingRouteVehicle = await createVehicle(pool, `${runId}1`, '99B');
    const planVehicle = await createVehicle(pool, `${runId}2`, '99C');
    const cancelVehicle = await createVehicle(pool, `${runId}3`, '99D');
    const routeTicket = await createCustomerTicket(pool, runId, 'RouteWithMap', { withCoords: true });
    const missingRouteTicket = await createCustomerTicket(pool, `${runId}1`, 'RouteNoCoords', {
      withCoords: false,
      pickup: `Selenium Unknown Pickup ${runId}`,
      dropoff: `Selenium Unknown Dropoff ${runId}`
    });
    const planTicket = await createCustomerTicket(pool, `${runId}2`, 'PlanTicket', { withCoords: true });
    const cancelTicket = await createCustomerTicket(pool, `${runId}3`, 'CancelTicket', { withCoords: true });

    const routeWithMap = await createRouteViaApi(token, {
      vehicleId: routeVehicle.id,
      driverId: assignedDriver.driverId,
      ticketId: routeTicket.ticketId,
      note: `${TEST_NOTE} route with map ${runId}`,
      minutesAhead: 20
    });
    const routeMissingCoords = await createRouteViaApi(token, {
      vehicleId: missingRouteVehicle.id,
      driverId: missingCoordsDriver.driverId,
      ticketId: missingRouteTicket.ticketId,
      note: `${TEST_NOTE} route missing coords ${runId}`,
      minutesAhead: 40
    });
    await pool
      .request()
      .input('routeId', sql.Int, routeMissingCoords.id)
      .query(`
        UPDATE ChiTietLoTrinh
        SET DiemDonLat = NULL,
            DiemDonLng = NULL,
            DiemTraLat = NULL,
            DiemTraLng = NULL
        WHERE MaLoTrinh = @routeId
      `);
    const routeToCancel = await createRouteViaApi(token, {
      vehicleId: cancelVehicle.id,
      driverId: cancelDriver.driverId,
      ticketId: cancelTicket.ticketId,
      note: `${TEST_NOTE} route to cancel ${runId}`,
      minutesAhead: 60
    });

    return {
      runId,
      dispatcher,
      emptyDriver,
      assignedDriver,
      missingCoordsDriver,
      cancelDriver,
      planDriver,
      routeWithMap,
      routeMissingCoords,
      routeToCancel,
      routeVehicle,
      missingRouteVehicle,
      planVehicle,
      cancelVehicle,
      routeTicket,
      missingRouteTicket,
      planTicket,
      cancelTicket,
      accounts: [
        { role: 'Nhân viên điều phối', username: dispatcher.username, password: dispatcher.password },
        { role: 'Tài xế không có chuyến', username: emptyDriver.username, password: emptyDriver.password },
        { role: 'Tài xế có chuyến/map', username: assignedDriver.username, password: assignedDriver.password },
        { role: 'Tài xế route thiếu tọa độ', username: missingCoordsDriver.username, password: missingCoordsDriver.password }
      ]
    };
  } finally {
    await pool.close();
  }
}

module.exports = {
  PASSWORD,
  prepareTestData,
  apiRequest
};
