const express = require('express');

const { query, withTransaction } = require('../db');
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
    WHEN d.work_status = 'INACTIVE' OR d.is_active = FALSE THEN '${DRIVER_STATUSES.INACTIVE}'
    WHEN d.availability_status = 'ASSIGNED' THEN '${DRIVER_STATUSES.ASSIGNED}'
    WHEN d.availability_status = 'BUSY' THEN '${DRIVER_STATUSES.IN_PROGRESS}'
    WHEN d.availability_status = 'OFF' THEN '${DRIVER_STATUSES.UNAVAILABLE}'
    ELSE '${DRIVER_STATUSES.AVAILABLE}'
  END AS TrangThaiTaiXe,
  tx.MaTaiKhoan
`;

const ALLOWED_DRIVER_STATUSES = new Set(Object.values(DRIVER_STATUSES));
const ACTIVE_ROUTE_STATUS_SQL = ACTIVE_ROUTE_STATUSES.map((status) => `'${status.replace(/'/g, "''")}'`).join(', ');
const ROUTE_PLAN_BUSY_STATUS_SQL = ['CONFIRMED', 'IN_PROGRESS'].map((status) => `'${status}'`).join(', ');

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

async function loadDriverByLegacyId(legacyId, client = null) {
  const result = await query(
    `
      SELECT ${DRIVER_SELECT_COLUMNS}
      FROM external_drivers d
      LEFT JOIN TaiXe tx ON tx.MaTaiXe = d.legacy_ma_tai_xe
      WHERE d.legacy_ma_tai_xe = $1
      LIMIT 1
    `,
    [legacyId],
    client
  );

  return result.rows[0] || null;
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
  if (err?.code !== '23505') {
    return null;
  }

  const detail = `${err.constraint || ''} ${err.detail || ''} ${err.message || ''}`;
  const fieldErrors = {};

  if (/manhanvientaixe|employee_code|taixe.*ma|external_drivers.*employee/i.test(detail)) {
    fieldErrors.MaNhanVien = DUPLICATE_EMPLOYEE_CODE_MESSAGE;
  }

  if (/sodienthoai|phone/i.test(detail)) {
    fieldErrors.SoDienThoai = DUPLICATE_PHONE_MESSAGE;
  }

  if (/cccd|national_id/i.test(detail)) {
    fieldErrors.CCCD = DUPLICATE_NATIONAL_ID_MESSAGE;
  }

  return {
    message: Object.keys(fieldErrors).length > 0
      ? getFirstFieldErrorMessage(fieldErrors)
      : 'Dữ liệu tài xế đã tồn tại',
    fieldErrors
  };
}

async function findDuplicateDriverIdentity(client, { excludeId = null, accountId = null, driver }) {
  const driverConflicts = await query(
    `
      SELECT
        SUM(CASE WHEN $1::text IS NOT NULL AND MaNhanVienTaiXe = $1 THEN 1 ELSE 0 END) AS EmployeeCodeCount,
        SUM(CASE WHEN SoDienThoai = $2 THEN 1 ELSE 0 END) AS PhoneCount,
        SUM(CASE WHEN CCCD = $3 THEN 1 ELSE 0 END) AS NationalIdCount
      FROM TaiXe
      WHERE (($1::text IS NOT NULL AND MaNhanVienTaiXe = $1) OR SoDienThoai = $2 OR CCCD = $3)
        AND ($4::integer IS NULL OR MaTaiXe <> $4)
    `,
    [driver.MaNhanVien || null, driver.SoDienThoai, driver.CCCD, excludeId],
    client
  );

  const accountPhoneConflicts = await query(
    `
      SELECT COUNT(1) AS ConflictCount
      FROM TaiKhoanNguoiDung
      WHERE SoDienThoai = $1
        AND ($2::integer IS NULL OR MaTaiKhoan <> $2)
    `,
    [driver.SoDienThoai, accountId],
    client
  );

  const driverRow = driverConflicts.rows[0] || {};
  const accountPhoneCount = Number(accountPhoneConflicts.rows[0]?.ConflictCount || 0);
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

async function assertDriverCanBeDisabled(client, legacyId, existingDriver = null) {
  const driver = existingDriver || (await loadDriverByLegacyId(legacyId, client));

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

  const busyRoutes = await query(
    `
      SELECT 1
      FROM LoTrinhTrungChuyen
      WHERE MaTaiXe = $1
        AND TrangThaiLoTrinh IN (${ACTIVE_ROUTE_STATUS_SQL})
      LIMIT 1
    `,
    [legacyId],
    client
  );

  if (busyRoutes.rows.length > 0) {
    throw Object.assign(new Error(DISABLE_BLOCKED_MESSAGE), {
      status: 409,
      code: 'CONFLICT'
    });
  }

  const busyRoutePlans = await query(
    `
      SELECT 1
      FROM route_plan_driver_assignments da
      INNER JOIN route_plans rp ON rp.id = da.route_plan_id
      INNER JOIN external_drivers d ON d.id = da.external_driver_id
      WHERE d.legacy_ma_tai_xe = $1
        AND da.assignment_status IN ('SELECTED', 'CONFIRMED')
        AND rp.status IN (${ROUTE_PLAN_BUSY_STATUS_SQL})
      LIMIT 1
    `,
    [legacyId],
    client
  );

  if (busyRoutePlans.rows.length > 0) {
    throw Object.assign(new Error(DISABLE_BLOCKED_MESSAGE), {
      status: 409,
      code: 'CONFLICT'
    });
  }
}

router.get('/', async (_req, res) => {
  try {
    const result = await query(`
      SELECT ${DRIVER_SELECT_COLUMNS}
      FROM external_drivers d
      LEFT JOIN TaiXe tx ON tx.MaTaiXe = d.legacy_ma_tai_xe
      WHERE d.work_status <> 'INACTIVE' AND d.is_active = TRUE
      ORDER BY d.legacy_ma_tai_xe DESC
    `);

    return sendSuccess(res, result.rows, 'Lấy danh sách tài xế thành công');
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
    const driver = await loadDriverByLegacyId(id);

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
    const createdResult = await withTransaction((client) => createDriverWithAccount(client, {
      MaNhanVien: driver.MaNhanVien,
      HoTen: driver.HoTen,
      SoDienThoai: driver.SoDienThoai,
      CCCD: driver.CCCD,
      LoaiBangLai: driver.LoaiBangLai,
      TrangThaiTaiXe: driver.TrangThaiTaiXe || DRIVER_STATUSES.AVAILABLE,
      allowAutoEmployeeCode: false
    }));

    const createdDriver = await loadDriverByLegacyId(createdResult.legacyId);
    return sendSuccess(
      res,
      {
        driver: createdDriver,
        account: createdResult.account
      },
      'Tạo tài xế thành công',
      201
    );
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
    const updated = await withTransaction(async (client) => {
      const existing = await loadDriverByLegacyId(id, client);

      if (!existing) {
        throw Object.assign(new Error('Không tìm thấy tài xế'), { status: 404, code: 'NOT_FOUND' });
      }

      const duplicateFieldErrors = await findDuplicateDriverIdentity(client, {
        excludeId: id,
        accountId: existing.MaTaiKhoan || null,
        driver
      });

      if (Object.keys(duplicateFieldErrors).length > 0) {
        throw Object.assign(new Error(getFirstFieldErrorMessage(duplicateFieldErrors)), {
          status: 409,
          code: 'CONFLICT',
          fieldErrors: duplicateFieldErrors
        });
      }

      const nextDriverStatus = driver.TrangThaiTaiXe || existing.TrangThaiTaiXe;
      if (!ALLOWED_DRIVER_STATUSES.has(nextDriverStatus)) {
        throw Object.assign(new Error(INVALID_DRIVER_STATUS_MESSAGE), {
          status: 400,
          code: 'VALIDATION_ERROR',
          fieldErrors: { TrangThaiTaiXe: INVALID_DRIVER_STATUS_MESSAGE }
        });
      }

      if (nextDriverStatus === DRIVER_STATUSES.INACTIVE) {
        await assertDriverCanBeDisabled(client, id, existing);
      }

      await query(
        `
          UPDATE TaiXe
          SET MaNhanVienTaiXe = $1,
              HoTen = $2,
              SoDienThoai = $3,
              CCCD = $4,
              LoaiBangLai = $5,
              TrangThaiTaiXe = $6
          WHERE MaTaiXe = $7
        `,
        [driver.MaNhanVien, driver.HoTen, driver.SoDienThoai, driver.CCCD, driver.LoaiBangLai, nextDriverStatus, id],
        client
      );

      await query(
        `
          UPDATE external_drivers
          SET employee_code = $1,
              full_name = $2,
              phone = $3,
              national_id = $4,
              license_class = $5,
              work_status = $6,
              availability_status = $7,
              is_active = $8,
              updated_at = NOW()
          WHERE legacy_ma_tai_xe = $9
        `,
        [
          driver.MaNhanVien,
          driver.HoTen,
          driver.SoDienThoai,
          driver.CCCD,
          driver.LoaiBangLai,
          nextDriverStatus === DRIVER_STATUSES.INACTIVE ? 'INACTIVE' : 'ACTIVE',
          nextDriverStatus === DRIVER_STATUSES.ASSIGNED
            ? 'ASSIGNED'
            : nextDriverStatus === DRIVER_STATUSES.IN_PROGRESS
              ? 'BUSY'
              : nextDriverStatus === DRIVER_STATUSES.UNAVAILABLE || nextDriverStatus === DRIVER_STATUSES.INACTIVE
                ? 'OFF'
                : 'AVAILABLE',
          nextDriverStatus !== DRIVER_STATUSES.INACTIVE,
          id
        ],
        client
      );

      await syncDriverAccountState(client, {
        MaTaiXe: id,
        SoDienThoai: driver.SoDienThoai,
        TrangThaiTaiXe: nextDriverStatus
      });

      return loadDriverByLegacyId(id, client);
    });

    return sendSuccess(res, updated, 'Cập nhật tài xế thành công');
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
    const updated = await withTransaction(async (client) => {
      const existing = await loadDriverByLegacyId(id, client);
      await assertDriverCanBeDisabled(client, id, existing);

      await query(
        `
          UPDATE TaiXe
          SET TrangThaiTaiXe = $1
          WHERE MaTaiXe = $2
        `,
        [DRIVER_STATUSES.INACTIVE, id],
        client
      );

      await query(
        `
          UPDATE external_drivers
          SET work_status = 'INACTIVE',
              availability_status = 'OFF',
              is_active = FALSE,
              updated_at = NOW()
          WHERE legacy_ma_tai_xe = $1
        `,
        [id],
        client
      );

      await syncDriverAccountState(client, {
        MaTaiXe: id,
        SoDienThoai: existing.SoDienThoai,
        TrangThaiTaiXe: DRIVER_STATUSES.INACTIVE
      });

      return loadDriverByLegacyId(id, client);
    });

    return sendSuccess(res, updated, 'Đã chuyển tài xế sang ngừng hoạt động');
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
