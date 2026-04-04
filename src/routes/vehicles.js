const express = require('express');

const { getPool, sql } = require('../db');
const { VEHICLE_STATUSES } = require('../constants/status');
const { sendError, sendSuccess } = require('../utils/http');
const {
  isValidSeatCount,
  isValidVehiclePlate,
  normalizeVehiclePlate,
  toPositiveInteger
} = require('../utils/validation');

const router = express.Router();

const VEHICLE_COLUMNS = `
  MaXe,
  BienSo,
  LoaiXe,
  SoCho,
  TrangThaiXe
`;
const VEHICLE_OUTPUT_COLUMNS = `
  INSERTED.MaXe,
  INSERTED.BienSo,
  INSERTED.LoaiXe,
  INSERTED.SoCho,
  INSERTED.TrangThaiXe
`;
const VEHICLE_DELETED_COLUMNS = `
  DELETED.MaXe,
  DELETED.BienSo,
  DELETED.LoaiXe,
  DELETED.SoCho,
  DELETED.TrangThaiXe
`;

const ALLOWED_VEHICLE_STATUSES = new Set(Object.values(VEHICLE_STATUSES));

function getVehiclePayload(body = {}) {
  return {
    BienSo: normalizeVehiclePlate(body.BienSo),
    LoaiXe: String(body.LoaiXe || '').trim(),
    SoCho: toPositiveInteger(body.SoCho),
    TrangThaiXe: body.TrangThaiXe ? String(body.TrangThaiXe).trim() : VEHICLE_STATUSES.AVAILABLE
  };
}

function validateVehicleInput(vehicle) {
  if (!vehicle.BienSo || !vehicle.LoaiXe || vehicle.SoCho == null) {
    return 'Biển số, loại xe và số chỗ là bắt buộc';
  }

  if (!isValidVehiclePlate(vehicle.BienSo)) {
    return 'Biển số không hợp lệ. Ví dụ: 43B-123.45';
  }

  if (!isValidSeatCount(vehicle.SoCho)) {
    return 'Số chỗ phải là số nguyên từ 4 đến 45';
  }

  if (!ALLOWED_VEHICLE_STATUSES.has(vehicle.TrangThaiXe)) {
    return 'Trạng thái xe không hợp lệ';
  }

  return null;
}

router.get('/', async (_req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT ${VEHICLE_COLUMNS}
      FROM XeTrungChuyen
      ORDER BY MaXe DESC
    `);

    return sendSuccess(res, result.recordset, 'Lấy danh sách xe thành công');
  } catch (err) {
    console.error('Get vehicles error:', err);
    return sendError(res, 500, 'Lỗi lấy danh sách xe', 'SERVER_ERROR');
  }
});

router.get('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã xe không hợp lệ', 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ${VEHICLE_COLUMNS}
        FROM XeTrungChuyen
        WHERE MaXe = @id
      `);

    if (result.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy xe', 'NOT_FOUND');
    }

    return sendSuccess(res, result.recordset[0], 'Lấy thông tin xe thành công');
  } catch (err) {
    console.error('Get vehicle detail error:', err);
    return sendError(res, 500, 'Lỗi lấy thông tin xe', 'SERVER_ERROR');
  }
});

router.post('/', async (req, res) => {
  const vehicle = getVehiclePayload(req.body);
  const validationMessage = validateVehicleInput(vehicle);
  if (validationMessage) {
    return sendError(res, 400, validationMessage, 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();

    const existing = await pool
      .request()
      .input('BienSo', sql.VarChar(50), vehicle.BienSo)
      .query('SELECT 1 FROM XeTrungChuyen WHERE BienSo = @BienSo');

    if (existing.recordset.length > 0) {
      return sendError(res, 409, 'Xe đã tồn tại với biển số này', 'CONFLICT');
    }

    const result = await pool
      .request()
      .input('BienSo', sql.VarChar(50), vehicle.BienSo)
      .input('LoaiXe', sql.NVarChar(50), vehicle.LoaiXe)
      .input('SoCho', sql.Int, vehicle.SoCho)
      .input('TrangThaiXe', sql.NVarChar(30), vehicle.TrangThaiXe)
      .query(`
        INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe)
        OUTPUT ${VEHICLE_OUTPUT_COLUMNS}
        VALUES (@BienSo, @LoaiXe, @SoCho, @TrangThaiXe)
      `);

    return sendSuccess(res, result.recordset[0], 'Tạo xe thành công', 201);
  } catch (err) {
    console.error('Create vehicle error:', err);
    return sendError(res, 500, 'Lỗi tạo xe', 'SERVER_ERROR');
  }
});

router.put('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã xe không hợp lệ', 'VALIDATION_ERROR');
  }

  const vehicle = getVehiclePayload(req.body);
  const validationMessage = validateVehicleInput(vehicle);
  if (validationMessage) {
    return sendError(res, 400, validationMessage, 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();

    const existing = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ${VEHICLE_COLUMNS}
        FROM XeTrungChuyen
        WHERE MaXe = @id
      `);

    if (existing.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy xe', 'NOT_FOUND');
    }

    const existingPlate = await pool
      .request()
      .input('id', sql.Int, id)
      .input('BienSo', sql.VarChar(50), vehicle.BienSo)
      .query('SELECT 1 FROM XeTrungChuyen WHERE BienSo = @BienSo AND MaXe <> @id');

    if (existingPlate.recordset.length > 0) {
      return sendError(res, 409, 'Biển số đã tồn tại cho xe khác', 'CONFLICT');
    }

    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .input('BienSo', sql.VarChar(50), vehicle.BienSo)
      .input('LoaiXe', sql.NVarChar(50), vehicle.LoaiXe)
      .input('SoCho', sql.Int, vehicle.SoCho)
      .input('TrangThaiXe', sql.NVarChar(30), vehicle.TrangThaiXe)
      .query(`
        UPDATE XeTrungChuyen
        SET BienSo = @BienSo,
            LoaiXe = @LoaiXe,
            SoCho = @SoCho,
            TrangThaiXe = @TrangThaiXe
        OUTPUT ${VEHICLE_OUTPUT_COLUMNS}
        WHERE MaXe = @id
      `);

    return sendSuccess(res, result.recordset[0], 'Cập nhật xe thành công');
  } catch (err) {
    console.error('Update vehicle error:', err);
    return sendError(res, 500, 'Lỗi cập nhật xe', 'SERVER_ERROR');
  }
});

router.delete('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã xe không hợp lệ', 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();

    const relatedRoutes = await pool
      .request()
      .input('id', sql.Int, id)
      .query('SELECT TOP 1 1 FROM LoTrinhTrungChuyen WHERE MaXe = @id');

    if (relatedRoutes.recordset.length > 0) {
      return sendError(res, 409, 'Không thể xóa xe đã từng được phân công lộ trình', 'CONFLICT');
    }

    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        DELETE FROM XeTrungChuyen
        OUTPUT ${VEHICLE_DELETED_COLUMNS}
        WHERE MaXe = @id
      `);

    if (result.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy xe', 'NOT_FOUND');
    }

    return sendSuccess(res, result.recordset[0], 'Xóa xe thành công');
  } catch (err) {
    console.error('Delete vehicle error:', err);
    return sendError(res, 500, 'Lỗi xóa xe', 'SERVER_ERROR');
  }
});

module.exports = router;
