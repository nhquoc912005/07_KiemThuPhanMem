const express = require('express');

const { getPool, sql } = require('../db');
const {
  ACTIVE_ROUTE_STATUSES,
  DRIVER_STATUSES
} = require('../constants/status');
const { sendError, sendSuccess } = require('../utils/http');
const {
  isValidNationalId,
  isValidPhoneNumber,
  toPositiveInteger
} = require('../utils/validation');

const router = express.Router();

const DRIVER_SELECT_COLUMNS = `
  d.legacy_ma_tai_xe AS MaTaiXe,
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

function buildDriverCode(legacyId) {
  if (legacyId < 1000) {
    return `TX${String(legacyId).padStart(3, '0')}`;
  }

  return `TX${legacyId}`;
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
    HoTen: String(body.HoTen || '').trim(),
    SoDienThoai: String(body.SoDienThoai || '').trim(),
    CCCD: String(body.CCCD || '').trim(),
    LoaiBangLai: body.LoaiBangLai ? String(body.LoaiBangLai).trim() : null,
    TrangThaiTaiXe: body.TrangThaiTaiXe ? String(body.TrangThaiTaiXe).trim() : null
  };
}

function validateDriverPayload(driver) {
  if (!driver.HoTen || !driver.SoDienThoai || !driver.CCCD) {
    return 'Họ tên, số điện thoại và CCCD là bắt buộc';
  }

  if (!isValidPhoneNumber(driver.SoDienThoai)) {
    return 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)';
  }

  if (!isValidNationalId(driver.CCCD)) {
    return 'CCCD không hợp lệ (12 chữ số)';
  }

  if (driver.TrangThaiTaiXe && !ALLOWED_DRIVER_STATUSES.has(driver.TrangThaiTaiXe)) {
    return 'Trạng thái tài xế không hợp lệ';
  }

  return null;
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
  const validationMessage = validateDriverPayload(driver);
  if (validationMessage) {
    return sendError(res, 400, validationMessage, 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const existing = await new sql.Request(transaction)
        .input('phone', sql.VarChar(15), driver.SoDienThoai)
        .input('cccd', sql.VarChar(20), driver.CCCD)
        .query(`
          SELECT TOP 1 1
          FROM external_drivers
          WHERE phone = @phone OR national_id = @cccd
        `);

      if (existing.recordset.length > 0) {
        await transaction.rollback();
        return sendError(res, 409, 'Tài xế đã tồn tại với số điện thoại hoặc CCCD này', 'CONFLICT');
      }

      const nextStatus = driver.TrangThaiTaiXe || DRIVER_STATUSES.AVAILABLE;
      const legacyInsert = await new sql.Request(transaction)
        .input('HoTen', sql.NVarChar(100), driver.HoTen)
        .input('SoDienThoai', sql.VarChar(15), driver.SoDienThoai)
        .input('CCCD', sql.VarChar(20), driver.CCCD)
        .input('LoaiBangLai', sql.NVarChar(50), driver.LoaiBangLai)
        .input('TrangThaiTaiXe', sql.NVarChar(30), nextStatus)
        .query(`
          INSERT INTO TaiXe (HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe)
          OUTPUT INSERTED.MaTaiXe
          VALUES (@HoTen, @SoDienThoai, @CCCD, @LoaiBangLai, @TrangThaiTaiXe)
        `);

      const legacyId = legacyInsert.recordset[0].MaTaiXe;

      await new sql.Request(transaction)
        .input('legacyId', sql.Int, legacyId)
        .input('driverCode', sql.NVarChar(20), buildDriverCode(legacyId))
        .input('fullName', sql.NVarChar(100), driver.HoTen)
        .input('phone', sql.VarChar(15), driver.SoDienThoai)
        .input('nationalId', sql.VarChar(20), driver.CCCD)
        .input('licenseClass', sql.NVarChar(50), driver.LoaiBangLai)
        .input('workStatus', sql.NVarChar(20), toExternalWorkStatus(nextStatus))
        .input('availabilityStatus', sql.NVarChar(20), toExternalAvailabilityStatus(nextStatus))
        .input('isActive', sql.Bit, toExternalIsActive(nextStatus))
        .query(`
          INSERT INTO external_drivers (
            legacy_ma_tai_xe,
            driver_code,
            full_name,
            phone,
            national_id,
            license_class,
            work_status,
            availability_status,
            is_active
          )
          VALUES (@legacyId, @driverCode, @fullName, @phone, @nationalId, @licenseClass, @workStatus, @availabilityStatus, @isActive)
        `);

      await transaction.commit();

      const created = await loadDriverByLegacyId(pool, legacyId);
      return sendSuccess(res, created, 'Tạo tài xế thành công', 201);
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
  } catch (err) {
    console.error('Create driver error:', err);
    return sendError(res, 500, 'Lỗi tạo tài xế', 'SERVER_ERROR');
  }
});

router.put('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã tài xế không hợp lệ', 'VALIDATION_ERROR');
  }

  const driver = getDriverPayload(req.body);
  const validationMessage = validateDriverPayload(driver);
  if (validationMessage) {
    return sendError(res, 400, validationMessage, 'VALIDATION_ERROR');
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

      const existingConflicts = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('phone', sql.VarChar(15), driver.SoDienThoai)
        .input('cccd', sql.VarChar(20), driver.CCCD)
        .query(`
          SELECT TOP 1 1
          FROM external_drivers
          WHERE (phone = @phone OR national_id = @cccd)
            AND legacy_ma_tai_xe <> @id
        `);

      if (existingConflicts.recordset.length > 0) {
        await transaction.rollback();
        return sendError(res, 409, 'Số điện thoại hoặc CCCD đã tồn tại cho tài xế khác', 'CONFLICT');
      }

      const nextDriverStatus = driver.TrangThaiTaiXe || existing.TrangThaiTaiXe;
      if (!ALLOWED_DRIVER_STATUSES.has(nextDriverStatus)) {
        await transaction.rollback();
        return sendError(res, 400, 'Trạng thái tài xế không hợp lệ', 'VALIDATION_ERROR');
      }

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('HoTen', sql.NVarChar(100), driver.HoTen)
        .input('SoDienThoai', sql.VarChar(15), driver.SoDienThoai)
        .input('CCCD', sql.VarChar(20), driver.CCCD)
        .input('LoaiBangLai', sql.NVarChar(50), driver.LoaiBangLai)
        .input('TrangThaiTaiXe', sql.NVarChar(30), nextDriverStatus)
        .query(`
          UPDATE TaiXe
          SET HoTen = @HoTen,
              SoDienThoai = @SoDienThoai,
              CCCD = @CCCD,
              LoaiBangLai = @LoaiBangLai,
              TrangThaiTaiXe = @TrangThaiTaiXe
          WHERE MaTaiXe = @id
        `);

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('fullName', sql.NVarChar(100), driver.HoTen)
        .input('phone', sql.VarChar(15), driver.SoDienThoai)
        .input('nationalId', sql.VarChar(20), driver.CCCD)
        .input('licenseClass', sql.NVarChar(50), driver.LoaiBangLai)
        .input('workStatus', sql.NVarChar(20), toExternalWorkStatus(nextDriverStatus))
        .input('availabilityStatus', sql.NVarChar(20), toExternalAvailabilityStatus(nextDriverStatus))
        .input('isActive', sql.Bit, toExternalIsActive(nextDriverStatus))
        .query(`
          UPDATE external_drivers
          SET full_name = @fullName,
              phone = @phone,
              national_id = @nationalId,
              license_class = @licenseClass,
              work_status = @workStatus,
              availability_status = @availabilityStatus,
              is_active = @isActive,
              updated_at = GETDATE()
          WHERE legacy_ma_tai_xe = @id
        `);

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
    return sendError(res, 500, 'Lỗi cập nhật tài xế', 'SERVER_ERROR');
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
      const busyRoutes = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query(`
          SELECT TOP 1 1
          FROM LoTrinhTrungChuyen
          WHERE MaTaiXe = @id
            AND TrangThaiLoTrinh IN (${ACTIVE_ROUTE_STATUS_SQL})
        `);

      if (busyRoutes.recordset.length > 0) {
        await transaction.rollback();
        return sendError(res, 409, 'Không thể ngưng hoạt động tài xế đang có lộ trình active', 'CONFLICT');
      }

      const existing = await loadDriverByLegacyId(transaction, id);
      if (!existing) {
        await transaction.rollback();
        return sendError(res, 404, 'Không tìm thấy tài xế', 'NOT_FOUND');
      }

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
    return sendError(res, 500, 'Lỗi cập nhật trạng thái tài xế', 'SERVER_ERROR');
  }
});

module.exports = router;
