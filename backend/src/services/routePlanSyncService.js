const { sql } = require('../db');
const { ROUTE_STATUSES } = require('../constants/status');

function buildLegacyRouteMarker(routeId) {
  return `[legacy_route_id=${routeId}]`;
}

function buildRoutePlanNotes(routeNote, routeId) {
  const marker = buildLegacyRouteMarker(routeId);
  const trimmedNote = String(routeNote || '').trim();

  if (!trimmedNote) {
    return marker;
  }

  return trimmedNote.includes(marker) ? trimmedNote : `${trimmedNote} ${marker}`.trim();
}

function mapLegacyRouteStatusToPlanStatus(routeStatus) {
  switch (routeStatus) {
    case ROUTE_STATUSES.IN_PROGRESS:
    case ROUTE_STATUSES.INCIDENT:
      return 'IN_PROGRESS';
    case ROUTE_STATUSES.COMPLETED:
      return 'COMPLETED';
    case ROUTE_STATUSES.CANCELLED:
      return 'CANCELLED';
    default:
      return 'CONFIRMED';
  }
}

function buildRoutePlanCustomerNote(stop) {
  const slot = stop.KhungGioTrungChuyen ? String(stop.KhungGioTrungChuyen).trim() : '';
  const parts = [`MaVe=${stop.MaVe}`, `SoLuongGhe=${Number(stop.SoLuongGhe || 0)}`, `KhungGio=${slot}`];

  if (stop.TrangThaiKhach) {
    parts.push(`TrangThaiKhach=${String(stop.TrangThaiKhach).trim()}`);
  }

  return parts.join('; ');
}

async function loadLinkedRoutePlan(db, routeId) {
  const marker = buildLegacyRouteMarker(routeId);
  const result = await db
    .request()
    .input('marker', sql.NVarChar(50), marker)
    .query(`
      SELECT TOP 1 id, notes
      FROM route_plans
      WHERE CHARINDEX(@marker, ISNULL(notes, N'')) > 0
      ORDER BY id DESC
    `);

  return result.recordset[0] || null;
}

async function loadLegacyRouteDetail(db, routeId) {
  const routeResult = await db
    .request()
    .input('routeId', sql.Int, routeId)
    .query(`
      SELECT TOP 1
        lt.MaLoTrinh,
        lt.ThoiGianBatDau,
        lt.ThoiGianKetThuc,
        lt.LoTrinhDuKien,
        lt.GhiChu,
        lt.TrangThaiLoTrinh,
        lt.MaXe,
        lt.MaTaiXe,
        lt.MaNhanVien,
        x.BienSo,
        x.LoaiXe,
        x.SoCho,
        tx.HoTen AS TenTaiXe,
        tx.SoDienThoai AS SoDienThoaiTaiXe,
        tx.CCCD,
        tx.LoaiBangLai,
        nv.HoTen AS TenNhanVien
      FROM LoTrinhTrungChuyen lt
      JOIN XeTrungChuyen x ON x.MaXe = lt.MaXe
      JOIN TaiXe tx ON tx.MaTaiXe = lt.MaTaiXe
      JOIN NhanVienDieuPhoi nv ON nv.MaNhanVien = lt.MaNhanVien
      WHERE lt.MaLoTrinh = @routeId
    `);

  if (routeResult.recordset.length === 0) {
    return null;
  }

  const stopsResult = await db
    .request()
    .input('routeId', sql.Int, routeId)
    .query(`
      SELECT
        ct.MaChiTiet,
        ct.ThuTuDonTra,
        ct.DiemDon,
        ct.DiemTra,
        ct.ThoiGianDonDuKien,
        ct.TrangThaiKhach,
        ct.MaVe,
        v.SoLuongGhe,
        v.KhungGioTrungChuyen,
        k.MaKhachHang,
        k.TenKhachHang,
        k.SoDienThoai
      FROM ChiTietLoTrinh ct
      JOIN VeTrungChuyen v ON v.MaVe = ct.MaVe
      JOIN KhachHang k ON k.MaKhachHang = v.MaKhachHang
      WHERE ct.MaLoTrinh = @routeId
      ORDER BY ct.ThuTuDonTra, ct.MaChiTiet
    `);

  return {
    route: routeResult.recordset[0],
    stops: stopsResult.recordset
  };
}

async function loadExternalResources(db, route, stops) {
  const vehicleResult = await db
    .request()
    .input('vehicleId', sql.Int, route.MaXe)
    .query(`
      SELECT TOP 1 *
      FROM external_vehicles
      WHERE legacy_ma_xe = @vehicleId
    `);

  const driverResult = await db
    .request()
    .input('driverId', sql.Int, route.MaTaiXe)
    .query(`
      SELECT TOP 1 *
      FROM external_drivers
      WHERE legacy_ma_tai_xe = @driverId
    `);

  const customerLegacyIds = [...new Set(stops.map((stop) => Number(stop.MaKhachHang)).filter(Number.isInteger))];
  const externalCustomersByLegacyId = new Map();

  if (customerLegacyIds.length > 0) {
    const customerResult = await db
      .request()
      .input('ids', sql.VarChar(sql.MAX), customerLegacyIds.join(','))
      .query(`
        SELECT *
        FROM external_customers
        WHERE legacy_ma_khach_hang IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
      `);

    for (const row of customerResult.recordset) {
      externalCustomersByLegacyId.set(Number(row.legacy_ma_khach_hang), row);
    }
  }

  return {
    vehicle: vehicleResult.recordset[0] || null,
    driver: driverResult.recordset[0] || null,
    customersByLegacyId: externalCustomersByLegacyId
  };
}

async function insertRoutePlanLog(db, routePlanId, eventType, message, payload, createdBy) {
  await db
    .request()
    .input('routePlanId', sql.BigInt, routePlanId)
    .input('eventType', sql.NVarChar(50), eventType)
    .input('message', sql.NVarChar(500), message || null)
    .input('payload', sql.NVarChar(sql.MAX), payload ? JSON.stringify(payload) : null)
    .input('createdBy', sql.NVarChar(50), createdBy || null)
    .query(`
      INSERT INTO route_plan_logs (route_plan_id, event_type, message, payload, created_by)
      VALUES (@routePlanId, @eventType, @message, @payload, @createdBy)
    `);
}

function parseLogPayload(payload) {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload);
  } catch (_error) {
    return {
      raw: payload
    };
  }
}

async function createRoutePlanProjection(db, routeId, createdBy) {
  const detail = await loadLegacyRouteDetail(db, routeId);
  if (!detail) {
    return null;
  }

  const { route, stops } = detail;
  const externalResources = await loadExternalResources(db, route, stops);
  if (!externalResources.vehicle || !externalResources.driver) {
    return null;
  }

  const missingExternalCustomer = stops.find(
    (stop) => !externalResources.customersByLegacyId.has(Number(stop.MaKhachHang))
  );
  if (missingExternalCustomer) {
    return null;
  }

  const planCode = `RP-LT${String(routeId).padStart(6, '0')}`;
  const planInsert = await db
    .request()
    .input('planCode', sql.NVarChar(30), planCode)
    .input('plannedStart', sql.DateTime2, route.ThoiGianBatDau)
    .input('plannedEnd', sql.DateTime2, route.ThoiGianKetThuc)
    .input('status', sql.NVarChar(20), mapLegacyRouteStatusToPlanStatus(route.TrangThaiLoTrinh))
    .input('notes', sql.NVarChar(500), buildRoutePlanNotes(route.GhiChu, routeId))
    .input('createdBy', sql.NVarChar(50), createdBy || route.TenNhanVien || null)
    .query(`
      INSERT INTO route_plans (plan_code, planned_start_at, planned_end_at, status, notes, created_by)
      OUTPUT INSERTED.id
      VALUES (@planCode, @plannedStart, @plannedEnd, @status, @notes, @createdBy)
    `);

  const routePlanId = planInsert.recordset[0].id;
  const { vehicle, driver, customersByLegacyId } = externalResources;

  const vehicleAssignmentInsert = await db
    .request()
    .input('routePlanId', sql.BigInt, routePlanId)
    .input('externalVehicleId', sql.Int, vehicle.id)
    .input('assignmentStatus', sql.NVarChar(20), 'CONFIRMED')
    .input('vehicleCode', sql.NVarChar(20), vehicle.vehicle_code)
    .input('plate', sql.VarChar(20), vehicle.plate_number)
    .input('vehicleType', sql.NVarChar(50), vehicle.vehicle_type)
    .input('capacity', sql.Int, vehicle.capacity)
    .input('seatCount', sql.Int, vehicle.seat_count)
    .query(`
      INSERT INTO route_plan_vehicle_assignments (
        route_plan_id,
        external_vehicle_id,
        assignment_status,
        vehicle_code_snapshot,
        vehicle_plate_snapshot,
        vehicle_type_snapshot,
        vehicle_capacity_snapshot,
        vehicle_seat_count_snapshot
      )
      OUTPUT INSERTED.id
      VALUES (@routePlanId, @externalVehicleId, @assignmentStatus, @vehicleCode, @plate, @vehicleType, @capacity, @seatCount)
    `);

  const vehicleAssignmentId = vehicleAssignmentInsert.recordset[0].id;

  await db
    .request()
    .input('routePlanId', sql.BigInt, routePlanId)
    .input('externalDriverId', sql.Int, driver.id)
    .input('vehicleAssignmentId', sql.BigInt, vehicleAssignmentId)
    .input('assignmentStatus', sql.NVarChar(20), 'CONFIRMED')
    .input('driverCode', sql.NVarChar(20), driver.driver_code)
    .input('driverName', sql.NVarChar(100), driver.full_name)
    .input('driverPhone', sql.VarChar(15), driver.phone)
    .input('driverNationalId', sql.VarChar(20), driver.national_id)
    .input('driverLicenseNo', sql.VarChar(30), driver.license_no)
    .input('driverLicenseClass', sql.NVarChar(50), driver.license_class)
    .query(`
      INSERT INTO route_plan_driver_assignments (
        route_plan_id,
        external_driver_id,
        route_plan_vehicle_assignment_id,
        assignment_status,
        driver_code_snapshot,
        driver_name_snapshot,
        driver_phone_snapshot,
        driver_national_id_snapshot,
        driver_license_no_snapshot,
        driver_license_class_snapshot
      )
      VALUES (
        @routePlanId,
        @externalDriverId,
        @vehicleAssignmentId,
        @assignmentStatus,
        @driverCode,
        @driverName,
        @driverPhone,
        @driverNationalId,
        @driverLicenseNo,
        @driverLicenseClass
      )
    `);

  for (const stop of stops) {
    const externalCustomer = customersByLegacyId.get(Number(stop.MaKhachHang));
    await db
      .request()
      .input('routePlanId', sql.BigInt, routePlanId)
      .input('externalCustomerId', sql.Int, externalCustomer.id)
      .input('sequenceNo', sql.Int, stop.ThuTuDonTra)
      .input('customerCode', sql.NVarChar(20), externalCustomer.customer_code)
      .input('customerName', sql.NVarChar(100), externalCustomer.full_name || stop.TenKhachHang)
      .input('customerPhone', sql.VarChar(15), externalCustomer.phone || stop.SoDienThoai)
      .input('pickup', sql.NVarChar(255), stop.DiemDon)
      .input('dropoff', sql.NVarChar(255), stop.DiemTra)
      .input('note', sql.NVarChar(255), buildRoutePlanCustomerNote(stop))
      .query(`
        INSERT INTO route_plan_customers (
          route_plan_id,
          external_customer_id,
          sequence_no,
          customer_code_snapshot,
          customer_name_snapshot,
          customer_phone_snapshot,
          pickup_address_snapshot,
          dropoff_address_snapshot,
          note
        )
        VALUES (
          @routePlanId,
          @externalCustomerId,
          @sequenceNo,
          @customerCode,
          @customerName,
          @customerPhone,
          @pickup,
          @dropoff,
          @note
        )
      `);
  }

  return { id: routePlanId, created: true };
}

async function syncRoutePlanProjection(
  db,
  routeId,
  { eventType = null, message = null, payload = null, createdBy = null } = {}
) {
  let linkedPlan = await loadLinkedRoutePlan(db, routeId);
  if (!linkedPlan) {
    linkedPlan = await createRoutePlanProjection(db, routeId, createdBy);
  }

  if (!linkedPlan) {
    return null;
  }

  const detail = await loadLegacyRouteDetail(db, routeId);
  if (!detail) {
    return null;
  }

  const { route, stops } = detail;
  const routePlanId = linkedPlan.id;
  const externalResources = await loadExternalResources(db, route, stops);

  await db
    .request()
    .input('id', sql.BigInt, routePlanId)
    .input('plannedStart', sql.DateTime2, route.ThoiGianBatDau)
    .input('plannedEnd', sql.DateTime2, route.ThoiGianKetThuc)
    .input('status', sql.NVarChar(20), mapLegacyRouteStatusToPlanStatus(route.TrangThaiLoTrinh))
    .input('notes', sql.NVarChar(500), buildRoutePlanNotes(route.GhiChu, routeId))
    .query(`
      UPDATE route_plans
      SET planned_start_at = @plannedStart,
          planned_end_at = @plannedEnd,
          status = @status,
          notes = @notes,
          updated_at = GETDATE()
      WHERE id = @id
    `);

  if (externalResources.vehicle) {
    await db
      .request()
      .input('routePlanId', sql.BigInt, routePlanId)
      .input('vehicleId', sql.Int, externalResources.vehicle.id)
      .input('plate', sql.VarChar(20), externalResources.vehicle.plate_number)
      .input('vehicleType', sql.NVarChar(50), externalResources.vehicle.vehicle_type)
      .input('capacity', sql.Int, externalResources.vehicle.capacity)
      .input('seatCount', sql.Int, externalResources.vehicle.seat_count)
      .query(`
        UPDATE route_plan_vehicle_assignments
        SET external_vehicle_id = @vehicleId,
            assignment_status = N'CONFIRMED',
            vehicle_plate_snapshot = @plate,
            vehicle_type_snapshot = @vehicleType,
            vehicle_capacity_snapshot = @capacity,
            vehicle_seat_count_snapshot = @seatCount,
            updated_at = GETDATE()
        WHERE route_plan_id = @routePlanId
      `);
  }

  if (externalResources.driver) {
    await db
      .request()
      .input('routePlanId', sql.BigInt, routePlanId)
      .input('driverId', sql.Int, externalResources.driver.id)
      .input('driverName', sql.NVarChar(100), externalResources.driver.full_name || route.TenTaiXe)
      .input('driverPhone', sql.VarChar(15), externalResources.driver.phone || route.SoDienThoaiTaiXe)
      .input('driverNationalId', sql.VarChar(20), externalResources.driver.national_id || route.CCCD)
      .input('driverLicenseClass', sql.NVarChar(50), externalResources.driver.license_class || route.LoaiBangLai)
      .query(`
        UPDATE route_plan_driver_assignments
        SET external_driver_id = @driverId,
            assignment_status = N'CONFIRMED',
            driver_name_snapshot = @driverName,
            driver_phone_snapshot = @driverPhone,
            driver_national_id_snapshot = @driverNationalId,
            driver_license_class_snapshot = @driverLicenseClass,
            updated_at = GETDATE()
        WHERE route_plan_id = @routePlanId
      `);
  }

  for (const stop of stops) {
    const externalCustomer = externalResources.customersByLegacyId.get(Number(stop.MaKhachHang));
    if (!externalCustomer) {
      continue;
    }

    const updateResult = await db
      .request()
      .input('routePlanId', sql.BigInt, routePlanId)
      .input('sequenceNo', sql.Int, stop.ThuTuDonTra)
      .input('externalCustomerId', sql.Int, externalCustomer.id)
      .input('customerCode', sql.NVarChar(20), externalCustomer.customer_code)
      .input('customerName', sql.NVarChar(100), externalCustomer.full_name || stop.TenKhachHang)
      .input('customerPhone', sql.VarChar(15), externalCustomer.phone || stop.SoDienThoai)
      .input('pickup', sql.NVarChar(255), stop.DiemDon)
      .input('dropoff', sql.NVarChar(255), stop.DiemTra)
      .input('note', sql.NVarChar(255), buildRoutePlanCustomerNote(stop))
      .query(`
        UPDATE route_plan_customers
        SET external_customer_id = @externalCustomerId,
            customer_code_snapshot = @customerCode,
            customer_name_snapshot = @customerName,
            customer_phone_snapshot = @customerPhone,
            pickup_address_snapshot = @pickup,
            dropoff_address_snapshot = @dropoff,
            note = @note,
            updated_at = GETDATE()
        WHERE route_plan_id = @routePlanId AND sequence_no = @sequenceNo
      `);

    if (updateResult.rowsAffected[0] === 0) {
      await db
        .request()
        .input('routePlanId', sql.BigInt, routePlanId)
        .input('externalCustomerId', sql.Int, externalCustomer.id)
        .input('sequenceNo', sql.Int, stop.ThuTuDonTra)
        .input('customerCode', sql.NVarChar(20), externalCustomer.customer_code)
        .input('customerName', sql.NVarChar(100), externalCustomer.full_name || stop.TenKhachHang)
        .input('customerPhone', sql.VarChar(15), externalCustomer.phone || stop.SoDienThoai)
        .input('pickup', sql.NVarChar(255), stop.DiemDon)
        .input('dropoff', sql.NVarChar(255), stop.DiemTra)
        .input('note', sql.NVarChar(255), buildRoutePlanCustomerNote(stop))
        .query(`
          INSERT INTO route_plan_customers (
            route_plan_id,
            external_customer_id,
            sequence_no,
            customer_code_snapshot,
            customer_name_snapshot,
            customer_phone_snapshot,
            pickup_address_snapshot,
            dropoff_address_snapshot,
            note
          )
          VALUES (
            @routePlanId,
            @externalCustomerId,
            @sequenceNo,
            @customerCode,
            @customerName,
            @customerPhone,
            @pickup,
            @dropoff,
            @note
          )
        `);
    }
  }

  if (eventType) {
    await insertRoutePlanLog(db, routePlanId, eventType, message, payload, createdBy);
  }

  return { id: routePlanId, created: Boolean(linkedPlan.created) };
}

async function loadRoutePlanSyncState(db, routeId, { sinceId = null, limit = 20 } = {}) {
  const linkedPlan = await loadLinkedRoutePlan(db, routeId);
  if (!linkedPlan) {
    return null;
  }

  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const normalizedSinceId = Number.isInteger(Number(sinceId)) ? Number(sinceId) : null;
  const planRequest = db.request().input('routePlanId', sql.BigInt, linkedPlan.id);
  const logsRequest = db
    .request()
    .input('routePlanId', sql.BigInt, linkedPlan.id)
    .input('limit', sql.Int, normalizedLimit);

  let logFilter = '';
  if (normalizedSinceId != null) {
    logsRequest.input('sinceId', sql.BigInt, normalizedSinceId);
    logFilter = 'AND id > @sinceId';
  }

  const [planResult, latestEventResult, logsResult] = await Promise.all([
    planRequest.query(`
      SELECT TOP 1
        id,
        plan_code,
        planned_start_at,
        planned_end_at,
        status,
        notes,
        updated_at
      FROM route_plans
      WHERE id = @routePlanId
    `),
    db
      .request()
      .input('routePlanId', sql.BigInt, linkedPlan.id)
      .query(`
        SELECT MAX(id) AS latestEventId
        FROM route_plan_logs
        WHERE route_plan_id = @routePlanId
      `),
    logsRequest.query(`
      SELECT TOP (@limit)
        id,
        event_type,
        message,
        payload,
        created_by,
        created_at
      FROM route_plan_logs
      WHERE route_plan_id = @routePlanId
        ${logFilter}
      ORDER BY id DESC
    `)
  ]);

  const plan = planResult.recordset[0] || null;
  const events = (logsResult.recordset || [])
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      eventType: row.event_type,
      message: row.message,
      payload: parseLogPayload(row.payload),
      createdBy: row.created_by,
      createdAt: row.created_at
    }));

  return {
    routePlanId: linkedPlan.id,
    planCode: plan?.plan_code || null,
    status: plan?.status || null,
    plannedStartAt: plan?.planned_start_at || null,
    plannedEndAt: plan?.planned_end_at || null,
    notes: plan?.notes || null,
    updatedAt: plan?.updated_at || null,
    latestEventId: latestEventResult.recordset[0]?.latestEventId || null,
    events
  };
}

module.exports = {
  buildRoutePlanNotes,
  loadRoutePlanSyncState,
  syncRoutePlanProjection
};
