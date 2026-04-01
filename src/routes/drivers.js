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

const DRIVER_COLUMNS = `
  MaTaiXe,
  HoTen,
  SoDienThoai,
  CCCD,
  LoaiBangLai,
  TrangThaiTaiXe,
  MaTaiKhoan
`;

const DRIVER_OUTPUT_COLUMNS = `
  INSERTED.MaTaiXe,
  INSERTED.HoTen,
  INSERTED.SoDienThoai,
  INSERTED.CCCD,
  INSERTED.LoaiBangLai,
  INSERTED.TrangThaiTaiXe,
  INSERTED.MaTaiKhoan
`;

const ALLOWED_DRIVER_STATUSES = new Set(Object.values(DRIVER_STATUSES));
const ACTIVE_ROUTE_STATUS_SQL = ACTIVE_ROUTE_STATUSES.map((status) => `N'${status}'`).join(', ');

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
      SELECT ${DRIVER_COLUMNS}
      FROM TaiXe
      WHERE ISNULL(TrangThaiTaiXe, N'') <> N'${DRIVER_STATUSES.INACTIVE}'
      ORDER BY MaTaiXe DESC
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
    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ${DRIVER_COLUMNS}
        FROM TaiXe
        WHERE MaTaiXe = @id
      `);

    if (result.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy tài xế', 'NOT_FOUND');
    }

    return sendSuccess(res, result.recordset[0], 'Lấy thông tin tài xế thành công');
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

    const existing = await pool
      .request()
      .input('phone', sql.VarChar(15), driver.SoDienThoai)
      .input('cccd', sql.VarChar(20), driver.CCCD)
      .query('SELECT 1 FROM TaiXe WHERE SoDienThoai = @phone OR CCCD = @cccd');

    if (existing.recordset.length > 0) {
      return sendError(res, 409, 'Tài xế đã tồn tại với số điện thoại hoặc CCCD này', 'CONFLICT');
    }

    const result = await pool
      .request()
      .input('HoTen', sql.NVarChar(100), driver.HoTen)
      .input('SoDienThoai', sql.VarChar(15), driver.SoDienThoai)
      .input('CCCD', sql.VarChar(20), driver.CCCD)
      .input('LoaiBangLai', sql.NVarChar(50), driver.LoaiBangLai)
      .input('TrangThaiTaiXe', sql.NVarChar(30), driver.TrangThaiTaiXe || DRIVER_STATUSES.AVAILABLE)
      .query(`
        INSERT INTO TaiXe (HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe)
        OUTPUT ${DRIVER_OUTPUT_COLUMNS}
        VALUES (@HoTen, @SoDienThoai, @CCCD, @LoaiBangLai, @TrangThaiTaiXe)
      `);

    return sendSuccess(res, result.recordset[0], 'Tạo tài xế thành công', 201);
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

    const existing = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ${DRIVER_COLUMNS}
        FROM TaiXe
        WHERE MaTaiXe = @id
      `);

    if (existing.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy tài xế', 'NOT_FOUND');
    }

    const existingConflicts = await pool
      .request()
      .input('id', sql.Int, id)
      .input('phone', sql.VarChar(15), driver.SoDienThoai)
      .input('cccd', sql.VarChar(20), driver.CCCD)
      .query(`
        SELECT 1
        FROM TaiXe
        WHERE (SoDienThoai = @phone OR CCCD = @cccd)
          AND MaTaiXe <> @id
      `);

    if (existingConflicts.recordset.length > 0) {
      return sendError(res, 409, 'Số điện thoại hoặc CCCD đã tồn tại cho tài xế khác', 'CONFLICT');
    }

    const nextDriverStatus = driver.TrangThaiTaiXe || existing.recordset[0].TrangThaiTaiXe;
    if (!ALLOWED_DRIVER_STATUSES.has(nextDriverStatus)) {
      return sendError(res, 400, 'Trạng thái tài xế không hợp lệ', 'VALIDATION_ERROR');
    }

    const result = await pool
      .request()
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
        OUTPUT ${DRIVER_OUTPUT_COLUMNS}
        WHERE MaTaiXe = @id
      `);

    return sendSuccess(res, result.recordset[0], 'Cập nhật tài xế thành công');
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

    const busyRoutes = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 1 1
        FROM LoTrinhTrungChuyen
        WHERE MaTaiXe = @id
          AND TrangThaiLoTrinh IN (${ACTIVE_ROUTE_STATUS_SQL})
      `);

    if (busyRoutes.recordset.length > 0) {
      return sendError(res, 409, 'Không thể ngưng hoạt động tài xế đang có lộ trình active', 'CONFLICT');
    }

    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE TaiXe
        SET TrangThaiTaiXe = N'${DRIVER_STATUSES.INACTIVE}'
        OUTPUT ${DRIVER_OUTPUT_COLUMNS}
        WHERE MaTaiXe = @id
      `);

    if (result.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy tài xế', 'NOT_FOUND');
    }

    return sendSuccess(res, result.recordset[0], 'Đã chuyển tài xế sang ngừng hoạt động');
  } catch (err) {
    console.error('Delete/disable driver error:', err);
    return sendError(res, 500, 'Lỗi cập nhật trạng thái tài xế', 'SERVER_ERROR');
  }
});

module.exports = router;
