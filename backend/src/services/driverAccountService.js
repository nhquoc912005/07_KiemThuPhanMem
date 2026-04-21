const { sql } = require('../db');
const { DRIVER_STATUSES } = require('../constants/status');
const { DRIVER_ROLE, hashPassword } = require('../utils/auth');

const DEFAULT_DRIVER_PASSWORD = '12345678';
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
      return 'OFF';
    case DRIVER_STATUSES.INACTIVE:
      return 'OFF';
    default:
      return 'AVAILABLE';
  }
}

function toExternalIsActive(driverStatus) {
  return driverStatus === DRIVER_STATUSES.INACTIVE ? 0 : 1;
}

function toAccountStatus(driverStatus) {
  return driverStatus === DRIVER_STATUSES.INACTIVE ? 0 : 1;
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

async function usernameExists(db, username) {
  const result = await db
    .request()
    .input('username', sql.VarChar(50), username)
    .query(`
      SELECT TOP 1 1
      FROM TaiKhoanNguoiDung
      WHERE TenDangNhap = @username
    `);

  return result.recordset.length > 0;
}

async function buildAutoDriverUsername(db, legacyId) {
  const preferredUsername = buildGeneratedDriverUsername(legacyId);
  if (!(await usernameExists(db, preferredUsername))) {
    return preferredUsername;
  }

  const fallbackUsername = `${preferredUsername}_${legacyId}`;
  if (!(await usernameExists(db, fallbackUsername))) {
    return fallbackUsername;
  }

  throw buildDriverConflict('Không thể tự tạo tên đăng nhập cho tài xế. Vui lòng thử lại.');
}

async function assertUniqueDriverIdentity(db, { username, employeeCode, phoneNumber, cccd }) {
  if (username) {
    const duplicatedUsername = await usernameExists(db, username);
    if (duplicatedUsername) {
      throw buildDriverConflict('Tên đăng nhập đã tồn tại', 409, 'CONFLICT', {
        TenDangNhap: 'Tên đăng nhập đã tồn tại'
      });
    }
  }

  const duplicatedAccountPhone = await db
    .request()
    .input('phone', sql.VarChar(15), phoneNumber)
    .query(`
      SELECT TOP 1 1
      FROM TaiKhoanNguoiDung
      WHERE SoDienThoai = @phone
    `);

  if (duplicatedAccountPhone.recordset.length > 0) {
    throw buildDriverConflict('Số điện thoại đã tồn tại', 409, 'CONFLICT', {
      SoDienThoai: 'Số điện thoại đã tồn tại'
    });
  }

  const duplicatedDriver = await db
    .request()
    .input('employeeCode', sql.VarChar(20), employeeCode || null)
    .input('phone', sql.VarChar(15), phoneNumber)
    .input('cccd', sql.VarChar(20), cccd)
    .query(`
      SELECT TOP 1 MaNhanVienTaiXe, SoDienThoai, CCCD
      FROM TaiXe
      WHERE (@employeeCode IS NOT NULL AND MaNhanVienTaiXe = @employeeCode)
         OR SoDienThoai = @phone
         OR CCCD = @cccd
    `);

  if (duplicatedDriver.recordset.length === 0) {
    return;
  }

  const duplicated = duplicatedDriver.recordset[0];
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
  db,
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

  await assertUniqueDriverIdentity(db, {
    username: TenDangNhap ? String(TenDangNhap).trim() : null,
    employeeCode: normalizedEmployeeCode,
    phoneNumber: SoDienThoai,
    cccd: CCCD
  });

  const legacyInsert = await db
    .request()
    .input('MaNhanVienTaiXe', sql.VarChar(20), normalizedEmployeeCode)
    .input('HoTen', sql.NVarChar(100), HoTen)
    .input('SoDienThoai', sql.VarChar(15), SoDienThoai)
    .input('CCCD', sql.VarChar(20), CCCD)
    .input('LoaiBangLai', sql.NVarChar(50), LoaiBangLai)
    .input('TrangThaiTaiXe', sql.NVarChar(30), TrangThaiTaiXe)
    .query(`
      INSERT INTO TaiXe (MaNhanVienTaiXe, HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe)
      OUTPUT INSERTED.MaTaiXe
      VALUES (@MaNhanVienTaiXe, @HoTen, @SoDienThoai, @CCCD, @LoaiBangLai, @TrangThaiTaiXe)
    `);

  const legacyId = legacyInsert.recordset[0].MaTaiXe;
  const employeeCode = normalizedEmployeeCode || buildGeneratedEmployeeCode(legacyId);
  const username = TenDangNhap ? String(TenDangNhap).trim() : await buildAutoDriverUsername(db, legacyId);
  const generatedPassword = MatKhau ? null : DEFAULT_DRIVER_PASSWORD;
  const requiresPasswordChange = generatedPassword ? 1 : 0;
  const passwordHash = await hashPassword(MatKhau || DEFAULT_DRIVER_PASSWORD);

  if (!normalizedEmployeeCode) {
    await db
      .request()
      .input('MaTaiXe', sql.Int, legacyId)
      .input('MaNhanVienTaiXe', sql.VarChar(20), employeeCode)
      .query(`
        UPDATE TaiXe
        SET MaNhanVienTaiXe = @MaNhanVienTaiXe
        WHERE MaTaiXe = @MaTaiXe
      `);
  }

  const accountInsert = await db
    .request()
    .input('TenDangNhap', sql.VarChar(50), username)
    .input('MatKhauMaHoa', sql.VarChar(255), passwordHash)
    .input('SoDienThoai', sql.VarChar(15), SoDienThoai)
    .input('VaiTro', sql.NVarChar(30), DRIVER_ROLE)
    .input('TrangThaiTaiKhoan', sql.Bit, toAccountStatus(TrangThaiTaiXe))
    .input('YeuCauDoiMatKhau', sql.Bit, requiresPasswordChange)
    .query(`
      INSERT INTO TaiKhoanNguoiDung (
        TenDangNhap,
        MatKhauMaHoa,
        SoDienThoai,
        VaiTro,
        TrangThaiTaiKhoan,
        YeuCauDoiMatKhau
      )
      OUTPUT
        INSERTED.MaTaiKhoan,
        INSERTED.TenDangNhap,
        INSERTED.SoDienThoai,
        INSERTED.VaiTro,
        INSERTED.TrangThaiTaiKhoan,
        INSERTED.YeuCauDoiMatKhau
      VALUES (
        @TenDangNhap,
        @MatKhauMaHoa,
        @SoDienThoai,
        @VaiTro,
        @TrangThaiTaiKhoan,
        @YeuCauDoiMatKhau
      )
    `);

  const account = accountInsert.recordset[0];

  await db
    .request()
    .input('MaTaiXe', sql.Int, legacyId)
    .input('MaTaiKhoan', sql.Int, account.MaTaiKhoan)
    .query(`
      UPDATE TaiXe
      SET MaTaiKhoan = @MaTaiKhoan
      WHERE MaTaiXe = @MaTaiXe
    `);

  await db
    .request()
    .input('legacyId', sql.Int, legacyId)
    .input('driverCode', sql.NVarChar(20), buildDriverCode(legacyId))
    .input('employeeCode', sql.NVarChar(20), employeeCode)
    .input('fullName', sql.NVarChar(100), HoTen)
    .input('phone', sql.VarChar(15), SoDienThoai)
    .input('nationalId', sql.VarChar(20), CCCD)
    .input('licenseClass', sql.NVarChar(50), LoaiBangLai)
    .input('workStatus', sql.NVarChar(20), toExternalWorkStatus(TrangThaiTaiXe))
    .input('availabilityStatus', sql.NVarChar(20), toExternalAvailabilityStatus(TrangThaiTaiXe))
    .input('isActive', sql.Bit, toExternalIsActive(TrangThaiTaiXe))
    .query(`
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
      VALUES (
        @legacyId,
        @driverCode,
        @employeeCode,
        @fullName,
        @phone,
        @nationalId,
        @licenseClass,
        @workStatus,
        @availabilityStatus,
        @isActive
      )
    `);

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

async function syncDriverAccountState(db, { MaTaiXe, SoDienThoai, TrangThaiTaiXe }) {
  const result = await db
    .request()
    .input('id', sql.Int, MaTaiXe)
    .query(`
      SELECT TOP 1 tx.MaTaiKhoan
      FROM TaiXe tx
      WHERE tx.MaTaiXe = @id
    `);

  const accountId = result.recordset[0]?.MaTaiKhoan;
  if (!accountId) {
    return null;
  }

  await db
    .request()
    .input('id', sql.Int, accountId)
    .input('SoDienThoai', sql.VarChar(15), SoDienThoai)
    .input('TrangThaiTaiKhoan', sql.Bit, toAccountStatus(TrangThaiTaiXe))
    .query(`
      UPDATE TaiKhoanNguoiDung
      SET SoDienThoai = @SoDienThoai,
          TrangThaiTaiKhoan = @TrangThaiTaiKhoan
      WHERE MaTaiKhoan = @id
    `);

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
