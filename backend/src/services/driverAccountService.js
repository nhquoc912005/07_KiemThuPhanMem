const { query } = require('../db');
const { DRIVER_STATUSES } = require('../constants/status');
const { DRIVER_ROLE, hashPassword } = require('../utils/auth');

const DEFAULT_DRIVER_PASSWORD = '123456';
const GENERATED_EMPLOYEE_CODE_PREFIX = 'NVTX';
const REQUIRED_EMPLOYEE_CODE_MESSAGE = 'Vui lòng nhập mã nhân viên';

function buildDriverCode(legacyId) {
  if (legacyId < 1000) {
    return `TX${String(legacyId).padStart(3, '0')}`;
  }

  return `TX${legacyId}`;
}

function buildGeneratedEmployeeCode(legacyId) {
  if (legacyId < 1000) {
    return `${GENERATED_EMPLOYEE_CODE_PREFIX}${String(legacyId).padStart(3, '0')}`;
  }

  return `${GENERATED_EMPLOYEE_CODE_PREFIX}${legacyId}`;
}

function toExternalWorkStatus(driverStatus) {
  return driverStatus === DRIVER_STATUSES.INACTIVE ? 'INACTIVE' : 'ACTIVE';
}

function toExternalAvailabilityStatus(driverStatus) {
  switch (driverStatus) {
    case DRIVER_STATUSES.ASSIGNED:
      return 'ASSIGNED';
    case DRIVER_STATUSES.IN_PROGRESS:
      return 'BUSY';
    case DRIVER_STATUSES.UNAVAILABLE:
    case DRIVER_STATUSES.INACTIVE:
      return 'OFF';
    default:
      return 'AVAILABLE';
  }
}

function toExternalIsActive(driverStatus) {
  return driverStatus !== DRIVER_STATUSES.INACTIVE;
}

function toAccountStatus(driverStatus) {
  return driverStatus !== DRIVER_STATUSES.INACTIVE;
}

function buildGeneratedDriverUsername(legacyId) {
  return `taixe${legacyId}`;
}

function buildDriverConflict(message, status = 409, code = 'CONFLICT', fieldErrors = null) {
  return Object.assign(new Error(message), { status, code, fieldErrors });
}

function getFirstFieldError(fieldErrors) {
  return (
    fieldErrors.MaNhanVien ||
    fieldErrors.SoDienThoai ||
    fieldErrors.CCCD ||
    fieldErrors.TenDangNhap ||
    'Dữ liệu tài xế không hợp lệ'
  );
}

async function usernameExists(client, username) {
  const result = await query(
    `
      SELECT 1
      FROM TaiKhoanNguoiDung
      WHERE TenDangNhap = $1
      LIMIT 1
    `,
    [username],
    client
  );

  return result.rows.length > 0;
}

async function buildAutoDriverUsername(client, legacyId) {
  const preferredUsername = buildGeneratedDriverUsername(legacyId);
  if (!(await usernameExists(client, preferredUsername))) {
    return preferredUsername;
  }

  const fallbackUsername = `${preferredUsername}_${legacyId}`;
  if (!(await usernameExists(client, fallbackUsername))) {
    return fallbackUsername;
  }

  throw buildDriverConflict('Không thể tự tạo tên đăng nhập cho tài xế. Vui lòng thử lại.');
}

async function assertUniqueDriverIdentity(client, { username, employeeCode, phoneNumber, cccd }) {
  if (username) {
    const duplicatedUsername = await usernameExists(client, username);
    if (duplicatedUsername) {
      throw buildDriverConflict('Tên đăng nhập đã tồn tại', 409, 'CONFLICT', {
        TenDangNhap: 'Tên đăng nhập đã tồn tại'
      });
    }
  }

  const duplicatedAccountPhone = await query(
    `
      SELECT 1
      FROM TaiKhoanNguoiDung
      WHERE SoDienThoai = $1
      LIMIT 1
    `,
    [phoneNumber],
    client
  );

  if (duplicatedAccountPhone.rows.length > 0) {
    throw buildDriverConflict('Số điện thoại đã tồn tại', 409, 'CONFLICT', {
      SoDienThoai: 'Số điện thoại đã tồn tại'
    });
  }

  const duplicatedDriver = await query(
    `
      SELECT MaNhanVienTaiXe, SoDienThoai, CCCD
      FROM TaiXe
      WHERE ($1::text IS NOT NULL AND MaNhanVienTaiXe = $1)
         OR SoDienThoai = $2
         OR CCCD = $3
      LIMIT 1
    `,
    [employeeCode || null, phoneNumber, cccd],
    client
  );

  if (duplicatedDriver.rows.length === 0) {
    return;
  }

  const duplicated = duplicatedDriver.rows[0];
  const fieldErrors = {};

  if (employeeCode && duplicated.MaNhanVienTaiXe === employeeCode) {
    fieldErrors.MaNhanVien = 'Mã nhân viên đã tồn tại';
  }

  if (duplicated.SoDienThoai === phoneNumber) {
    fieldErrors.SoDienThoai = 'Số điện thoại đã tồn tại';
  }

  if (duplicated.CCCD === cccd) {
    fieldErrors.CCCD = 'CCCD đã tồn tại';
  }

  throw buildDriverConflict(getFirstFieldError(fieldErrors), 409, 'CONFLICT', fieldErrors);
}

async function createDriverWithAccount(
  client,
  {
    MaNhanVien = null,
    HoTen,
    SoDienThoai,
    CCCD,
    LoaiBangLai = null,
    TrangThaiTaiXe = DRIVER_STATUSES.AVAILABLE,
    TenDangNhap = null,
    MatKhau = null,
    allowAutoEmployeeCode = true
  }
) {
  const normalizedEmployeeCode = MaNhanVien ? String(MaNhanVien).trim() : null;

  if (!normalizedEmployeeCode && !allowAutoEmployeeCode) {
    throw buildDriverConflict(REQUIRED_EMPLOYEE_CODE_MESSAGE, 400, 'VALIDATION_ERROR', {
      MaNhanVien: REQUIRED_EMPLOYEE_CODE_MESSAGE
    });
  }

  await assertUniqueDriverIdentity(client, {
    username: TenDangNhap ? String(TenDangNhap).trim() : null,
    employeeCode: normalizedEmployeeCode,
    phoneNumber: SoDienThoai,
    cccd: CCCD
  });

  const legacyInsert = await query(
    `
      INSERT INTO TaiXe (MaNhanVienTaiXe, HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING MaTaiXe
    `,
    [normalizedEmployeeCode, HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe],
    client
  );

  const legacyId = legacyInsert.rows[0].MaTaiXe;
  const employeeCode = normalizedEmployeeCode || buildGeneratedEmployeeCode(legacyId);
  const username = TenDangNhap ? String(TenDangNhap).trim() : await buildAutoDriverUsername(client, legacyId);
  const generatedPassword = MatKhau ? null : DEFAULT_DRIVER_PASSWORD;
  const requiresPasswordChange = Boolean(generatedPassword);
  const passwordHash = await hashPassword(MatKhau || DEFAULT_DRIVER_PASSWORD);

  if (!normalizedEmployeeCode) {
    await query(
      `
        UPDATE TaiXe
        SET MaNhanVienTaiXe = $1
        WHERE MaTaiXe = $2
      `,
      [employeeCode, legacyId],
      client
    );
  }

  const accountInsert = await query(
    `
      INSERT INTO TaiKhoanNguoiDung (
        TenDangNhap,
        MatKhauMaHoa,
        SoDienThoai,
        VaiTro,
        TrangThaiTaiKhoan,
        YeuCauDoiMatKhau
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        MaTaiKhoan,
        TenDangNhap,
        SoDienThoai,
        VaiTro,
        TrangThaiTaiKhoan,
        YeuCauDoiMatKhau
    `,
    [
      username,
      passwordHash,
      SoDienThoai,
      DRIVER_ROLE,
      toAccountStatus(TrangThaiTaiXe),
      requiresPasswordChange
    ],
    client
  );

  const account = accountInsert.rows[0];

  await query(
    `
      UPDATE TaiXe
      SET MaTaiKhoan = $1
      WHERE MaTaiXe = $2
    `,
    [account.MaTaiKhoan, legacyId],
    client
  );

  await query(
    `
      INSERT INTO external_drivers (
        legacy_ma_tai_xe,
        driver_code,
        employee_code,
        full_name,
        phone,
        national_id,
        license_class,
        work_status,
        availability_status,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      legacyId,
      buildDriverCode(legacyId),
      employeeCode,
      HoTen,
      SoDienThoai,
      CCCD,
      LoaiBangLai,
      toExternalWorkStatus(TrangThaiTaiXe),
      toExternalAvailabilityStatus(TrangThaiTaiXe),
      toExternalIsActive(TrangThaiTaiXe)
    ],
    client
  );

  return {
    legacyId,
    MaNhanVien: employeeCode,
    account: {
      MaTaiKhoan: account.MaTaiKhoan,
      TenDangNhap: account.TenDangNhap,
      SoDienThoai: account.SoDienThoai,
      VaiTro: account.VaiTro,
      TrangThaiTaiKhoan: account.TrangThaiTaiKhoan,
      YeuCauDoiMatKhau: Boolean(account.YeuCauDoiMatKhau),
      MatKhauMacDinh: generatedPassword
    }
  };
}

async function syncDriverAccountState(client, { MaTaiXe, SoDienThoai, TrangThaiTaiXe }) {
  const result = await query(
    `
      SELECT tx.MaTaiKhoan
      FROM TaiXe tx
      WHERE tx.MaTaiXe = $1
      LIMIT 1
    `,
    [MaTaiXe],
    client
  );

  const accountId = result.rows[0]?.MaTaiKhoan;
  if (!accountId) {
    return null;
  }

  await query(
    `
      UPDATE TaiKhoanNguoiDung
      SET SoDienThoai = $1,
          TrangThaiTaiKhoan = $2
      WHERE MaTaiKhoan = $3
    `,
    [SoDienThoai, toAccountStatus(TrangThaiTaiXe), accountId],
    client
  );

  return {
    MaTaiKhoan: accountId,
    TrangThaiTaiKhoan: toAccountStatus(TrangThaiTaiXe)
  };
}

module.exports = {
  DEFAULT_DRIVER_PASSWORD,
  createDriverWithAccount,
  syncDriverAccountState
};
