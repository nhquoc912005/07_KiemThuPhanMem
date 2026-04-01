const express = require('express');
const { getPool, sql } = require('../db');
const { DISPATCHER_ROLE, DRIVER_ROLE } = require('../utils/auth');

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

function toUniqueIntList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => Number(value)).filter(Number.isInteger))];
}

function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildRoutePlanText(tickets) {
  const pickupPoints = [...new Set(tickets.map((ticket) => String(ticket.DiaChiDon || '').trim()).filter(Boolean))];
  const dropPoints = [...new Set(tickets.map((ticket) => String(ticket.DiaChiTra || '').trim()).filter(Boolean))];
  return [...pickupPoints, ...dropPoints].join(' -> ');
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
        ct.DiemTra,
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

  return result.recordset;
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
    return res.status(403).json({ message: 'Bạn không có quyền truy cập danh sách lộ trình tổng hợp' });
  }

  try {
    const pool = await getPool();
    let rows = await loadRouteSummary(pool);

    if (status) {
      rows = rows.filter((row) => row.TrangThaiLoTrinh === status);
    }

    res.json(rows);
  } catch (err) {
    console.error('Get routes error:', err);
    res.status(500).json({ message: 'Lỗi lấy danh sách lộ trình', detail: err.message });
  }
});

// GET /routes/by-driver/:driverId - danh sách lộ trình theo tài xế
router.get('/by-driver/:driverId', async (req, res) => {
  const driverId = Number(req.params.driverId);
  const { status } = req.query;

  if (!Number.isInteger(driverId)) {
    return res.status(400).json({ message: 'Mã tài xế không hợp lệ' });
  }

  if (!canAccessDriverResource(req, driverId)) {
    return res.status(403).json({ message: 'Bạn không có quyền xem chuyến của tài xế này' });
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
    res.json(result.recordset);
  } catch (err) {
    console.error('Get routes by driver error:', err);
    res.status(500).json({ message: 'Lỗi lấy danh sách chuyến cho tài xế', detail: err.message });
  }
});

// GET /routes/:id - chi tiết lộ trình + danh sách điểm đón
router.get('/:id', async (req, res) => {
  const routeId = Number(req.params.id);

  if (!Number.isInteger(routeId)) {
    return res.status(400).json({ message: 'Mã lộ trình không hợp lệ' });
  }

  try {
    const pool = await getPool();
    const route = await loadRouteSummary(pool, routeId);

    if (!route) {
      return res.status(404).json({ message: 'Không tìm thấy lộ trình' });
    }

    if (!canAccessRoute(req, route)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem lộ trình này' });
    }

    const stops = await loadRouteStops(pool, routeId);

    res.json({
      route,
      stops
    });
  } catch (err) {
    console.error('Get route detail error:', err);
    res.status(500).json({ message: 'Lỗi lấy thông tin lộ trình', detail: err.message });
  }
});

// POST /routes/:id/incident - báo cáo sự cố chuyến
router.post('/:id/incident', async (req, res) => {
  const routeId = Number(req.params.id);
  const { description, location } = req.body || {};

  if (!Number.isInteger(routeId)) {
    return res.status(400).json({ message: 'Mã lộ trình không hợp lệ' });
  }

  if (!description || String(description).trim().length < 3) {
    return res.status(400).json({ message: 'Vui lòng nhập nội dung sự cố.' });
  }

  try {
    const pool = await getPool();
    const route = await loadRouteSummary(pool, routeId);

    if (!route) {
      return res.status(404).json({ message: 'Không tìm thấy lộ trình' });
    }

    if (!canAccessRoute(req, route)) {
      return res.status(403).json({ message: 'Bạn không có quyền báo cáo sự cố cho lộ trình này' });
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

    return res.json({
      message: 'Đã ghi nhận sự cố.',
      route: updatedRoute
    });
  } catch (err) {
    console.error('Report incident error:', err);
    return res.status(500).json({ message: 'Lỗi báo cáo sự cố', detail: err.message });
  }
});

// PATCH /routes/:routeId/stops/:stopId/status - cập nhật trạng thái đón/trả khách
router.patch('/:routeId/stops/:stopId/status', async (req, res) => {
  const routeId = Number(req.params.routeId);
  const stopId = Number(req.params.stopId);
  const { status } = req.body || {};

  if (!Number.isInteger(routeId) || !Number.isInteger(stopId)) {
    return res.status(400).json({ message: 'Mã lộ trình hoặc mã điểm đón không hợp lệ' });
  }

  if (!ALLOWED_STOP_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `Trạng thái khách không hợp lệ. Cho phép: ${ALLOWED_STOP_STATUSES.join(' / ')}`
    });
  }

  try {
    const pool = await getPool();
    const route = await loadRouteSummary(pool, routeId);

    if (!route) {
      return res.status(404).json({ message: 'Không tìm thấy lộ trình' });
    }

    if (!canAccessRoute(req, route)) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật khách cho lộ trình này' });
    }

    if (!['Đang thực hiện', 'Đang gặp sự cố'].includes(route.TrangThaiLoTrinh)) {
      return res.status(422).json({
        message:
          'Chỉ được cập nhật trạng thái khách khi chuyến đang ở trạng thái "Đang thực hiện" hoặc "Đang gặp sự cố".'
      });
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
      return res.status(404).json({ message: 'Không tìm thấy điểm đón/trả' });
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

    return res.json({
      message: allDone ? 'Đã cập nhật trạng thái khách. Chuyến đã hoàn thành.' : 'Đã cập nhật trạng thái khách.',
      stop: { ...stop, TrangThaiKhach: status },
      routeAutoCompleted: allDone
    });
  } catch (err) {
    console.error('Update stop status error:', err);
    return res.status(500).json({ message: 'Lỗi cập nhật trạng thái khách', detail: err.message });
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

  if (!isDispatcherRequest(req)) {
    return res.status(403).json({ message: 'Chỉ điều phối viên mới được tạo lộ trình' });
  }

  if (!Number.isInteger(Number(MaXe)) || !Number.isInteger(Number(MaTaiXe)) || !Number.isInteger(dispatcherId) || !routeStart || selectedTicketIds.length === 0) {
    return res.status(400).json({ message: 'Thiếu thông tin bắt buộc để lập lộ trình' });
  }

  if (routeEnd && routeEnd < routeStart) {
    return res.status(400).json({ message: 'Thời gian kết thúc phải lớn hơn hoặc bằng thời gian bắt đầu' });
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
            k.DiaChiTra
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

        await new sql.Request(transaction)
          .input('ThuTuDonTra', sql.Int, index + 1)
          .input('DiemDon', sql.NVarChar(255), ticket.DiaChiDon)
          .input('DiemTra', sql.NVarChar(255), ticket.DiaChiTra)
          .input('ThoiGianDonDuKien', sql.DateTime, expectedPickupTime)
          .input('TrangThaiKhach', sql.NVarChar(50), null)
          .input('MaLoTrinh', sql.Int, routeId)
          .input('MaVe', sql.Int, ticket.MaVe)
          .query(`
            INSERT INTO ChiTietLoTrinh
              (ThuTuDonTra, DiemDon, DiemTra, ThoiGianDonDuKien, TrangThaiKhach, MaLoTrinh, MaVe)
            VALUES (@ThuTuDonTra, @DiemDon, @DiemTra, @ThoiGianDonDuKien, @TrangThaiKhach, @MaLoTrinh, @MaVe)
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

      await transaction.commit();

      const route = await loadRouteSummary(pool, routeId);
      const stops = await loadRouteStops(pool, routeId);

      res.status(201).json({
        message: 'Tạo lộ trình thành công',
        route,
        stops,
        ticketIds: selectedTicketIds
      });
    } catch (innerError) {
      await transaction.rollback();
      throw innerError;
    }
  } catch (err) {
    console.error('Create route error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Lỗi tạo lộ trình', detail: err.detail || err.message });
  }
});

// PUT /routes/:id - cập nhật thông tin lộ trình
router.put('/:id', async (req, res) => {
  const routeId = Number(req.params.id);
  const { ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, TrangThaiLoTrinh, GhiChu } = req.body || {};

  if (!Number.isInteger(routeId)) {
    return res.status(400).json({ message: 'Mã lộ trình không hợp lệ' });
  }

  const startTime = ThoiGianBatDau != null ? parseDateTime(ThoiGianBatDau) : undefined;
  const endTime = ThoiGianKetThuc != null ? parseDateTime(ThoiGianKetThuc) : undefined;

  if (ThoiGianBatDau != null && !startTime) {
    return res.status(400).json({ message: 'Thời gian bắt đầu không hợp lệ' });
  }

  if (ThoiGianKetThuc != null && !endTime) {
    return res.status(400).json({ message: 'Thời gian kết thúc không hợp lệ' });
  }

  if (startTime && endTime && endTime < startTime) {
    return res.status(400).json({ message: 'Thời gian kết thúc phải lớn hơn hoặc bằng thời gian bắt đầu' });
  }

  try {
    const pool = await getPool();
    const current = await loadRouteSummary(pool, routeId);

    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy lộ trình' });
    }

    if (!canAccessRoute(req, current)) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật lộ trình này' });
    }

    if (TrangThaiLoTrinh === 'Hoàn thành') {
      const stops = await loadRouteStops(pool, routeId);
      const allDone = stops.length > 0 && stops.every((row) => DONE_STOP_STATUSES.has(String(row.TrangThaiKhach || '').trim()));
      if (!allDone) {
        return res.status(422).json({
          message: 'Chỉ được chuyển sang "Hoàn thành" khi toàn bộ khách hàng đã được xử lý.'
        });
      }
    }

    if (isDriverRequest(req)) {
      const hasRestrictedFields =
        ThoiGianBatDau !== undefined ||
        ThoiGianKetThuc !== undefined ||
        LoTrinhDuKien !== undefined;

      if (hasRestrictedFields) {
        return res.status(403).json({
          message: 'Tài xế chỉ được cập nhật trạng thái chuyến hoặc ghi chú liên quan đến chuyến của mình'
        });
      }

      const driverAllowedStatuses = ['Đang thực hiện', 'Hoàn thành', 'Đã hủy'];
      if (TrangThaiLoTrinh && !driverAllowedStatuses.includes(TrangThaiLoTrinh)) {
        return res.status(403).json({
          message: 'Tài xế không được cập nhật trạng thái này'
        });
      }

      if (!TrangThaiLoTrinh && GhiChu !== undefined) {
        return res.status(403).json({
          message: 'Tài xế không được chỉnh sửa ghi chú nếu không có thay đổi trạng thái'
        });
      }
    }

    const nextStatus = TrangThaiLoTrinh || current.TrangThaiLoTrinh;
    const nextStartTime = startTime || current.ThoiGianBatDau;
    const nextEndTime =
      endTime !== undefined
        ? endTime
        : FINAL_ROUTE_STATUSES.includes(nextStatus)
          ? current.ThoiGianKetThuc || new Date()
          : current.ThoiGianKetThuc;

    await pool
      .request()
      .input('routeId', sql.Int, routeId)
      .input('ThoiGianBatDau', sql.DateTime, nextStartTime)
      .input('ThoiGianKetThuc', sql.DateTime, nextEndTime)
      .input(
        'LoTrinhDuKien',
        sql.NVarChar(sql.MAX),
        LoTrinhDuKien != null ? String(LoTrinhDuKien).trim() : current.LoTrinhDuKien
      )
      .input('GhiChu', sql.NVarChar(sql.MAX), GhiChu != null ? String(GhiChu).trim() : current.GhiChu)
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

    const updatedRoute = await loadRouteSummary(pool, routeId);
    return res.json(updatedRoute);
  } catch (err) {
    console.error('Update route error:', err);
    res.status(500).json({ message: 'Lỗi cập nhật lộ trình', detail: err.message });
  }
});

module.exports = router;
