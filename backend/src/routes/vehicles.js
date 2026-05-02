const express = require('express');

const { query, withTransaction } = require('../db');
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
    WHEN e.operational_status = 'INACTIVE' OR e.is_active = FALSE THEN '${VEHICLE_STATUSES.INACTIVE}'
    WHEN e.availability_status = 'ASSIGNED' THEN '${VEHICLE_STATUSES.ASSIGNED}'
    WHEN e.availability_status = 'ON_TRIP' THEN '${VEHICLE_STATUSES.RUNNING}'
    WHEN e.availability_status = 'MAINTENANCE' THEN '${VEHICLE_STATUSES.MAINTENANCE}'
    ELSE '${VEHICLE_STATUSES.AVAILABLE}'
  END AS TrangThaiXe
`;

const ALLOWED_VEHICLE_STATUSES = new Set(Object.values(VEHICLE_STATUSES));
const NORMALIZED_PLATE_LOOKUP_SQL = "UPPER(REPLACE(REPLACE(REPLACE(TRIM(plate_number), ' ', ''), '-', ''), '.', ''))";

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
  return vehicleStatus !== VEHICLE_STATUSES.INACTIVE;
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

async function loadVehicleByLegacyId(legacyId, client = null) {
  const result = await query(
    `
      SELECT ${VEHICLE_SELECT_COLUMNS}
      FROM external_vehicles e
      WHERE e.legacy_ma_xe = $1
      LIMIT 1
    `,
    [legacyId],
    client
  );

  return toVehicleResponse(result.rows[0]);
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
    const result = await query(`
      SELECT ${VEHICLE_SELECT_COLUMNS}
      FROM external_vehicles e
      ORDER BY e.legacy_ma_xe DESC
    `);

    const vehicles = result.rows.map(toVehicleResponse);
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
    const vehicle = await loadVehicleByLegacyId(id);

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
    const created = await withTransaction(async (client) => {
      const existing = await query(
        `
          SELECT 1
          FROM external_vehicles
          WHERE ${NORMALIZED_PLATE_LOOKUP_SQL} = $1
          LIMIT 1
        `,
        [normalizeVehiclePlateLookupKey(vehicle.BienSo)],
        client
      );

      if (existing.rows.length > 0) {
        throw Object.assign(new Error('Xe đã tồn tại với biển số này'), { status: 409, code: 'CONFLICT' });
      }

      const legacyInsert = await query(
        `
          INSERT INTO XeTrungChuyen (BienSo, LoaiXe, SoCho, TrangThaiXe)
          VALUES ($1, $2, $3, $4)
          RETURNING MaXe
        `,
        [vehicle.BienSo, vehicle.LoaiXe, vehicle.SoCho, vehicle.TrangThaiXe],
        client
      );

      const legacyId = legacyInsert.rows[0].MaXe;

      await query(
        `
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          legacyId,
          buildVehicleCode(legacyId),
          vehicle.BienSo,
          vehicle.LoaiXe,
          vehicle.SoCho,
          vehicle.SoCho,
          toExternalOperationalStatus(vehicle.TrangThaiXe),
          toExternalAvailabilityStatus(vehicle.TrangThaiXe),
          toExternalIsActive(vehicle.TrangThaiXe)
        ],
        client
      );

      return loadVehicleByLegacyId(legacyId, client);
    });

    return sendSuccess(res, created, 'Tạo xe thành công', 201);
  } catch (err) {
    console.error('Create vehicle error:', err);

    if (err.code === 'CONFLICT') {
      return sendError(res, err.status || 409, err.message, 'CONFLICT');
    }

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
    const updated = await withTransaction(async (client) => {
      const existing = await loadVehicleByLegacyId(id, client);

      if (!existing) {
        throw Object.assign(new Error('Không tìm thấy xe'), { status: 404, code: 'NOT_FOUND' });
      }

      const existingPlate = await query(
        `
          SELECT 1
          FROM external_vehicles
          WHERE ${NORMALIZED_PLATE_LOOKUP_SQL} = $1
            AND legacy_ma_xe <> $2
          LIMIT 1
        `,
        [normalizeVehiclePlateLookupKey(vehicle.BienSo), id],
        client
      );

      if (existingPlate.rows.length > 0) {
        throw Object.assign(new Error('Biển số đã tồn tại cho xe khác'), { status: 409, code: 'CONFLICT' });
      }

      await query(
        `
          UPDATE XeTrungChuyen
          SET BienSo = $1,
              LoaiXe = $2,
              SoCho = $3,
              TrangThaiXe = $4
          WHERE MaXe = $5
        `,
        [vehicle.BienSo, vehicle.LoaiXe, vehicle.SoCho, vehicle.TrangThaiXe, id],
        client
      );

      await query(
        `
          UPDATE external_vehicles
          SET plate_number = $1,
              vehicle_type = $2,
              capacity = $3,
              seat_count = $4,
              operational_status = $5,
              availability_status = $6,
              is_active = $7,
              updated_at = NOW()
          WHERE legacy_ma_xe = $8
        `,
        [
          vehicle.BienSo,
          vehicle.LoaiXe,
          vehicle.SoCho,
          vehicle.SoCho,
          toExternalOperationalStatus(vehicle.TrangThaiXe),
          toExternalAvailabilityStatus(vehicle.TrangThaiXe),
          toExternalIsActive(vehicle.TrangThaiXe),
          id
        ],
        client
      );

      return loadVehicleByLegacyId(id, client);
    });

    return sendSuccess(res, updated, 'Cập nhật xe thành công');
  } catch (err) {
    console.error('Update vehicle error:', err);

    if (err.code === 'NOT_FOUND') {
      return sendError(res, 404, err.message, 'NOT_FOUND');
    }

    if (err.code === 'CONFLICT') {
      return sendError(res, err.status || 409, err.message, 'CONFLICT');
    }

    return sendError(res, 500, 'Lỗi cập nhật xe', 'SERVER_ERROR');
  }
});

router.delete('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã xe không hợp lệ', 'VALIDATION_ERROR');
  }

  try {
    const deleted = await withTransaction(async (client) => {
      const existing = await loadVehicleByLegacyId(id, client);
      if (!existing) {
        throw Object.assign(new Error('Không tìm thấy xe'), { status: 404, code: 'NOT_FOUND' });
      }

      const relatedRoutes = await query('SELECT 1 FROM LoTrinhTrungChuyen WHERE MaXe = $1 LIMIT 1', [id], client);

      if (relatedRoutes.rows.length > 0) {
        throw Object.assign(new Error('Không thể xóa xe đã từng được phân công lộ trình'), {
          status: 409,
          code: 'CONFLICT'
        });
      }

      const relatedAssignments = await query(
        `
          SELECT 1
          FROM route_plan_vehicle_assignments a
          JOIN external_vehicles e ON e.id = a.external_vehicle_id
          WHERE e.legacy_ma_xe = $1
          LIMIT 1
        `,
        [id],
        client
      );

      if (relatedAssignments.rows.length > 0) {
        throw Object.assign(new Error('Không thể xóa xe đã từng được dùng trong kế hoạch điều phối'), {
          status: 409,
          code: 'CONFLICT'
        });
      }

      await query('DELETE FROM external_vehicles WHERE legacy_ma_xe = $1', [id], client);
      await query('DELETE FROM XeTrungChuyen WHERE MaXe = $1', [id], client);

      return existing;
    });

    return sendSuccess(res, deleted, 'Xóa xe thành công');
  } catch (err) {
    console.error('Delete vehicle error:', err);

    if (err.code === 'NOT_FOUND') {
      return sendError(res, 404, err.message, 'NOT_FOUND');
    }

    if (err.code === 'CONFLICT') {
      return sendError(res, err.status || 409, err.message, 'CONFLICT');
    }

    return sendError(res, 500, 'Lỗi xóa xe', 'SERVER_ERROR');
  }
});

module.exports = router;
