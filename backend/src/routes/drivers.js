const express = require('express');

const { getPool, sql } = require('../db');
const { ACTIVE_ROUTE_STATUSES, DRIVER_STATUSES } = require('../constants/status');
const {
  createDriverWithAccount,
  syncDriverAccountState
} = require('../services/driverAccountService');
const { sendError, sendSuccess } = require('../utils/http');
const {
  isValidNationalId,
  isValidPhoneNumber,
  normalizeVietnamPhoneNumber,
  toPositiveInteger
} = require('../utils/validation');

const router = express.Router();

const DRIVER_SELECT_COLUMNS = `
  d.legacy_ma_tai_xe AS MaTaiXe,
  COALESCE(tx.MaNhanVienTaiXe, d.employee_code) AS MaNhanVien,
  d.full_name AS HoTen,
  d.phone AS SoDienThoai,
  d.national_id AS CCCD,
  d.license_class AS LoaiBangLai,
  CASE
    WHEN d.work_status = N'INACTIVE' OR d.is_active = 0 THEN N'${DRIVER_STATUSES.INACTIVE}'
    WHEN d.availability_status = N'ASSIGNED' THEN N'${DRIVER_STATUSES.ASSIGNED}'
    WHEN d.availability_status = N'BUSY' THEN N'${DRIVER_STATUSES.IN_PROGRESS}'
    WHEN d.availability_status = N'OFF' THEN N'${DRIVER_STATUSES.UNAVAILABLE}'
    ELSE N'${DRIVER_STATUSES.AVAILABLE}'
  END AS TrangThaiTaiXe,
  tx.MaTaiKhoan
`;

const ALLOWED_DRIVER_STATUSES = new Set(Object.values(DRIVER_STATUSES));
const ACTIVE_ROUTE_STATUS_SQL = ACTIVE_ROUTE_STATUSES.map((status) => `N'${status}'`).join(', ');
const ROUTE_PLAN_BUSY_STATUS_SQL = ['CONFIRMED', 'IN_PROGRESS']
  .map((status) => `N'${status}'`)
  .join(', ');

const REQUIRED_EMPLOYEE_CODE_MESSAGE = 'Vui lòng nhập mã nhân viên';
const REQUIRED_FULL_NAME_MESSAGE = 'Vui lòng nhập họ tên';
const REQUIRED_PHONE_MESSAGE = 'Vui lòng nhập số điện thoại';
const REQUIRED_NATIONAL_ID_MESSAGE = 'Vui lòng nhập CCCD';
const REQUIRED_LICENSE_MESSAGE = 'Vui lòng chọn loại bằng lái';
const DUPLICATE_EMPLOYEE_CODE_MESSAGE = 'Mã nhân viên đã tồn tại';
const DUPLICATE_PHONE_MESSAGE = 'Số điện thoại đã tồn tại';
const DUPLICATE_NATIONAL_ID_MESSAGE = 'CCCD đã tồn tại';
const INVALID_PHONE_MESSAGE = 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)';
const INVALID_NATIONAL_ID_MESSAGE = 'CCCD không hợp lệ (12 chữ số)';
const INVALID_DRIVER_STATUS_MESSAGE = 'Trạng thái tài xế không hợp lệ';
const DISABLE_BLOCKED_MESSAGE =
  'Tài xế đang được phân công hoặc đang thực hiện chuyến, không thể ngừng hoạt động';

async function loadDriverByLegacyId(db, legacyId) {
  const result = await db
    .request()
    .input('id', sql.Int, legacyId)
    .query(`
      SELECT TOP 1 ${DRIVER_SELECT_COLUMNS}
      FROM external_drivers d
      LEFT JOIN TaiXe tx ON tx.MaTaiXe = d.legacy_ma_tai_xe
      WHERE d.legacy_ma_tai_xe = @id
    `);

  return result.recordset[0] || null;
}

function getDriverPayload(body = {}) {
  return {
    MaNhanVien: String(body.MaNhanVien || '').trim(),
    HoTen: String(body.HoTen || '').trim(),
    SoDienThoai: normalizeVietnamPhoneNumber(body.SoDienThoai),
    CCCD: String(body.CCCD || '').trim(),
    LoaiBangLai: body.LoaiBangLai ? String(body.LoaiBangLai).trim() : '',
    TrangThaiTaiXe: body.TrangThaiTaiXe ? String(body.TrangThaiTaiXe).trim() : null
  };
}

function buildDriverFieldErrors(driver) {
  const fieldErrors = {};

  if (!driver.MaNhanVien) {
    fieldErrors.MaNhanVien = REQUIRED_EMPLOYEE_CODE_MESSAGE;
  }

  if (!driver.HoTen) {
    fieldErrors.HoTen = REQUIRED_FULL_NAME_MESSAGE;
  }

  if (!driver.SoDienThoai) {
    fieldErrors.SoDienThoai = REQUIRED_PHONE_MESSAGE;
  } else if (!isValidPhoneNumber(driver.SoDienThoai)) {
    fieldErrors.SoDienThoai = INVALID_PHONE_MESSAGE;
  }

  if (!driver.CCCD) {
    fieldErrors.CCCD = REQUIRED_NATIONAL_ID_MESSAGE;
  } else if (!isValidNationalId(driver.CCCD)) {
    fieldErrors.CCCD = INVALID_NATIONAL_ID_MESSAGE;
  }

  if (!driver.LoaiBangLai) {
    fieldErrors.LoaiBangLai = REQUIRED_LICENSE_MESSAGE;
  }

  return fieldErrors;
}

function getFirstFieldErrorMessage(fieldErrors) {
  return (
    fieldErrors.MaNhanVien ||
    fieldErrors.HoTen ||
    fieldErrors.SoDienThoai ||
    fieldErrors.CCCD ||
    fieldErrors.LoaiBangLai ||
    'Dữ liệu tài xế không hợp lệ'
  );
}

function validateDriverPayload(driver) {
  const fieldErrors = buildDriverFieldErrors(driver);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      message: getFirstFieldErrorMessage(fieldErrors),
      fieldErrors
    };
  }

  if (driver.TrangThaiTaiXe && !ALLOWED_DRIVER_STATUSES.has(driver.TrangThaiTaiXe)) {
    return {
      message: INVALID_DRIVER_STATUS_MESSAGE,
      fieldErrors: {
        TrangThaiTaiXe: INVALID_DRIVER_STATUS_MESSAGE
      }
    };
  }

  return null;
}

function sendDriverValidationError(res, status, message, fieldErrors, errorCode = 'VALIDATION_ERROR') {
  return sendError(res, status, message, errorCode, { fieldErrors });
}

function mapDriverSqlConflict(err) {
  const sqlErrorNumber = Number(err?.number || err?.originalError?.info?.number);
  if (![2601, 2627].includes(sqlErrorNumber)) {
    return null;
  }

  const detail = String(err?.message || err?.originalError?.info?.message || '');
  const fieldErrors = {};

  if (/MaNhanVienTaiXe|employee_code|UX_TaiXe_MaNhanVienTaiXe|UX_external_drivers_employee_code/i.test(detail)) {
    fieldErrors.MaNhanVien = DUPLICATE_EMPLOYEE_CODE_MESSAGE;
  }

  if (/SoDienThoai|phone|UQ_external_drivers_phone/i.test(detail)) {
    fieldErrors.SoDienThoai = DUPLICATE_PHONE_MESSAGE;
  }

  if (/CCCD|national_id|UQ_external_drivers_national_id/i.test(detail)) {
    fieldErrors.CCCD = DUPLICATE_NATIONAL_ID_MESSAGE;
  }

  return {
    message: Object.keys(fieldErrors).length > 0
      ? getFirstFieldErrorMessage(fieldErrors)
      : 'Dữ liệu tài xế đã tồn tại',
    fieldErrors
  };
}

async function findDuplicateDriverIdentity(db, { excludeId = null, accountId = null, driver }) {
  const driverConflicts = await db
    .request()
    .input('excludeId', sql.Int, excludeId)
    .input('employeeCode', sql.VarChar(20), driver.MaNhanVien)
    .input('phone', sql.VarChar(15), driver.SoDienThoai)
    .input('cccd', sql.VarChar(20), driver.CCCD)
    .query(`
      SELECT
        SUM(CASE WHEN @employeeCode IS NOT NULL AND MaNhanVienTaiXe = @employeeCode THEN 1 ELSE 0 END) AS EmployeeCodeCount,
        SUM(CASE WHEN SoDienThoai = @phone THEN 1 ELSE 0 END) AS PhoneCount,
        SUM(CASE WHEN CCCD = @cccd THEN 1 ELSE 0 END) AS NationalIdCount
      FROM TaiXe
      WHERE ((@employeeCode IS NOT NULL AND MaNhanVienTaiXe = @employeeCode) OR SoDienThoai = @phone OR CCCD = @cccd)
        AND (@excludeId IS NULL OR MaTaiXe <> @excludeId)
    `);

  const accountPhoneConflicts = await db
    .request()
    .input('accountId', sql.Int, accountId)
    .input('phone', sql.VarChar(15), driver.SoDienThoai)
    .query(`
      SELECT COUNT(1) AS ConflictCount
      FROM TaiKhoanNguoiDung
      WHERE SoDienThoai = @phone
        AND (@accountId IS NULL OR MaTaiKhoan <> @accountId)
    `);

  const driverRow = driverConflicts.recordset[0] || {};
  const accountPhoneCount = Number(accountPhoneConflicts.recordset[0]?.ConflictCount || 0);
  const fieldErrors = {};

  if (Number(driverRow.EmployeeCodeCount || 0) > 0) {
    fieldErrors.MaNhanVien = DUPLICATE_EMPLOYEE_CODE_MESSAGE;
  }

  if (Number(driverRow.PhoneCount || 0) > 0 || accountPhoneCount > 0) {
    fieldErrors.SoDienThoai = DUPLICATE_PHONE_MESSAGE;
  }

  if (Number(driverRow.NationalIdCount || 0) > 0) {
    fieldErrors.CCCD = DUPLICATE_NATIONAL_ID_MESSAGE;
  }

  return fieldErrors;
}

function isDriverBusyStatus(status) {
  return status === DRIVER_STATUSES.ASSIGNED || status === DRIVER_STATUSES.IN_PROGRESS;
}

async function assertDriverCanBeDisabled(db, legacyId, existingDriver = null) {
  const driver = existingDriver || (await loadDriverByLegacyId(db, legacyId));

  if (!driver) {
    throw Object.assign(new Error('Không tìm thấy tài xế'), {
      status: 404,
      code: 'NOT_FOUND'
    });
  }

  if (isDriverBusyStatus(driver.TrangThaiTaiXe)) {
    throw Object.assign(new Error(DISABLE_BLOCKED_MESSAGE), {
      status: 409,
      code: 'CONFLICT'
    });
  }

  const busyRoutes = await new sql.Request(db)
    .input('id', sql.Int, legacyId)
    .query(`
      SELECT TOP 1 1
      FROM LoTrinhTrungChuyen
      WHERE MaTaiXe = @id
        AND TrangThaiLoTrinh IN (${ACTIVE_ROUTE_STATUS_SQL})
    `);

  if (busyRoutes.recordset.length > 0) {
    throw Object.assign(new Error(DISABLE_BLOCKED_MESSAGE), {
      status: 409,
      code: 'CONFLICT'
    });
  }

  const busyRoutePlans = await new sql.Request(db)
    .input('id', sql.Int, legacyId)
    .query(`
      SELECT TOP 1 1
      FROM route_plan_driver_assignments da
      INNER JOIN route_plans rp ON rp.id = da.route_plan_id
      INNER JOIN external_drivers d ON d.id = da.external_driver_id
      WHERE d.legacy_ma_tai_xe = @id
        AND da.assignment_status IN (N'SELECTED', N'CONFIRMED')
        AND rp.status IN (${ROUTE_PLAN_BUSY_STATUS_SQL})
    `);

  if (busyRoutePlans.recordset.length > 0) {
    throw Object.assign(new Error(DISABLE_BLOCKED_MESSAGE), {
      status: 409,
      code: 'CONFLICT'
    });
  }
}

router.get('/', async (_req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT ${DRIVER_SELECT_COLUMNS}
      FROM external_drivers d
      LEFT JOIN TaiXe tx ON tx.MaTaiXe = d.legacy_ma_tai_xe
      WHERE d.work_status <> N'INACTIVE' AND d.is_active = 1
      ORDER BY d.legacy_ma_tai_xe DESC
    `);

    return sendSuccess(res, result.recordset, 'Lấy danh sách tài xế thành công');
  } catch (err) {
    console.error('Get drivers error:', err);
    return sendError(res, 500, 'Lỗi lấy danh sách tài xế', 'SERVER_ERROR');
  }
});

router.get('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã tài xế không hợp lệ', 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();
    const driver = await loadDriverByLegacyId(pool, id);

    if (!driver) {
      return sendError(res, 404, 'Không tìm thấy tài xế', 'NOT_FOUND');
    }

    return sendSuccess(res, driver, 'Lấy thông tin tài xế thành công');
  } catch (err) {
    console.error('Get driver detail error:', err);
    return sendError(res, 500, 'Lỗi lấy thông tin tài xế', 'SERVER_ERROR');
  }
});

router.post('/', async (req, res) => {
  const driver = getDriverPayload(req.body);
  const validation = validateDriverPayload(driver);
  if (validation) {
    return sendDriverValidationError(res, 400, validation.message, validation.fieldErrors);
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const createdResult = await createDriverWithAccount(transaction, {
        MaNhanVien: driver.MaNhanVien,
        HoTen: driver.HoTen,
        SoDienThoai: driver.SoDienThoai,
        CCCD: driver.CCCD,
        LoaiBangLai: driver.LoaiBangLai,
        TrangThaiTaiXe: driver.TrangThaiTaiXe || DRIVER_STATUSES.AVAILABLE,
        allowAutoEmployeeCode: false
      });

      await transaction.commit();

      const createdDriver = await loadDriverByLegacyId(pool, createdResult.legacyId);
      return sendSuccess(
        res,
        {
          driver: createdDriver,
          account: createdResult.account
        },
        'Tạo tài xế thành công',
        201
      );
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
  } catch (err) {
    console.error('Create driver error:', err);

    if (err.fieldErrors) {
      return sendDriverValidationError(
        res,
        err.status || 409,
        err.message || getFirstFieldErrorMessage(err.fieldErrors),
        err.fieldErrors,
        err.code || 'CONFLICT'
      );
    }

    const duplicateConflict = mapDriverSqlConflict(err);
    if (duplicateConflict) {
      return sendDriverValidationError(
        res,
        409,
        duplicateConflict.message,
        duplicateConflict.fieldErrors,
        'CONFLICT'
      );
    }

    return sendError(
      res,
      err.status || 500,
      err.message || 'Lỗi tạo tài xế',
      err.code || 'SERVER_ERROR'
    );
  }
});

router.put('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã tài xế không hợp lệ', 'VALIDATION_ERROR');
  }

  const driver = getDriverPayload(req.body);
  const validation = validateDriverPayload(driver);
  if (validation) {
    return sendDriverValidationError(res, 400, validation.message, validation.fieldErrors);
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const existing = await loadDriverByLegacyId(transaction, id);

      if (!existing) {
        await transaction.rollback();
        return sendError(res, 404, 'Không tìm thấy tài xế', 'NOT_FOUND');
      }

      const duplicateFieldErrors = await findDuplicateDriverIdentity(transaction, {
        excludeId: id,
        accountId: existing.MaTaiKhoan || null,
        driver
      });

      if (Object.keys(duplicateFieldErrors).length > 0) {
        await transaction.rollback();
        return sendDriverValidationError(
          res,
          409,
          getFirstFieldErrorMessage(duplicateFieldErrors),
          duplicateFieldErrors,
          'CONFLICT'
        );
      }

      const nextDriverStatus = driver.TrangThaiTaiXe || existing.TrangThaiTaiXe;
      if (!ALLOWED_DRIVER_STATUSES.has(nextDriverStatus)) {
        await transaction.rollback();
        return sendDriverValidationError(
          res,
          400,
          INVALID_DRIVER_STATUS_MESSAGE,
          { TrangThaiTaiXe: INVALID_DRIVER_STATUS_MESSAGE }
        );
      }

      if (nextDriverStatus === DRIVER_STATUSES.INACTIVE) {
        await assertDriverCanBeDisabled(transaction, id, existing);
      }

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('MaNhanVienTaiXe', sql.VarChar(20), driver.MaNhanVien)
        .input('HoTen', sql.NVarChar(100), driver.HoTen)
        .input('SoDienThoai', sql.VarChar(15), driver.SoDienThoai)
        .input('CCCD', sql.VarChar(20), driver.CCCD)
        .input('LoaiBangLai', sql.NVarChar(50), driver.LoaiBangLai)
        .input('TrangThaiTaiXe', sql.NVarChar(30), nextDriverStatus)
        .query(`
          UPDATE TaiXe
          SET MaNhanVienTaiXe = @MaNhanVienTaiXe,
              HoTen = @HoTen,
              SoDienThoai = @SoDienThoai,
              CCCD = @CCCD,
              LoaiBangLai = @LoaiBangLai,
              TrangThaiTaiXe = @TrangThaiTaiXe
          WHERE MaTaiXe = @id
        `);

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('employeeCode', sql.NVarChar(20), driver.MaNhanVien)
        .input('fullName', sql.NVarChar(100), driver.HoTen)
        .input('phone', sql.VarChar(15), driver.SoDienThoai)
        .input('nationalId', sql.VarChar(20), driver.CCCD)
        .input('licenseClass', sql.NVarChar(50), driver.LoaiBangLai)
        .input('workStatus', sql.NVarChar(20), nextDriverStatus === DRIVER_STATUSES.INACTIVE ? 'INACTIVE' : 'ACTIVE')
        .input(
          'availabilityStatus',
          sql.NVarChar(20),
          nextDriverStatus === DRIVER_STATUSES.ASSIGNED
            ? 'ASSIGNED'
            : nextDriverStatus === DRIVER_STATUSES.IN_PROGRESS
              ? 'BUSY'
              : nextDriverStatus === DRIVER_STATUSES.UNAVAILABLE || nextDriverStatus === DRIVER_STATUSES.INACTIVE
                ? 'OFF'
                : 'AVAILABLE'
        )
        .input('isActive', sql.Bit, nextDriverStatus === DRIVER_STATUSES.INACTIVE ? 0 : 1)
        .query(`
          UPDATE external_drivers
          SET employee_code = @employeeCode,
              full_name = @fullName,
              phone = @phone,
              national_id = @nationalId,
              license_class = @licenseClass,
              work_status = @workStatus,
              availability_status = @availabilityStatus,
              is_active = @isActive,
              updated_at = GETDATE()
          WHERE legacy_ma_tai_xe = @id
        `);

      await syncDriverAccountState(transaction, {
        MaTaiXe: id,
        SoDienThoai: driver.SoDienThoai,
        TrangThaiTaiXe: nextDriverStatus
      });

      await transaction.commit();
      const updated = await loadDriverByLegacyId(pool, id);
      return sendSuccess(res, updated, 'Cập nhật tài xế thành công');
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
  } catch (err) {
    console.error('Update driver error:', err);

    if (err.fieldErrors) {
      return sendDriverValidationError(
        res,
        err.status || 409,
        err.message || getFirstFieldErrorMessage(err.fieldErrors),
        err.fieldErrors,
        err.code || 'CONFLICT'
      );
    }

    const duplicateConflict = mapDriverSqlConflict(err);
    if (duplicateConflict) {
      return sendDriverValidationError(
        res,
        409,
        duplicateConflict.message,
        duplicateConflict.fieldErrors,
        'CONFLICT'
      );
    }

    return sendError(
      res,
      err.status || 500,
      err.message || 'Lỗi cập nhật tài xế',
      err.code || 'SERVER_ERROR'
    );
  }
});

router.delete('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã tài xế không hợp lệ', 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const existing = await loadDriverByLegacyId(transaction, id);
      await assertDriverCanBeDisabled(transaction, id, existing);

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('TrangThaiTaiXe', sql.NVarChar(30), DRIVER_STATUSES.INACTIVE)
        .query(`
          UPDATE TaiXe
          SET TrangThaiTaiXe = @TrangThaiTaiXe
          WHERE MaTaiXe = @id
        `);

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query(`
          UPDATE external_drivers
          SET work_status = N'INACTIVE',
              availability_status = N'OFF',
              is_active = 0,
              updated_at = GETDATE()
          WHERE legacy_ma_tai_xe = @id
        `);

      await syncDriverAccountState(transaction, {
        MaTaiXe: id,
        SoDienThoai: existing.SoDienThoai,
        TrangThaiTaiXe: DRIVER_STATUSES.INACTIVE
      });

      await transaction.commit();

      const updated = await loadDriverByLegacyId(pool, id);
      return sendSuccess(res, updated, 'Đã chuyển tài xế sang ngừng hoạt động');
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
  } catch (err) {
    console.error('Delete/disable driver error:', err);
    return sendError(
      res,
      err.status || 500,
      err.message || 'Lỗi cập nhật trạng thái tài xế',
      err.code || 'SERVER_ERROR'
    );
  }
});

module.exports = router;
