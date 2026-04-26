const express = require('express');
const { getPool, sql } = require('../db');
const { loadRoutePlanSyncState, syncRoutePlanProjection } = require('../services/routePlanSyncService');
const { DISPATCHER_ROLE, DRIVER_ROLE } = require('../utils/auth');
const { sendError, sendSuccess } = require('../utils/http');
const { lookupAddressCoordinates } = require('../utils/locationCoordinates');

const router = express.Router();

function isDispatcherRequest(req) {
  return req.auth?.VaiTro === DISPATCHER_ROLE;
}

function isDriverRequest(req) {
  return req.auth?.VaiTro === DRIVER_ROLE;
}

function canAccessDriverResource(req, driverId) {
  if (isDispatcherRequest(req)) {
    return true;
  }

  return isDriverRequest(req) && Number(req.auth?.MaTaiXe) === Number(driverId);
}

function canAccessRoute(req, route) {
  if (isDispatcherRequest(req)) {
    return true;
  }

  return isDriverRequest(req) && Number(req.auth?.MaTaiXe) === Number(route?.MaTaiXe);
}

const ACTIVE_ROUTE_STATUSES = ['Chưa thực hiện', 'Đang thực hiện', 'Đang gặp sự cố'];
const FINAL_ROUTE_STATUSES = ['Hoàn thành', 'Đã hủy'];
const DONE_STOP_STATUSES = new Set(['Đã trả khách', 'Khách hủy']);
const ALLOWED_STOP_STATUSES = ['Đã đến điểm đón', 'Đã đón khách', 'Đã trả khách', 'Khách hủy'];

const VALID_ROUTE_STATUSES = new Set([...ACTIVE_ROUTE_STATUSES, ...FINAL_ROUTE_STATUSES]);
const DRIVER_ALLOWED_ROUTE_STATUSES = new Set([
  ACTIVE_ROUTE_STATUSES[1],
  FINAL_ROUTE_STATUSES[0],
  FINAL_ROUTE_STATUSES[1]
]);
const ROUTE_SYNC_POLL_INTERVAL_SECONDS = 15;

function toUniqueIntList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => Number(value)).filter(Number.isInteger))];
}

function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toMinuteTimestamp(value) {
  const parsed = value instanceof Date ? value : parseDateTime(value);
  if (!parsed) return null;
  return Math.floor(parsed.getTime() / 60000);
}

function hasDateTimeChanged(nextValue, currentValue) {
  return toMinuteTimestamp(nextValue) !== toMinuteTimestamp(currentValue);
}

function hasTrimmedTextChanged(nextValue, currentValue) {
  return String(nextValue || '').trim() !== String(currentValue || '').trim();
}

function buildRoutePlanText(tickets) {
  const pickupPoints = [...new Set(tickets.map((ticket) => String(ticket.DiaChiDon || '').trim()).filter(Boolean))];
  const dropPoints = [...new Set(tickets.map((ticket) => String(ticket.DiaChiTra || '').trim()).filter(Boolean))];
  return [...pickupPoints, ...dropPoints].join(' -> ');
}

function normalizeCoordinateValue(value) {
  if (value == null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function resolveCoordinates(address, latValue, lngValue) {
  const lat = normalizeCoordinateValue(latValue);
  const lng = normalizeCoordinateValue(lngValue);

  if (lat != null && lng != null) {
    return { lat, lng };
  }

  return lookupAddressCoordinates(address);
}

function withResolvedStopCoordinates(stop) {
  const pickupCoordinates = resolveCoordinates(stop.DiemDon, stop.DiemDonLat, stop.DiemDonLng);
  const dropoffCoordinates = resolveCoordinates(stop.DiemTra, stop.DiemTraLat, stop.DiemTraLng);

  return {
    ...stop,
    DiemDonLat: pickupCoordinates?.lat ?? null,
    DiemDonLng: pickupCoordinates?.lng ?? null,
    DiemTraLat: dropoffCoordinates?.lat ?? null,
    DiemTraLng: dropoffCoordinates?.lng ?? null
  };
}

function buildNavigationTrip(route, stops) {
  const activeStop = stops.find((stop) => !DONE_STOP_STATUSES.has(String(stop.TrangThaiKhach || '').trim())) || null;
  const referenceStop = activeStop || stops[0] || null;
  const routeStatus = String(route?.TrangThaiLoTrinh || '').trim();
  const activeStopStatus = String(referenceStop?.TrangThaiKhach || '').trim();

  let tripStatus = 'ASSIGNED';
  let currentStageLabel = 'Đang đến điểm đón';

  if (!referenceStop || !activeStop || FINAL_ROUTE_STATUSES.includes(routeStatus)) {
    tripStatus = 'COMPLETED';
    currentStageLabel = 'Hoàn thành';
  } else if (activeStopStatus === 'Đã đón khách') {
    tripStatus = 'PICKED_UP';
    currentStageLabel = 'Đã đón khách';
  } else if (routeStatus === 'Đang thực hiện' || routeStatus === 'Đang gặp sự cố') {
    tripStatus = 'GOING_TO_PICKUP';
  }

  return {
    tripId: Number(route?.MaLoTrinh) || null,
    customerName: referenceStop?.TenKhachHang || null,
    pickupAddress: referenceStop?.DiemDon || null,
    pickupLat: normalizeCoordinateValue(referenceStop?.DiemDonLat),
    pickupLng: normalizeCoordinateValue(referenceStop?.DiemDonLng),
    dropoffAddress: referenceStop?.DiemTra || null,
    dropoffLat: normalizeCoordinateValue(referenceStop?.DiemTraLat),
    dropoffLng: normalizeCoordinateValue(referenceStop?.DiemTraLng),
    driverId: Number(route?.MaTaiXe) || null,
    tripStatus,
    currentStageLabel,
    activeStopId: Number(referenceStop?.MaChiTiet) || null,
    activeStopStatus: activeStopStatus || null,
    routeStatus: routeStatus || null
  };
}

function buildDriverSyncContract(routeId) {
  return {
    mode: 'POLL',
    eventsEndpoint: `/api/v1/routes/${routeId}/sync-events`,
    routeDetailEndpoint: `/api/v1/routes/${routeId}`,
    recommendedIntervalSeconds: ROUTE_SYNC_POLL_INTERVAL_SECONDS
  };
}

function buildRouteSyncPayload(routeId, syncState) {
  return {
    available: Boolean(syncState),
    contract: buildDriverSyncContract(routeId),
    state: syncState || {
      routePlanId: null,
      planCode: null,
      status: null,
      plannedStartAt: null,
      plannedEndAt: null,
      notes: null,
      updatedAt: null,
      latestEventId: null,
      events: []
    }
  };
}

async function loadRouteSyncForResponse(db, routeId, options) {
  try {
    return await loadRoutePlanSyncState(db, routeId, options);
  } catch (error) {
    if (error?.code === 'EREQUEST' && /route_plan/i.test(String(error.message || ''))) {
      return null;
    }

    throw error;
  }
}

async function loadRouteSummary(db, routeId) {
  const request = db.request();
  let whereClause = '';

  if (routeId != null) {
    request.input('routeId', sql.Int, routeId);
    whereClause = ' AND lt.MaLoTrinh = @routeId';
  }

  const result = await request.query(`
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
      x.TrangThaiXe,
      tx.HoTen AS TenTaiXe,
      tx.SoDienThoai AS SoDienThoaiTaiXe,
      tx.TrangThaiTaiXe,
      nv.HoTen AS TenNhanVien,
      COUNT(ct.MaChiTiet) AS SoDiemDonTra,
      COUNT(DISTINCT ct.MaVe) AS SoKhach,
      ISNULL(SUM(v.SoLuongGhe), 0) AS TongGhe
    FROM LoTrinhTrungChuyen lt
    JOIN XeTrungChuyen x ON x.MaXe = lt.MaXe
    JOIN TaiXe tx ON tx.MaTaiXe = lt.MaTaiXe
    JOIN NhanVienDieuPhoi nv ON nv.MaNhanVien = lt.MaNhanVien
    LEFT JOIN ChiTietLoTrinh ct ON ct.MaLoTrinh = lt.MaLoTrinh
    LEFT JOIN VeTrungChuyen v ON v.MaVe = ct.MaVe
    WHERE 1 = 1
      ${whereClause}
    GROUP BY
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
      x.TrangThaiXe,
      tx.HoTen,
      tx.SoDienThoai,
      tx.TrangThaiTaiXe,
      nv.HoTen
    ORDER BY lt.ThoiGianBatDau DESC, lt.MaLoTrinh DESC
  `);

  return routeId != null ? result.recordset[0] || null : result.recordset;
}

async function loadRouteStops(db, routeId) {
  const result = await db
    .request()
    .input('routeId', sql.Int, routeId)
    .query(`
      SELECT
        ct.MaChiTiet,
        ct.ThuTuDonTra,
        ct.DiemDon,
        ct.DiemDonLat,
        ct.DiemDonLng,
        ct.DiemTra,
        ct.DiemTraLat,
        ct.DiemTraLng,
        ct.ThoiGianDonDuKien,
        ct.TrangThaiKhach,
        ct.MaLoTrinh,
        ct.MaVe,
        v.SoLuongGhe,
        v.KhungGioTrungChuyen,
        v.TrangThaiVe,
        k.MaKhachHang,
        k.TenKhachHang,
        k.SoDienThoai
      FROM ChiTietLoTrinh ct
      JOIN VeTrungChuyen v ON v.MaVe = ct.MaVe
      JOIN KhachHang k ON k.MaKhachHang = v.MaKhachHang
      WHERE ct.MaLoTrinh = @routeId
      ORDER BY ct.ThuTuDonTra, ct.MaChiTiet
    `);

  return result.recordset.map(withResolvedStopCoordinates);
}

async function syncResources(db, route, routeStatus) {
  let vehicleStatus = 'Rảnh';
  let driverStatus = 'Rảnh';

  if (routeStatus === 'Chưa thực hiện') {
    vehicleStatus = 'Đã phân công';
    driverStatus = 'Đã phân công';
  } else if (routeStatus === 'Đang thực hiện' || routeStatus === 'Đang gặp sự cố') {
    vehicleStatus = 'Đang chạy';
    driverStatus = 'Đang thực hiện';
  } else if (!FINAL_ROUTE_STATUSES.includes(routeStatus)) {
    vehicleStatus = route.TrangThaiXe || 'Rảnh';
    driverStatus = route.TrangThaiTaiXe || 'Rảnh';
  }

  await db
    .request()
    .input('MaXe', sql.Int, route.MaXe)
    .input('TrangThaiXe', sql.NVarChar(30), vehicleStatus)
    .query(`
      UPDATE XeTrungChuyen
      SET TrangThaiXe = @TrangThaiXe
      WHERE MaXe = @MaXe
    `);

  await db
    .request()
    .input('MaTaiXe', sql.Int, route.MaTaiXe)
    .input('TrangThaiTaiXe', sql.NVarChar(30), driverStatus)
    .query(`
      UPDATE TaiXe
      SET TrangThaiTaiXe = @TrangThaiTaiXe
      WHERE MaTaiXe = @MaTaiXe
    `);

  // Sync sang external_* để danh sách chọn xe/tài xế (UI) phản ánh đúng trạng thái.
  const externalVehicleAvailability =
    vehicleStatus === 'Đã phân công'
      ? 'ASSIGNED'
      : vehicleStatus === 'Đang chạy'
        ? 'ON_TRIP'
        : vehicleStatus === 'Bảo trì'
          ? 'MAINTENANCE'
          : 'AVAILABLE';

  const externalDriverAvailability =
    driverStatus === 'Đã phân công'
      ? 'ASSIGNED'
      : driverStatus === 'Đang thực hiện'
        ? 'BUSY'
        : driverStatus === 'Không sẵn sàng' || driverStatus === 'Ngừng hoạt động'
          ? 'OFF'
          : 'AVAILABLE';

  await db
    .request()
    .input('MaXe', sql.Int, route.MaXe)
    .input('availability', sql.NVarChar(20), externalVehicleAvailability)
    .query(`
      UPDATE external_vehicles
      SET availability_status = @availability,
          updated_at = GETDATE()
      WHERE legacy_ma_xe = @MaXe
    `);

  await db
    .request()
    .input('MaTaiXe', sql.Int, route.MaTaiXe)
    .input('availability', sql.NVarChar(20), externalDriverAvailability)
    .query(`
      UPDATE external_drivers
      SET availability_status = @availability,
          updated_at = GETDATE()
      WHERE legacy_ma_tai_xe = @MaTaiXe
    `);
}

async function syncTicketsForCancelledRoute(db, routeId) {
  const stops = await loadRouteStops(db, routeId);

  for (const stop of stops) {
    let ticketStatus = 'Cần trung chuyển';
    const stopStatus = String(stop.TrangThaiKhach || '').trim();

    if (stopStatus === 'Đã trả khách') {
      ticketStatus = 'Hoàn tất trung chuyển';
    } else if (stopStatus === 'Khách hủy') {
      ticketStatus = 'Hủy';
    }

    await db
      .request()
      .input('MaVe', sql.Int, stop.MaVe)
      .input('TrangThaiVe', sql.NVarChar(50), ticketStatus)
      .query(`
        UPDATE VeTrungChuyen
        SET TrangThaiVe = @TrangThaiVe
        WHERE MaVe = @MaVe
      `);
  }
}

// GET /routes - danh sách lộ trình
router.get('/', async (req, res) => {
  const { status } = req.query;

  if (!isDispatcherRequest(req)) {
    return sendError(res, 403, 'Bạn không có quyền truy cập danh sách lộ trình tổng hợp', 'FORBIDDEN');
  }

  try {
    const pool = await getPool();
    let rows = await loadRouteSummary(pool);

    if (status) {
      rows = rows.filter((row) => row.TrangThaiLoTrinh === status);
    }

    return sendSuccess(res, rows, 'Lấy danh sách lộ trình thành công');
  } catch (err) {
    console.error('Get routes error:', err);
    return sendError(res, 500, 'Lỗi lấy danh sách lộ trình', 'SERVER_ERROR', { detail: err.message });
  }
});

// GET /routes/by-driver/:driverId - danh sách lộ trình theo tài xế
router.get('/by-driver/:driverId', async (req, res) => {
  const driverId = Number(req.params.driverId);
  const { status } = req.query;

  if (!Number.isInteger(driverId)) {
    return sendError(res, 400, 'Mã tài xế không hợp lệ', 'VALIDATION_ERROR');
  }

  if (!canAccessDriverResource(req, driverId)) {
    return sendError(res, 403, 'Bạn không có quyền xem chuyến của tài xế này', 'FORBIDDEN');
  }

  try {
    const pool = await getPool();
    const request = pool.request().input('driverId', sql.Int, driverId);

    let query = `
      SELECT
        lt.MaLoTrinh,
        lt.ThoiGianBatDau,
        lt.ThoiGianKetThuc,
        lt.LoTrinhDuKien,
        lt.GhiChu,
        lt.TrangThaiLoTrinh,
        lt.MaXe,
        lt.MaTaiXe,
        x.BienSo,
        x.LoaiXe,
        x.SoCho,
        COUNT(ct.MaChiTiet) AS SoDiemDonTra,
        COUNT(DISTINCT ct.MaVe) AS SoKhach,
        ISNULL(SUM(v.SoLuongGhe), 0) AS TongGhe
      FROM LoTrinhTrungChuyen lt
      JOIN XeTrungChuyen x ON x.MaXe = lt.MaXe
      LEFT JOIN ChiTietLoTrinh ct ON ct.MaLoTrinh = lt.MaLoTrinh
      LEFT JOIN VeTrungChuyen v ON v.MaVe = ct.MaVe
      WHERE lt.MaTaiXe = @driverId
    `;

    if (status) {
      request.input('status', sql.NVarChar(50), status);
      query += ' AND lt.TrangThaiLoTrinh = @status';
    }

    query += `
      GROUP BY
        lt.MaLoTrinh,
        lt.ThoiGianBatDau,
        lt.ThoiGianKetThuc,
        lt.LoTrinhDuKien,
        lt.GhiChu,
        lt.TrangThaiLoTrinh,
        lt.MaXe,
        lt.MaTaiXe,
        x.BienSo,
        x.LoaiXe,
        x.SoCho
      ORDER BY lt.ThoiGianBatDau DESC, lt.MaLoTrinh DESC
    `;

    const result = await request.query(query);
    return sendSuccess(res, result.recordset, 'Lấy danh sách chuyến cho tài xế thành công');
  } catch (err) {
    console.error('Get routes by driver error:', err);
    return sendError(res, 500, 'Lỗi lấy danh sách chuyến cho tài xế', 'SERVER_ERROR', {
      detail: err.message
    });
  }
});

// GET /routes/:id - chi tiết lộ trình + danh sách điểm đón
router.get('/:id', async (req, res) => {
  const routeId = Number(req.params.id);

  if (!Number.isInteger(routeId)) {
    return sendError(res, 400, 'Mã lộ trình không hợp lệ', 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();
    const route = await loadRouteSummary(pool, routeId);

    if (!route) {
      return sendError(res, 404, 'Không tìm thấy lộ trình', 'NOT_FOUND');
    }

    if (!canAccessRoute(req, route)) {
      return sendError(res, 403, 'Bạn không có quyền xem lộ trình này', 'FORBIDDEN');
    }

    const stops = await loadRouteStops(pool, routeId);
    const syncState = await loadRouteSyncForResponse(pool, routeId);

    return sendSuccess(
      res,
      {
        route,
        stops,
        navigationTrip: buildNavigationTrip(route, stops),
        sync: buildRouteSyncPayload(routeId, syncState)
      },
      'Lấy thông tin lộ trình thành công'
    );
  } catch (err) {
    console.error('Get route detail error:', err);
    return sendError(res, 500, 'Lỗi lấy thông tin lộ trình', 'SERVER_ERROR', { detail: err.message });
  }
});

// POST /routes/:id/incident - báo cáo sự cố chuyến
router.get('/:id/sync-events', async (req, res) => {
  const routeId = Number(req.params.id);
  const sinceId = req.query.sinceId;
  const limit = req.query.limit;

  if (!Number.isInteger(routeId)) {
    return sendError(res, 400, 'MÃ£ lá»™ trÃ¬nh khÃ´ng há»£p lá»‡', 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();
    const route = await loadRouteSummary(pool, routeId);

    if (!route) {
      return sendError(res, 404, 'KhÃ´ng tÃ¬m tháº¥y lá»™ trÃ¬nh', 'NOT_FOUND');
    }

    if (!canAccessRoute(req, route)) {
      return sendError(res, 403, 'Báº¡n khÃ´ng cÃ³ quyá»n xem cáº­p nháº­t lá»™ trÃ¬nh nÃ y', 'FORBIDDEN');
    }

    const syncState = await loadRouteSyncForResponse(pool, routeId, { sinceId, limit });
    return sendSuccess(
      res,
      {
        routeId,
        sync: buildRouteSyncPayload(routeId, syncState)
      },
      'Láº¥y sá»± kiá»‡n Ä‘á»“ng bá»™ lá»™ trÃ¬nh thÃ nh cÃ´ng'
    );
  } catch (err) {
    console.error('Get route sync events error:', err);
    return sendError(res, 500, 'Lá»—i láº¥y sá»± kiá»‡n Ä‘á»“ng bá»™ lá»™ trÃ¬nh', 'SERVER_ERROR', {
      detail: err.message
    });
  }
});

router.post('/:id/incident', async (req, res) => {
  const routeId = Number(req.params.id);
  const { description, location } = req.body || {};
  const createdBy = String(req.auth?.TenDangNhap || req.auth?.HoTen || '').trim() || null;

  if (!Number.isInteger(routeId)) {
    return sendError(res, 400, 'Mã lộ trình không hợp lệ', 'VALIDATION_ERROR');
  }

  if (!description || String(description).trim().length < 3) {
    return sendError(res, 400, 'Vui lòng nhập nội dung sự cố.', 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();
    const route = await loadRouteSummary(pool, routeId);

    if (!route) {
      return sendError(res, 404, 'Không tìm thấy lộ trình', 'NOT_FOUND');
    }

    if (!canAccessRoute(req, route)) {
      return sendError(res, 403, 'Bạn không có quyền báo cáo sự cố cho lộ trình này', 'FORBIDDEN');
    }

    await pool
      .request()
      .input('routeId', sql.Int, routeId)
      .input('TrangThaiLoTrinh', sql.NVarChar(50), 'Đang gặp sự cố')
      .query(`
        UPDATE LoTrinhTrungChuyen
        SET TrangThaiLoTrinh = @TrangThaiLoTrinh
        WHERE MaLoTrinh = @routeId
      `);

    await syncResources(pool, route, 'Đang gặp sự cố');
    await syncRoutePlanProjection(pool, routeId, {
      eventType: 'INCIDENT_REPORTED',
      message: String(description).trim(),
      payload: { location: location ? String(location).trim() : null },
      createdBy
    });

    await pool
      .request()
      .input('MaLoTrinh', sql.Int, routeId)
      .input(
        'ViTriHienTai',
        sql.NVarChar(255),
        location ? String(location).trim() : `Sự cố: ${String(description).trim()}`
      )
      .input('TrangThai', sql.NVarChar(50), 'Đang gặp sự cố')
      .query(`
        INSERT INTO TheoDoiTrangThai (ViTriHienTai, TrangThai, MaLoTrinh)
        VALUES (@ViTriHienTai, @TrangThai, @MaLoTrinh)
      `);

    const updatedRoute = await loadRouteSummary(pool, routeId);

    return sendSuccess(
      res,
      {
        route: updatedRoute
      },
      'Đã ghi nhận sự cố.'
    );
  } catch (err) {
    console.error('Report incident error:', err);
    return sendError(res, 500, 'Lỗi báo cáo sự cố', 'SERVER_ERROR', { detail: err.message });
  }
});

// PATCH /routes/:routeId/stops/:stopId/status - cập nhật trạng thái đón/trả khách
router.patch('/:routeId/stops/:stopId/status', async (req, res) => {
  const routeId = Number(req.params.routeId);
  const stopId = Number(req.params.stopId);
  const { status } = req.body || {};
  const createdBy = String(req.auth?.TenDangNhap || req.auth?.HoTen || '').trim() || null;

  if (!Number.isInteger(routeId) || !Number.isInteger(stopId)) {
    return sendError(res, 400, 'Mã lộ trình hoặc mã điểm đón không hợp lệ', 'VALIDATION_ERROR');
  }

  if (!ALLOWED_STOP_STATUSES.includes(status)) {
    return sendError(
      res,
      400,
      `Trạng thái khách không hợp lệ. Cho phép: ${ALLOWED_STOP_STATUSES.join(' / ')}`,
      'VALIDATION_ERROR'
    );
  }

  try {
    const pool = await getPool();
    const route = await loadRouteSummary(pool, routeId);

    if (!route) {
      return sendError(res, 404, 'Không tìm thấy lộ trình', 'NOT_FOUND');
    }

    if (!canAccessRoute(req, route)) {
      return sendError(res, 403, 'Bạn không có quyền cập nhật khách cho lộ trình này', 'FORBIDDEN');
    }

    if (!['Đang thực hiện', 'Đang gặp sự cố'].includes(route.TrangThaiLoTrinh)) {
      return sendError(
        res,
        422,
        'Chỉ được cập nhật trạng thái khách khi chuyến đang ở trạng thái "Đang thực hiện" hoặc "Đang gặp sự cố".',
        'INVALID_ROUTE_STATUS'
      );
    }

    const stopResult = await pool
      .request()
      .input('routeId', sql.Int, routeId)
      .input('stopId', sql.Int, stopId)
      .query(`
        SELECT TOP 1 *
        FROM ChiTietLoTrinh
        WHERE MaLoTrinh = @routeId AND MaChiTiet = @stopId
      `);

    if (stopResult.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy điểm đón/trả', 'NOT_FOUND');
    }

    const stop = stopResult.recordset[0];

    await pool
      .request()
      .input('routeId', sql.Int, routeId)
      .input('stopId', sql.Int, stopId)
      .input('TrangThaiKhach', sql.NVarChar(50), status)
      .query(`
        UPDATE ChiTietLoTrinh
        SET TrangThaiKhach = @TrangThaiKhach
        WHERE MaLoTrinh = @routeId AND MaChiTiet = @stopId
      `);

    let ticketStatus = 'Đã có xe trung chuyển';
    if (status === 'Đã đón khách') {
      ticketStatus = 'Đang trung chuyển';
    } else if (status === 'Đã trả khách') {
      ticketStatus = 'Hoàn tất trung chuyển';
    } else if (status === 'Khách hủy') {
      ticketStatus = 'Hủy';
    }

    await pool
      .request()
      .input('MaVe', sql.Int, stop.MaVe)
      .input('TrangThaiVe', sql.NVarChar(50), ticketStatus)
      .query(`
        UPDATE VeTrungChuyen
        SET TrangThaiVe = @TrangThaiVe
        WHERE MaVe = @MaVe
      `);

    const allStops = await loadRouteStops(pool, routeId);
    const allDone = allStops.length > 0 && allStops.every((row) => DONE_STOP_STATUSES.has(String(row.TrangThaiKhach || '').trim()));

    if (allDone) {
      await pool
        .request()
        .input('routeId', sql.Int, routeId)
        .input('ThoiGianKetThuc', sql.DateTime, new Date())
        .query(`
          UPDATE LoTrinhTrungChuyen
          SET TrangThaiLoTrinh = N'Hoàn thành',
              ThoiGianKetThuc = @ThoiGianKetThuc
          WHERE MaLoTrinh = @routeId
        `);

      await syncResources(pool, route, 'Hoàn thành');
    }

    await syncRoutePlanProjection(pool, routeId, {
      eventType: 'STOP_STATUS_UPDATED',
      message: `Cập nhật điểm đón/trả ${stopId}`,
      payload: {
        stopId,
        status,
        routeAutoCompleted: allDone
      },
      createdBy
    });

    return sendSuccess(
      res,
      {
        stop: { ...stop, TrangThaiKhach: status },
        routeAutoCompleted: allDone
      },
      allDone ? 'Đã cập nhật trạng thái khách. Chuyến đã hoàn thành.' : 'Đã cập nhật trạng thái khách.'
    );
  } catch (err) {
    console.error('Update stop status error:', err);
    return sendError(res, 500, 'Lỗi cập nhật trạng thái khách', 'SERVER_ERROR', {
      detail: err.message
    });
  }
});

// POST /routes - lập kế hoạch lộ trình trung chuyển
router.post('/', async (req, res) => {
  const {
    MaXe,
    MaTaiXe,
    ThoiGianBatDau,
    ThoiGianKetThuc,
    LoTrinhDuKien,
    GhiChu,
    ticketIds
  } = req.body || {};

  const routeStart = parseDateTime(ThoiGianBatDau);
  const routeEnd = parseDateTime(ThoiGianKetThuc);
  const selectedTicketIds = toUniqueIntList(ticketIds);
  const dispatcherId = Number(req.auth?.MaNhanVien);
  const createdBy = String(req.auth?.TenDangNhap || req.auth?.HoTen || '').trim() || null;

  if (!isDispatcherRequest(req)) {
    return sendError(res, 403, 'Chỉ điều phối viên mới được tạo lộ trình', 'FORBIDDEN');
  }

  if (!Number.isInteger(Number(MaXe)) || !Number.isInteger(Number(MaTaiXe)) || !Number.isInteger(dispatcherId) || !routeStart || selectedTicketIds.length === 0) {
    return sendError(res, 400, 'Thiếu thông tin bắt buộc để lập lộ trình', 'VALIDATION_ERROR');
  }

  if (routeStart.getTime() < Date.now()) {
    return sendError(res, 400, 'Thời gian bắt đầu không được ở quá khứ', 'VALIDATION_ERROR');
  }

  if (routeEnd && routeEnd < routeStart) {
    return sendError(
      res,
      400,
      'Thời gian kết thúc phải lớn hơn hoặc bằng thời gian bắt đầu',
      'VALIDATION_ERROR'
    );
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const ticketRows = await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), selectedTicketIds.join(','))
        .query(`
          SELECT
            v.MaVe,
            v.KhungGioTrungChuyen,
            v.SoLuongGhe,
            v.TrangThaiVe,
            k.MaKhachHang,
            k.TenKhachHang,
            k.SoDienThoai,
            k.DiaChiDon,
            k.DiaChiDonLat,
            k.DiaChiDonLng,
            k.DiaChiTra,
            k.DiaChiTraLat,
            k.DiaChiTraLng
          FROM VeTrungChuyen v
          JOIN KhachHang k ON k.MaKhachHang = v.MaKhachHang
          WHERE v.MaVe IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
          ORDER BY k.DiaChiDon, k.DiaChiTra, v.MaVe
        `);

      const selectedTickets = ticketRows.recordset;

      if (selectedTickets.length !== selectedTicketIds.length) {
        throw Object.assign(new Error('Có vé không tồn tại hoặc đã bị loại khỏi hệ thống'), { status: 400 });
      }

      const invalidTicket = selectedTickets.find((ticket) => ticket.TrangThaiVe !== 'Cần trung chuyển');
      if (invalidTicket) {
        throw Object.assign(new Error(`Vé ${invalidTicket.MaVe} không còn ở trạng thái "Cần trung chuyển"`), { status: 409 });
      }

      const totalSeats = selectedTickets.reduce((sum, ticket) => sum + Number(ticket.SoLuongGhe || 0), 0);

      const vehicleResult = await new sql.Request(transaction)
        .input('MaXe', sql.Int, Number(MaXe))
        .query('SELECT * FROM XeTrungChuyen WHERE MaXe = @MaXe');

      if (vehicleResult.recordset.length === 0) {
        throw Object.assign(new Error('Xe không tồn tại'), { status: 400 });
      }

      const vehicle = vehicleResult.recordset[0];
      if (totalSeats > Number(vehicle.SoCho)) {
        throw Object.assign(new Error('Hành khách vượt quá sức chứa xe'), { status: 422 });
      }

      const vehicleConflict = await new sql.Request(transaction)
        .input('MaXe', sql.Int, Number(MaXe))
        .query(`
          SELECT TOP 1 MaLoTrinh
          FROM LoTrinhTrungChuyen
          WHERE MaXe = @MaXe
            AND TrangThaiLoTrinh IN (N'Chưa thực hiện', N'Đang thực hiện', N'Đang gặp sự cố')
        `);

      if (vehicleConflict.recordset.length > 0) {
        throw Object.assign(new Error('Xe đang được phân công cho lộ trình khác'), { status: 409 });
      }

      const driverResult = await new sql.Request(transaction)
        .input('MaTaiXe', sql.Int, Number(MaTaiXe))
        .query('SELECT * FROM TaiXe WHERE MaTaiXe = @MaTaiXe');

      if (driverResult.recordset.length === 0) {
        throw Object.assign(new Error('Tài xế không tồn tại'), { status: 400 });
      }

      const driver = driverResult.recordset[0];
      const driverConflict = await new sql.Request(transaction)
        .input('MaTaiXe', sql.Int, Number(MaTaiXe))
        .query(`
          SELECT TOP 1 MaLoTrinh
          FROM LoTrinhTrungChuyen
          WHERE MaTaiXe = @MaTaiXe
            AND TrangThaiLoTrinh IN (N'Chưa thực hiện', N'Đang thực hiện', N'Đang gặp sự cố')
        `);

      if (driverConflict.recordset.length > 0) {
        throw Object.assign(new Error('Tài xế đang được phân công cho lộ trình khác'), { status: 409 });
      }

      const dispatcherResult = await new sql.Request(transaction)
        .input('MaNhanVien', sql.Int, dispatcherId)
        .query('SELECT * FROM NhanVienDieuPhoi WHERE MaNhanVien = @MaNhanVien');

      if (dispatcherResult.recordset.length === 0) {
        throw Object.assign(new Error('Nhân viên điều phối không tồn tại'), { status: 400 });
      }

      const routePlanText = String(LoTrinhDuKien || '').trim() || buildRoutePlanText(selectedTickets);
      const routeInsert = await new sql.Request(transaction)
        .input('ThoiGianBatDau', sql.DateTime, routeStart)
        .input('ThoiGianKetThuc', sql.DateTime, routeEnd)
        .input('LoTrinhDuKien', sql.NVarChar(sql.MAX), routePlanText || null)
        .input('GhiChu', sql.NVarChar(sql.MAX), GhiChu ? String(GhiChu).trim() : null)
        .input('TrangThaiLoTrinh', sql.NVarChar(30), 'Chưa thực hiện')
        .input('MaXe', sql.Int, Number(MaXe))
        .input('MaTaiXe', sql.Int, Number(MaTaiXe))
        .input('MaNhanVien', sql.Int, dispatcherId)
        .query(`
          INSERT INTO LoTrinhTrungChuyen
            (ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, GhiChu, TrangThaiLoTrinh, MaXe, MaTaiXe, MaNhanVien)
          OUTPUT INSERTED.MaLoTrinh
          VALUES (@ThoiGianBatDau, @ThoiGianKetThuc, @LoTrinhDuKien, @GhiChu, @TrangThaiLoTrinh, @MaXe, @MaTaiXe, @MaNhanVien)
        `);

      const routeId = routeInsert.recordset[0].MaLoTrinh;

      for (const [index, ticket] of selectedTickets.entries()) {
        const expectedPickupTime = new Date(routeStart.getTime() + index * 10 * 60 * 1000);
        const pickupCoordinates = resolveCoordinates(ticket.DiaChiDon, ticket.DiaChiDonLat, ticket.DiaChiDonLng);
        const dropoffCoordinates = resolveCoordinates(ticket.DiaChiTra, ticket.DiaChiTraLat, ticket.DiaChiTraLng);

        await new sql.Request(transaction)
          .input('ThuTuDonTra', sql.Int, index + 1)
          .input('DiemDon', sql.NVarChar(255), ticket.DiaChiDon)
          .input('DiemDonLat', sql.Decimal(10, 7), pickupCoordinates?.lat ?? null)
          .input('DiemDonLng', sql.Decimal(10, 7), pickupCoordinates?.lng ?? null)
          .input('DiemTra', sql.NVarChar(255), ticket.DiaChiTra)
          .input('DiemTraLat', sql.Decimal(10, 7), dropoffCoordinates?.lat ?? null)
          .input('DiemTraLng', sql.Decimal(10, 7), dropoffCoordinates?.lng ?? null)
          .input('ThoiGianDonDuKien', sql.DateTime, expectedPickupTime)
          .input('TrangThaiKhach', sql.NVarChar(50), null)
          .input('MaLoTrinh', sql.Int, routeId)
          .input('MaVe', sql.Int, ticket.MaVe)
          .query(`
            INSERT INTO ChiTietLoTrinh
              (ThuTuDonTra, DiemDon, DiemDonLat, DiemDonLng, DiemTra, DiemTraLat, DiemTraLng, ThoiGianDonDuKien, TrangThaiKhach, MaLoTrinh, MaVe)
            VALUES (@ThuTuDonTra, @DiemDon, @DiemDonLat, @DiemDonLng, @DiemTra, @DiemTraLat, @DiemTraLng, @ThoiGianDonDuKien, @TrangThaiKhach, @MaLoTrinh, @MaVe)
          `);

        await new sql.Request(transaction)
          .input('MaVe', sql.Int, ticket.MaVe)
          .input('TrangThaiVe', sql.NVarChar(50), 'Đã có xe trung chuyển')
          .query(`
            UPDATE VeTrungChuyen
            SET TrangThaiVe = @TrangThaiVe
            WHERE MaVe = @MaVe
          `);
      }

      const routeForSync = {
        MaXe: Number(MaXe),
        MaTaiXe: Number(MaTaiXe),
        TrangThaiXe: vehicle.TrangThaiXe,
        TrangThaiTaiXe: driver.TrangThaiTaiXe
      };
      await syncResources(transaction, routeForSync, 'Chưa thực hiện');
      await syncRoutePlanProjection(transaction, routeId, {
        eventType: 'ROUTE_CREATED',
        message: 'Tạo lộ trình từ API /routes',
        payload: { ticketIds: selectedTicketIds },
        createdBy
      });

      await transaction.commit();

      const route = await loadRouteSummary(pool, routeId);
      const stops = await loadRouteStops(pool, routeId);

      return sendSuccess(
        res,
        {
          route,
          stops,
          ticketIds: selectedTicketIds
        },
        'Tạo lộ trình thành công',
        201
      );
    } catch (innerError) {
      await transaction.rollback();
      throw innerError;
    }
  } catch (err) {
    console.error('Create route error:', err);
    return sendError(
      res,
      err.status || 500,
      err.message || 'Lỗi tạo lộ trình',
      err.code || 'SERVER_ERROR',
      err.detail ? { detail: err.detail } : null
    );
  }
});

// PUT /routes/:id - cập nhật thông tin lộ trình
router.put('/:id', async (req, res) => {
  const routeId = Number(req.params.id);
  const { ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, TrangThaiLoTrinh, GhiChu } = req.body || {};
  const createdBy = String(req.auth?.TenDangNhap || req.auth?.HoTen || '').trim() || null;
  const requestedStatus = TrangThaiLoTrinh != null ? String(TrangThaiLoTrinh).trim() : undefined;

  if (!Number.isInteger(routeId)) {
    return sendError(res, 400, 'Mã lộ trình không hợp lệ', 'VALIDATION_ERROR');
  }

  const startTime = ThoiGianBatDau != null ? parseDateTime(ThoiGianBatDau) : undefined;
  const endTime = ThoiGianKetThuc != null ? parseDateTime(ThoiGianKetThuc) : undefined;

  if (ThoiGianBatDau != null && !startTime) {
    return sendError(res, 400, 'Thời gian bắt đầu không hợp lệ', 'VALIDATION_ERROR');
  }

  if (ThoiGianKetThuc != null && !endTime) {
    return sendError(res, 400, 'Thời gian kết thúc không hợp lệ', 'VALIDATION_ERROR');
  }

  if (startTime && endTime && endTime < startTime) {
    return sendError(
      res,
      400,
      'Thời gian kết thúc phải lớn hơn hoặc bằng thời gian bắt đầu',
      'VALIDATION_ERROR'
    );
  }

  if (requestedStatus && !VALID_ROUTE_STATUSES.has(requestedStatus)) {
    return sendError(
      res,
      400,
      `Trạng thái lộ trình không hợp lệ. Cho phép: ${[...VALID_ROUTE_STATUSES].join(' / ')}`,
      'VALIDATION_ERROR'
    );
  }

  try {
    const pool = await getPool();
    const current = await loadRouteSummary(pool, routeId);

    if (!current) {
      return sendError(res, 404, 'Không tìm thấy lộ trình', 'NOT_FOUND');
    }

    if (!canAccessRoute(req, current)) {
      return sendError(res, 403, 'Bạn không có quyền cập nhật lộ trình này', 'FORBIDDEN');
    }

    const dispatcherChangedStartTime =
      isDispatcherRequest(req) &&
      startTime &&
      hasDateTimeChanged(startTime, current.ThoiGianBatDau);

    if (dispatcherChangedStartTime && startTime.getTime() < Date.now()) {
      return sendError(res, 400, 'Thời gian không hợp lệ', 'VALIDATION_ERROR');
    }

    if (requestedStatus === 'Hoàn thành') {
      const stops = await loadRouteStops(pool, routeId);
      const allDone = stops.length > 0 && stops.every((row) => DONE_STOP_STATUSES.has(String(row.TrangThaiKhach || '').trim()));
      if (!allDone) {
        return sendError(
          res,
          422,
          'Chỉ được chuyển sang "Hoàn thành" khi toàn bộ khách hàng đã được xử lý.',
          'INVALID_ROUTE_STATUS'
        );
      }
    }

    if (isDriverRequest(req)) {
      const hasRestrictedFields =
        ThoiGianBatDau !== undefined ||
        ThoiGianKetThuc !== undefined ||
        LoTrinhDuKien !== undefined;

      if (hasRestrictedFields) {
        return sendError(
          res,
          403,
          'Tài xế chỉ được cập nhật trạng thái chuyến hoặc ghi chú liên quan đến chuyến của mình',
          'FORBIDDEN'
        );
      }

      if (requestedStatus && !DRIVER_ALLOWED_ROUTE_STATUSES.has(requestedStatus)) {
        return sendError(res, 403, 'Tài xế không được cập nhật trạng thái này', 'FORBIDDEN');
      }

      if (!requestedStatus && GhiChu !== undefined) {
        return sendError(
          res,
          403,
          'Tài xế không được chỉnh sửa ghi chú nếu không có thay đổi trạng thái',
          'FORBIDDEN'
        );
      }
    }

    const nextStatus = requestedStatus || current.TrangThaiLoTrinh;
    const nextStartTime = startTime || current.ThoiGianBatDau;
    const nextEndTime =
      endTime !== undefined
        ? endTime
        : FINAL_ROUTE_STATUSES.includes(nextStatus)
          ? current.ThoiGianKetThuc || new Date()
          : current.ThoiGianKetThuc;
    const nextRoutePlan =
      LoTrinhDuKien != null ? String(LoTrinhDuKien).trim() : current.LoTrinhDuKien;
    const nextNote =
      GhiChu != null ? String(GhiChu).trim() : current.GhiChu;
    const changedFields = {};

    if (hasDateTimeChanged(nextStartTime, current.ThoiGianBatDau)) {
      changedFields.ThoiGianBatDau = nextStartTime;
    }

    if (hasDateTimeChanged(nextEndTime, current.ThoiGianKetThuc)) {
      changedFields.ThoiGianKetThuc = nextEndTime;
    }

    if (hasTrimmedTextChanged(nextRoutePlan, current.LoTrinhDuKien)) {
      changedFields.LoTrinhDuKien = nextRoutePlan;
    }

    if (hasTrimmedTextChanged(nextNote, current.GhiChu)) {
      changedFields.GhiChu = nextNote;
    }

    if (hasTrimmedTextChanged(nextStatus, current.TrangThaiLoTrinh)) {
      changedFields.TrangThaiLoTrinh = nextStatus;
    }

    const isRunningRouteUpdate =
      current.TrangThaiLoTrinh === 'Đang thực hiện' || nextStatus === 'Đang thực hiện';

    await pool
      .request()
      .input('routeId', sql.Int, routeId)
      .input('ThoiGianBatDau', sql.DateTime, nextStartTime)
      .input('ThoiGianKetThuc', sql.DateTime, nextEndTime)
      .input('LoTrinhDuKien', sql.NVarChar(sql.MAX), nextRoutePlan)
      .input('GhiChu', sql.NVarChar(sql.MAX), nextNote)
      .input('TrangThaiLoTrinh', sql.NVarChar(50), nextStatus)
      .query(`
        UPDATE LoTrinhTrungChuyen
        SET ThoiGianBatDau = @ThoiGianBatDau,
            ThoiGianKetThuc = @ThoiGianKetThuc,
            LoTrinhDuKien = @LoTrinhDuKien,
            GhiChu = @GhiChu,
            TrangThaiLoTrinh = @TrangThaiLoTrinh
        WHERE MaLoTrinh = @routeId
      `);

    if (nextStatus === 'Đang thực hiện' && current.TrangThaiLoTrinh !== 'Đang thực hiện') {
      await pool
        .request()
        .input('routeId', sql.Int, routeId)
        .query(`
          UPDATE VeTrungChuyen
          SET TrangThaiVe = N'Đang trung chuyển'
          WHERE MaVe IN (SELECT MaVe FROM ChiTietLoTrinh WHERE MaLoTrinh = @routeId)
        `);
    } else if (nextStatus === 'Chưa thực hiện') {
      await pool
        .request()
        .input('routeId', sql.Int, routeId)
        .query(`
          UPDATE VeTrungChuyen
          SET TrangThaiVe = N'Đã có xe trung chuyển'
          WHERE MaVe IN (SELECT MaVe FROM ChiTietLoTrinh WHERE MaLoTrinh = @routeId)
            AND TrangThaiVe NOT IN (N'Hoàn tất trung chuyển', N'Hủy')
        `);
    } else if (nextStatus === 'Đã hủy' && current.TrangThaiLoTrinh !== 'Đã hủy') {
      await syncTicketsForCancelledRoute(pool, routeId);
    }

    await syncResources(pool, current, nextStatus);
    await syncRoutePlanProjection(pool, routeId, {
      eventType: 'ROUTE_UPDATED',
      message: isRunningRouteUpdate
        ? 'Điều phối viên cập nhật lộ trình đang thực hiện'
        : `Cập nhật lộ trình sang trạng thái ${nextStatus}`,
      payload: {
        TrangThaiLoTrinh: nextStatus,
        ThoiGianBatDau: nextStartTime,
        ThoiGianKetThuc: nextEndTime,
        LoTrinhDuKien: nextRoutePlan,
        GhiChu: nextNote,
        changedFields,
        notifyDriver: isRunningRouteUpdate,
        driverSync: isRunningRouteUpdate ? buildDriverSyncContract(routeId) : null
      },
      createdBy
    });

    const updatedRoute = await loadRouteSummary(pool, routeId);
    return sendSuccess(res, updatedRoute, 'Cập nhật lộ trình thành công');
  } catch (err) {
    console.error('Update route error:', err);
    return sendError(res, 500, 'Lỗi cập nhật lộ trình', 'SERVER_ERROR', { detail: err.message });
  }
});

module.exports = router;
