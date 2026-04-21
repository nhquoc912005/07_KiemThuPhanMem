const express = require('express');

const { getPool, sql } = require('../db');
const { VEHICLE_STATUSES } = require('../constants/status');
const { sendError, sendSuccess } = require('../utils/http');
const {
  isValidSeatCount,
  isValidVehiclePlate,
  normalizeVehiclePlate,
  normalizeVehiclePlateLookupKey,
  toPositiveInteger
} = require('../utils/validation');

const router = express.Router();

const VEHICLE_SELECT_COLUMNS = `
  e.legacy_ma_xe AS MaXe,
  e.plate_number AS BienSo,
  e.vehicle_type AS LoaiXe,
  e.seat_count AS SoCho,
  CASE
    WHEN e.operational_status = N'INACTIVE' OR e.is_active = 0 THEN N'${VEHICLE_STATUSES.INACTIVE}'
    WHEN e.availability_status = N'ASSIGNED' THEN N'${VEHICLE_STATUSES.ASSIGNED}'
    WHEN e.availability_status = N'ON_TRIP' THEN N'${VEHICLE_STATUSES.RUNNING}'
    WHEN e.availability_status = N'MAINTENANCE' THEN N'${VEHICLE_STATUSES.MAINTENANCE}'
    ELSE N'${VEHICLE_STATUSES.AVAILABLE}'
  END AS TrangThaiXe
`;

const ALLOWED_VEHICLE_STATUSES = new Set(Object.values(VEHICLE_STATUSES));
const NORMALIZED_PLATE_LOOKUP_SQL = "UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(plate_number)), ' ', ''), '-', ''), '.', ''))";

function buildVehicleCode(legacyId) {
  if (legacyId < 1000) {
    return `XE${String(legacyId).padStart(3, '0')}`;
  }

  return `XE${legacyId}`;
}

function toExternalOperationalStatus(vehicleStatus) {
  return vehicleStatus === VEHICLE_STATUSES.INACTIVE ? 'INACTIVE' : 'ACTIVE';
}

function toExternalAvailabilityStatus(vehicleStatus) {
  switch (vehicleStatus) {
    case VEHICLE_STATUSES.ASSIGNED:
      return 'ASSIGNED';
    case VEHICLE_STATUSES.RUNNING:
      return 'ON_TRIP';
    case VEHICLE_STATUSES.MAINTENANCE:
      return 'MAINTENANCE';
    default:
      return 'AVAILABLE';
  }
}

function toExternalIsActive(vehicleStatus) {
  return vehicleStatus === VEHICLE_STATUSES.INACTIVE ? 0 : 1;
}

function toVehicleResponse(record) {
  if (!record) {
    return null;
  }

  return {
    ...record,
    BienSo: normalizeVehiclePlate(record.BienSo)
  };
}

async function loadVehicleByLegacyId(db, legacyId) {
  const result = await db
    .request()
    .input('id', sql.Int, legacyId)
    .query(`
      SELECT TOP 1 ${VEHICLE_SELECT_COLUMNS}
      FROM external_vehicles e
      WHERE e.legacy_ma_xe = @id
    `);

  return toVehicleResponse(result.recordset[0]);
}

function getVehiclePayload(body = {}) {
  return {
    BienSo: normalizeVehiclePlate(body.BienSo),
    LoaiXe: String(body.LoaiXe || '').trim(),
    SoCho: toPositiveInteger(body.SoCho),
    TrangThaiXe: body.TrangThaiXe ? String(body.TrangThaiXe).trim() : VEHICLE_STATUSES.AVAILABLE
  };
}

function validateVehicleInput(vehicle) {
  if (!vehicle.BienSo) {
    return 'Vui lòng nhập biển số xe';
  }

  if (!isValidVehiclePlate(vehicle.BienSo)) {
    return 'Biển số không hợp lệ. Ví dụ: 51A-12345';
  }

  if (!vehicle.LoaiXe) {
    return 'Vui lòng chọn loại xe';
  }

  if (vehicle.SoCho == null || !isValidSeatCount(vehicle.SoCho)) {
    return 'Số chỗ không hợp lệ';
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
      SELECT ${VEHICLE_SELECT_COLUMNS}
      FROM external_vehicles e
      ORDER BY e.legacy_ma_xe DESC
    `);

    const vehicles = result.recordset.map(toVehicleResponse);
    return sendSuccess(res, vehicles, 'Lấy danh sách xe thành công');
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
    const vehicle = await loadVehicleByLegacyId(pool, id);

    if (!vehicle) {
      return sendError(res, 404, 'Không tìm thấy xe', 'NOT_FOUND');
    }

    return sendSuccess(res, vehicle, 'Lấy thông tin xe thành công');
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
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const existing = await new sql.Request(transaction)
        .input('plateLookup', sql.VarChar(20), normalizeVehiclePlateLookupKey(vehicle.BienSo))
        .query(`
          SELECT TOP 1 1
          FROM external_vehicles
          WHERE ${NORMALIZED_PLATE_LOOKUP_SQL} = @plateLookup
        `);

      if (existing.recordset.length > 0) {
        await transaction.rollback();
        return sendError(res, 409, 'Xe đã tồn tại với biển số này', 'CONFLICT');
      }

      const legacyInsert = await new sql.Request(transaction)
        .input('BienSo', sql.VarChar(50), vehicle.BienSo)
        .input('LoaiXe', sql.NVarChar(50), vehicle.LoaiXe)
        .input('SoCho', sql.Int, vehicle.SoCho)
        .input('TrangThaiXe', sql.NVarChar(30), vehicle.TrangThaiXe)
        .query(`
          INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe)
          OUTPUT INSERTED.MaXe
          VALUES (@BienSo, @LoaiXe, @SoCho, @TrangThaiXe)
        `);

      const legacyId = legacyInsert.recordset[0].MaXe;

      await new sql.Request(transaction)
        .input('legacyId', sql.Int, legacyId)
        .input('vehicleCode', sql.NVarChar(20), buildVehicleCode(legacyId))
        .input('plate', sql.VarChar(20), vehicle.BienSo)
        .input('vehicleType', sql.NVarChar(50), vehicle.LoaiXe)
        .input('capacity', sql.Int, vehicle.SoCho)
        .input('seatCount', sql.Int, vehicle.SoCho)
        .input('operationalStatus', sql.NVarChar(20), toExternalOperationalStatus(vehicle.TrangThaiXe))
        .input('availabilityStatus', sql.NVarChar(20), toExternalAvailabilityStatus(vehicle.TrangThaiXe))
        .input('isActive', sql.Bit, toExternalIsActive(vehicle.TrangThaiXe))
        .query(`
          INSERT INTO external_vehicles (
            legacy_ma_xe,
            vehicle_code,
            plate_number,
            vehicle_type,
            capacity,
            seat_count,
            operational_status,
            availability_status,
            is_active
          )
          VALUES (@legacyId, @vehicleCode, @plate, @vehicleType, @capacity, @seatCount, @operationalStatus, @availabilityStatus, @isActive)
        `);

      await transaction.commit();
      const created = await loadVehicleByLegacyId(pool, legacyId);
      return sendSuccess(res, created, 'Tạo xe thành công', 201);
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
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
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const existing = await loadVehicleByLegacyId(transaction, id);

      if (!existing) {
        await transaction.rollback();
        return sendError(res, 404, 'Không tìm thấy xe', 'NOT_FOUND');
      }

      const existingPlate = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('plateLookup', sql.VarChar(20), normalizeVehiclePlateLookupKey(vehicle.BienSo))
        .query(`
          SELECT TOP 1 1
          FROM external_vehicles
          WHERE ${NORMALIZED_PLATE_LOOKUP_SQL} = @plateLookup
            AND legacy_ma_xe <> @id
        `);

      if (existingPlate.recordset.length > 0) {
        await transaction.rollback();
        return sendError(res, 409, 'Biển số đã tồn tại cho xe khác', 'CONFLICT');
      }

      await new sql.Request(transaction)
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
          WHERE MaXe = @id
        `);

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('plate', sql.VarChar(20), vehicle.BienSo)
        .input('vehicleType', sql.NVarChar(50), vehicle.LoaiXe)
        .input('capacity', sql.Int, vehicle.SoCho)
        .input('seatCount', sql.Int, vehicle.SoCho)
        .input('operationalStatus', sql.NVarChar(20), toExternalOperationalStatus(vehicle.TrangThaiXe))
        .input('availabilityStatus', sql.NVarChar(20), toExternalAvailabilityStatus(vehicle.TrangThaiXe))
        .input('isActive', sql.Bit, toExternalIsActive(vehicle.TrangThaiXe))
        .query(`
          UPDATE external_vehicles
          SET plate_number = @plate,
              vehicle_type = @vehicleType,
              capacity = @capacity,
              seat_count = @seatCount,
              operational_status = @operationalStatus,
              availability_status = @availabilityStatus,
              is_active = @isActive,
              updated_at = GETDATE()
          WHERE legacy_ma_xe = @id
        `);

      await transaction.commit();
      const updated = await loadVehicleByLegacyId(pool, id);
      return sendSuccess(res, updated, 'Cập nhật xe thành công');
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
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
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const existing = await loadVehicleByLegacyId(transaction, id);
      if (!existing) {
        await transaction.rollback();
        return sendError(res, 404, 'Không tìm thấy xe', 'NOT_FOUND');
      }

      const relatedRoutes = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query('SELECT TOP 1 1 FROM LoTrinhTrungChuyen WHERE MaXe = @id');

      if (relatedRoutes.recordset.length > 0) {
        await transaction.rollback();
        return sendError(res, 409, 'Không thể xóa xe đã từng được phân công lộ trình', 'CONFLICT');
      }

      const relatedAssignments = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query(`
          SELECT TOP 1 1
          FROM route_plan_vehicle_assignments a
          JOIN external_vehicles e ON e.id = a.external_vehicle_id
          WHERE e.legacy_ma_xe = @id
        `);

      if (relatedAssignments.recordset.length > 0) {
        await transaction.rollback();
        return sendError(res, 409, 'Không thể xóa xe đã từng được dùng trong kế hoạch điều phối', 'CONFLICT');
      }

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query('DELETE FROM external_vehicles WHERE legacy_ma_xe = @id');

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query('DELETE FROM XeTrungChuyen WHERE MaXe = @id');

      await transaction.commit();
      return sendSuccess(res, existing, 'Xóa xe thành công');
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
  } catch (err) {
    console.error('Delete vehicle error:', err);
    return sendError(res, 500, 'Lỗi xóa xe', 'SERVER_ERROR');
  }
});

module.exports = router;
