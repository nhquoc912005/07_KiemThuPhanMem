const { query } = require('../db');
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

async function loadLinkedRoutePlan(client, routeId) {
  const marker = buildLegacyRouteMarker(routeId);
  const result = await query(
    `
      SELECT id, notes
      FROM route_plans
      WHERE POSITION($1 IN COALESCE(notes, '')) > 0
      ORDER BY id DESC
      LIMIT 1
    `,
    [marker],
    client
  );

  return result.rows[0] || null;
}

async function loadLegacyRouteDetail(client, routeId) {
  const routeResult = await query(
    `
      SELECT
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
      WHERE lt.MaLoTrinh = $1
      LIMIT 1
    `,
    [routeId],
    client
  );

  if (routeResult.rows.length === 0) {
    return null;
  }

  const stopsResult = await query(
    `
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
      WHERE ct.MaLoTrinh = $1
      ORDER BY ct.ThuTuDonTra, ct.MaChiTiet
    `,
    [routeId],
    client
  );

  return {
    route: routeResult.rows[0],
    stops: stopsResult.rows
  };
}

async function loadExternalResources(client, route, stops) {
  const vehicleResult = await query(
    `
      SELECT *
      FROM external_vehicles
      WHERE legacy_ma_xe = $1
      LIMIT 1
    `,
    [route.MaXe],
    client
  );

  const driverResult = await query(
    `
      SELECT *
      FROM external_drivers
      WHERE legacy_ma_tai_xe = $1
      LIMIT 1
    `,
    [route.MaTaiXe],
    client
  );

  const customerLegacyIds = [...new Set(stops.map((stop) => Number(stop.MaKhachHang)).filter(Number.isInteger))];
  const externalCustomersByLegacyId = new Map();

  if (customerLegacyIds.length > 0) {
    const customerResult = await query(
      `
        SELECT *
        FROM external_customers
        WHERE legacy_ma_khach_hang = ANY($1::int[])
      `,
      [customerLegacyIds],
      client
    );

    for (const row of customerResult.rows) {
      externalCustomersByLegacyId.set(Number(row.legacy_ma_khach_hang), row);
    }
  }

  return {
    vehicle: vehicleResult.rows[0] || null,
    driver: driverResult.rows[0] || null,
    customersByLegacyId: externalCustomersByLegacyId
  };
}

async function insertRoutePlanLog(client, routePlanId, eventType, message, payload, createdBy) {
  await query(
    `
      INSERT INTO route_plan_logs (route_plan_id, event_type, message, payload, created_by)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [routePlanId, eventType, message || null, payload ? JSON.stringify(payload) : null, createdBy || null],
    client
  );
}

function parseLogPayload(payload) {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'object') {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch (_error) {
    return {
      raw: payload
    };
  }
}

async function createRoutePlanProjection(client, routeId, createdBy) {
  const detail = await loadLegacyRouteDetail(client, routeId);
  if (!detail) {
    return null;
  }

  const { route, stops } = detail;
  const externalResources = await loadExternalResources(client, route, stops);
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
  const planInsert = await query(
    `
      INSERT INTO route_plans (plan_code, planned_start_at, planned_end_at, status, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [
      planCode,
      route.ThoiGianBatDau,
      route.ThoiGianKetThuc,
      mapLegacyRouteStatusToPlanStatus(route.TrangThaiLoTrinh),
      buildRoutePlanNotes(route.GhiChu, routeId),
      createdBy || route.TenNhanVien || null
    ],
    client
  );

  const routePlanId = planInsert.rows[0].id;
  const { vehicle, driver, customersByLegacyId } = externalResources;

  const vehicleAssignmentInsert = await query(
    `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      routePlanId,
      vehicle.id,
      'CONFIRMED',
      vehicle.vehicle_code,
      vehicle.plate_number,
      vehicle.vehicle_type,
      vehicle.capacity,
      vehicle.seat_count
    ],
    client
  );

  const vehicleAssignmentId = vehicleAssignmentInsert.rows[0].id;

  await query(
    `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      routePlanId,
      driver.id,
      vehicleAssignmentId,
      'CONFIRMED',
      driver.driver_code,
      driver.full_name,
      driver.phone,
      driver.national_id,
      driver.license_no,
      driver.license_class
    ],
    client
  );

  for (const stop of stops) {
    const externalCustomer = customersByLegacyId.get(Number(stop.MaKhachHang));
    await query(
      `
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        routePlanId,
        externalCustomer.id,
        stop.ThuTuDonTra,
        externalCustomer.customer_code,
        externalCustomer.full_name || stop.TenKhachHang,
        externalCustomer.phone || stop.SoDienThoai,
        stop.DiemDon,
        stop.DiemTra,
        buildRoutePlanCustomerNote(stop)
      ],
      client
    );
  }

  return { id: routePlanId, created: true };
}

async function syncRoutePlanProjection(
  client,
  routeId,
  { eventType = null, message = null, payload = null, createdBy = null } = {}
) {
  let linkedPlan = await loadLinkedRoutePlan(client, routeId);
  if (!linkedPlan) {
    linkedPlan = await createRoutePlanProjection(client, routeId, createdBy);
  }

  if (!linkedPlan) {
    return null;
  }

  const detail = await loadLegacyRouteDetail(client, routeId);
  if (!detail) {
    return null;
  }

  const { route, stops } = detail;
  const routePlanId = linkedPlan.id;
  const externalResources = await loadExternalResources(client, route, stops);

  await query(
    `
      UPDATE route_plans
      SET planned_start_at = $1,
          planned_end_at = $2,
          status = $3,
          notes = $4,
          updated_at = NOW()
      WHERE id = $5
    `,
    [
      route.ThoiGianBatDau,
      route.ThoiGianKetThuc,
      mapLegacyRouteStatusToPlanStatus(route.TrangThaiLoTrinh),
      buildRoutePlanNotes(route.GhiChu, routeId),
      routePlanId
    ],
    client
  );

  if (externalResources.vehicle) {
    await query(
      `
        UPDATE route_plan_vehicle_assignments
        SET external_vehicle_id = $1,
            assignment_status = 'CONFIRMED',
            vehicle_plate_snapshot = $2,
            vehicle_type_snapshot = $3,
            vehicle_capacity_snapshot = $4,
            vehicle_seat_count_snapshot = $5,
            updated_at = NOW()
        WHERE route_plan_id = $6
      `,
      [
        externalResources.vehicle.id,
        externalResources.vehicle.plate_number,
        externalResources.vehicle.vehicle_type,
        externalResources.vehicle.capacity,
        externalResources.vehicle.seat_count,
        routePlanId
      ],
      client
    );
  }

  if (externalResources.driver) {
    await query(
      `
        UPDATE route_plan_driver_assignments
        SET external_driver_id = $1,
            assignment_status = 'CONFIRMED',
            driver_name_snapshot = $2,
            driver_phone_snapshot = $3,
            driver_national_id_snapshot = $4,
            driver_license_class_snapshot = $5,
            updated_at = NOW()
        WHERE route_plan_id = $6
      `,
      [
        externalResources.driver.id,
        externalResources.driver.full_name || route.TenTaiXe,
        externalResources.driver.phone || route.SoDienThoaiTaiXe,
        externalResources.driver.national_id || route.CCCD,
        externalResources.driver.license_class || route.LoaiBangLai,
        routePlanId
      ],
      client
    );
  }

  for (const stop of stops) {
    const externalCustomer = externalResources.customersByLegacyId.get(Number(stop.MaKhachHang));
    if (!externalCustomer) {
      continue;
    }

    const updateResult = await query(
      `
        UPDATE route_plan_customers
        SET external_customer_id = $1,
            customer_code_snapshot = $2,
            customer_name_snapshot = $3,
            customer_phone_snapshot = $4,
            pickup_address_snapshot = $5,
            dropoff_address_snapshot = $6,
            note = $7,
            updated_at = NOW()
        WHERE route_plan_id = $8 AND sequence_no = $9
      `,
      [
        externalCustomer.id,
        externalCustomer.customer_code,
        externalCustomer.full_name || stop.TenKhachHang,
        externalCustomer.phone || stop.SoDienThoai,
        stop.DiemDon,
        stop.DiemTra,
        buildRoutePlanCustomerNote(stop),
        routePlanId,
        stop.ThuTuDonTra
      ],
      client
    );

    if (updateResult.rowCount === 0) {
      await query(
        `
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          routePlanId,
          externalCustomer.id,
          stop.ThuTuDonTra,
          externalCustomer.customer_code,
          externalCustomer.full_name || stop.TenKhachHang,
          externalCustomer.phone || stop.SoDienThoai,
          stop.DiemDon,
          stop.DiemTra,
          buildRoutePlanCustomerNote(stop)
        ],
        client
      );
    }
  }

  if (eventType) {
    await insertRoutePlanLog(client, routePlanId, eventType, message, payload, createdBy);
  }

  return { id: routePlanId, created: Boolean(linkedPlan.created) };
}

async function loadRoutePlanSyncState(client, routeId, { sinceId = null, limit = 20 } = {}) {
  const linkedPlan = await loadLinkedRoutePlan(client, routeId);
  if (!linkedPlan) {
    return null;
  }

  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const normalizedSinceId = Number.isInteger(Number(sinceId)) ? Number(sinceId) : null;
  const logFilter = normalizedSinceId != null ? 'AND id > $2' : '';
  const logParams = normalizedSinceId != null
    ? [linkedPlan.id, normalizedSinceId, normalizedLimit]
    : [linkedPlan.id, normalizedLimit];
  const limitPlaceholder = normalizedSinceId != null ? '$3' : '$2';

  const [planResult, latestEventResult, logsResult] = await Promise.all([
    query(
      `
        SELECT
          id,
          plan_code,
          planned_start_at,
          planned_end_at,
          status,
          notes,
          updated_at
        FROM route_plans
        WHERE id = $1
        LIMIT 1
      `,
      [linkedPlan.id],
      client
    ),
    query(
      `
        SELECT MAX(id) AS latestEventId
        FROM route_plan_logs
        WHERE route_plan_id = $1
      `,
      [linkedPlan.id],
      client
    ),
    query(
      `
        SELECT
          id,
          event_type,
          message,
          payload,
          created_by,
          created_at
        FROM route_plan_logs
        WHERE route_plan_id = $1
          ${logFilter}
        ORDER BY id DESC
        LIMIT ${limitPlaceholder}
      `,
      logParams,
      client
    )
  ]);

  const plan = planResult.rows[0] || null;
  const events = (logsResult.rows || [])
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
    latestEventId: latestEventResult.rows[0]?.latestEventId || null,
    events
  };
}

module.exports = {
  buildRoutePlanNotes,
  loadRoutePlanSyncState,
  syncRoutePlanProjection
};
