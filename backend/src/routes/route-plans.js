const express = require('express');

const { getPool, sql } = require('../db');
const { syncRoutePlanProjection, buildRoutePlanNotes } = require('../services/routePlanSyncService');
const { DISPATCHER_ROLE } = require('../utils/auth');
const { sendError, sendSuccess } = require('../utils/http');
const { lookupAddressCoordinates } = require('../utils/locationCoordinates');

const router = express.Router();

function isDispatcherRequest(req) {
  return req.auth?.VaiTro === DISPATCHER_ROLE;
}

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

function generatePlanCode() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`;
  const rand = Math.floor(100 + Math.random() * 900);
  return `RP${stamp}${rand}`;
}

function ticketNote(ticket) {
  const slot = ticket.KhungGioTrungChuyen ? String(ticket.KhungGioTrungChuyen).trim() : '';
  return `MaVe=${ticket.MaVe}; SoLuongGhe=${ticket.SoLuongGhe}; KhungGio=${slot}`;
}

async function syncLegacyResources(db, { MaXe, MaTaiXe }, routeStatus) {
  let vehicleStatus = 'Rảnh';
  let driverStatus = 'Rảnh';

  if (routeStatus === 'Chưa thực hiện') {
    vehicleStatus = 'Đã phân công';
    driverStatus = 'Đã phân công';
  } else if (routeStatus === 'Đang thực hiện' || routeStatus === 'Đang gặp sự cố') {
    vehicleStatus = 'Đang chạy';
    driverStatus = 'Đang thực hiện';
  }

  await db
    .request()
    .input('MaXe', sql.Int, MaXe)
    .input('TrangThaiXe', sql.NVarChar(30), vehicleStatus)
    .query('UPDATE XeTrungChuyen SET TrangThaiXe = @TrangThaiXe WHERE MaXe = @MaXe');

  await db
    .request()
    .input('MaTaiXe', sql.Int, MaTaiXe)
    .input('TrangThaiTaiXe', sql.NVarChar(30), driverStatus)
    .query('UPDATE TaiXe SET TrangThaiTaiXe = @TrangThaiTaiXe WHERE MaTaiXe = @MaTaiXe');

  // Sync external status for selection screens
  const externalVehicleStatus =
    vehicleStatus === 'Rảnh'
      ? 'AVAILABLE'
      : vehicleStatus === 'Đã phân công'
        ? 'ASSIGNED'
        : vehicleStatus === 'Đang chạy'
          ? 'ON_TRIP'
          : vehicleStatus === 'Bảo trì'
            ? 'MAINTENANCE'
            : 'AVAILABLE';

  const externalDriverStatus =
    driverStatus === 'Rảnh'
      ? 'AVAILABLE'
      : driverStatus === 'Đã phân công'
        ? 'ASSIGNED'
        : driverStatus === 'Đang thực hiện'
          ? 'BUSY'
          : driverStatus === 'Không sẵn sàng'
            ? 'OFF'
            : 'AVAILABLE';

  await db
    .request()
    .input('MaXe', sql.Int, MaXe)
    .input('availability', sql.NVarChar(20), externalVehicleStatus)
    .query(
      `
        UPDATE external_vehicles
        SET availability_status = @availability,
            updated_at = GETDATE()
        WHERE legacy_ma_xe = @MaXe
      `
    );

  await db
    .request()
    .input('MaTaiXe', sql.Int, MaTaiXe)
    .input('availability', sql.NVarChar(20), externalDriverStatus)
    .query(
      `
        UPDATE external_drivers
        SET availability_status = @availability,
            updated_at = GETDATE()
        WHERE legacy_ma_tai_xe = @MaTaiXe
      `
    );
}

// POST /route-plans - tạo kế hoạch điều phối (mới) + vẫn tạo lộ trình legacy để demo luồng hiện tại
router.post('/', async (req, res) => {
  const { MaXe, MaTaiXe, ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, GhiChu, ticketIds } = req.body || {};

  const routeStart = parseDateTime(ThoiGianBatDau);
  const routeEnd = parseDateTime(ThoiGianKetThuc);
  const selectedTicketIds = toUniqueIntList(ticketIds);
  const dispatcherId = Number(req.auth?.MaNhanVien);
  const createdBy = String(req.auth?.TenDangNhap || req.auth?.HoTen || '').trim() || null;

  if (!isDispatcherRequest(req)) {
    return sendError(res, 403, 'Chỉ điều phối viên mới được tạo lộ trình', 'FORBIDDEN');
  }

  if (
    !Number.isInteger(Number(MaXe)) ||
    !Number.isInteger(Number(MaTaiXe)) ||
    !Number.isInteger(dispatcherId) ||
    !routeStart ||
    selectedTicketIds.length === 0
  ) {
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
      const ticketsResult = await new sql.Request(transaction)
        .input('ids', sql.VarChar(sql.MAX), selectedTicketIds.join(','))
        .query(
          `
          SELECT
            v.MaVe,
            v.KhungGioTrungChuyen,
            v.SoLuongGhe,
            v.TrangThaiVe,
            k.MaKhachHang,
            k.TenKhachHang,
            k.SoDienThoai,
            k.DiaChiDon,
            k.DiaChiTra,
            k.DiaChiDonLat,
            k.DiaChiDonLng,
            k.DiaChiTraLat,
            k.DiaChiTraLng,
            ec.id AS ExternalCustomerId,
            ec.customer_code AS ExternalCustomerCode,
            ec.full_name AS ExternalCustomerName,
            ec.phone AS ExternalCustomerPhone,
            ec.default_pickup_address AS ExternalPickup,
            ec.default_dropoff_address AS ExternalDropoff
          FROM VeTrungChuyen v
          JOIN KhachHang k ON k.MaKhachHang = v.MaKhachHang
          LEFT JOIN external_customers ec ON ec.legacy_ma_khach_hang = k.MaKhachHang
          WHERE v.MaVe IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@ids, ','))
          ORDER BY k.DiaChiDon, k.DiaChiTra, v.MaVe
        `
        );

      const selectedTickets = ticketsResult.recordset;

      if (selectedTickets.length !== selectedTicketIds.length) {
        throw Object.assign(new Error('Có vé không tồn tại hoặc đã bị loại khỏi hệ thống'), { status: 400 });
      }

      const invalidTicket = selectedTickets.find((ticket) => ticket.TrangThaiVe !== 'Cần trung chuyển');
      if (invalidTicket) {
        throw Object.assign(new Error(`Vé ${invalidTicket.MaVe} không còn ở trạng thái "Cần trung chuyển"`), {
          status: 409
        });
      }

      const missingExternalCustomer = selectedTickets.find((ticket) => !ticket.ExternalCustomerId);
      if (missingExternalCustomer) {
        throw Object.assign(
          new Error(
            `Thiếu dữ liệu external cho khách hàng MaKhachHang=${missingExternalCustomer.MaKhachHang}. Vui lòng chạy lại seed Option 1.`
          ),
          { status: 422 }
        );
      }

      const totalSeats = selectedTickets.reduce((sum, ticket) => sum + Number(ticket.SoLuongGhe || 0), 0);

      const vehicleLegacyResult = await new sql.Request(transaction)
        .input('MaXe', sql.Int, Number(MaXe))
        .query('SELECT TOP 1 * FROM XeTrungChuyen WHERE MaXe = @MaXe');

      if (vehicleLegacyResult.recordset.length === 0) {
        throw Object.assign(new Error('Xe không tồn tại'), { status: 400 });
      }

      const legacyVehicle = vehicleLegacyResult.recordset[0];

      const externalVehicleResult = await new sql.Request(transaction)
        .input('MaXe', sql.Int, Number(MaXe))
        .query(
          `
          SELECT TOP 1 *
          FROM external_vehicles
          WHERE legacy_ma_xe = @MaXe
        `
        );

      if (externalVehicleResult.recordset.length === 0) {
        throw Object.assign(new Error('Xe chưa có dữ liệu external (vui lòng chạy seed Option 1)'), { status: 422 });
      }

      const externalVehicle = externalVehicleResult.recordset[0];

      if (externalVehicle.operational_status === 'INACTIVE' || externalVehicle.is_active === false) {
        throw Object.assign(new Error('Xe đang ngừng hoạt động'), { status: 409 });
      }

      if (totalSeats > Number(legacyVehicle.SoCho)) {
        throw Object.assign(new Error('Hành khách vượt quá sức chứa xe'), { status: 422 });
      }

      const vehicleConflict = await new sql.Request(transaction)
        .input('MaXe', sql.Int, Number(MaXe))
        .query(
          `
          SELECT TOP 1 MaLoTrinh
          FROM LoTrinhTrungChuyen
          WHERE MaXe = @MaXe
            AND TrangThaiLoTrinh IN (N'Chưa thực hiện', N'Đang thực hiện', N'Đang gặp sự cố')
        `
        );

      if (vehicleConflict.recordset.length > 0) {
        throw Object.assign(new Error('Xe đang được phân công cho lộ trình khác'), { status: 409 });
      }

      const driverLegacyResult = await new sql.Request(transaction)
        .input('MaTaiXe', sql.Int, Number(MaTaiXe))
        .query('SELECT TOP 1 * FROM TaiXe WHERE MaTaiXe = @MaTaiXe');

      if (driverLegacyResult.recordset.length === 0) {
        throw Object.assign(new Error('Tài xế không tồn tại'), { status: 400 });
      }

      const legacyDriver = driverLegacyResult.recordset[0];

      const externalDriverResult = await new sql.Request(transaction)
        .input('MaTaiXe', sql.Int, Number(MaTaiXe))
        .query(
          `
          SELECT TOP 1 *
          FROM external_drivers
          WHERE legacy_ma_tai_xe = @MaTaiXe
        `
        );

      if (externalDriverResult.recordset.length === 0) {
        throw Object.assign(new Error('Tài xế chưa có dữ liệu external (vui lòng chạy seed Option 1)'), {
          status: 422
        });
      }

      const externalDriver = externalDriverResult.recordset[0];
      if (externalDriver.work_status === 'INACTIVE' || externalDriver.is_active === false) {
        throw Object.assign(new Error('Tài xế đang ngừng hoạt động'), { status: 409 });
      }

      const driverConflict = await new sql.Request(transaction)
        .input('MaTaiXe', sql.Int, Number(MaTaiXe))
        .query(
          `
          SELECT TOP 1 MaLoTrinh
          FROM LoTrinhTrungChuyen
          WHERE MaTaiXe = @MaTaiXe
            AND TrangThaiLoTrinh IN (N'Chưa thực hiện', N'Đang thực hiện', N'Đang gặp sự cố')
        `
        );

      if (driverConflict.recordset.length > 0) {
        throw Object.assign(new Error('Tài xế đang được phân công cho lộ trình khác'), { status: 409 });
      }

      const dispatcherResult = await new sql.Request(transaction)
        .input('MaNhanVien', sql.Int, dispatcherId)
        .query('SELECT TOP 1 1 FROM NhanVienDieuPhoi WHERE MaNhanVien = @MaNhanVien');

      if (dispatcherResult.recordset.length === 0) {
        throw Object.assign(new Error('Nhân viên điều phối không tồn tại'), { status: 400 });
      }

      // 1) Insert route plan (new schema)
      const planCode = generatePlanCode();
      const planInsert = await new sql.Request(transaction)
        .input('planCode', sql.NVarChar(30), planCode)
        .input('plannedStart', sql.DateTime, routeStart)
        .input('plannedEnd', sql.DateTime, routeEnd)
        .input('status', sql.NVarChar(20), 'CONFIRMED')
        .input('notes', sql.NVarChar(500), GhiChu ? String(GhiChu).trim() : null)
        .input('createdBy', sql.NVarChar(50), createdBy)
        .query(
          `
          INSERT INTO route_plans (plan_code, planned_start_at, planned_end_at, status, notes, created_by)
          OUTPUT INSERTED.id
          VALUES (@planCode, @plannedStart, @plannedEnd, @status, @notes, @createdBy)
        `
        );

      const routePlanId = planInsert.recordset[0].id;

      // 2) Insert vehicle assignment + snapshot
      const vehicleAssignmentInsert = await new sql.Request(transaction)
        .input('routePlanId', sql.BigInt, routePlanId)
        .input('externalVehicleId', sql.Int, externalVehicle.id)
        .input('assignmentStatus', sql.NVarChar(20), 'CONFIRMED')
        .input('vehicleCode', sql.NVarChar(20), externalVehicle.vehicle_code)
        .input('plate', sql.VarChar(20), externalVehicle.plate_number)
        .input('vehicleType', sql.NVarChar(50), externalVehicle.vehicle_type)
        .input('capacity', sql.Int, externalVehicle.capacity)
        .input('seatCount', sql.Int, externalVehicle.seat_count)
        .query(
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
          OUTPUT INSERTED.id
          VALUES (@routePlanId, @externalVehicleId, @assignmentStatus, @vehicleCode, @plate, @vehicleType, @capacity, @seatCount)
        `
        );

      const vehicleAssignmentId = vehicleAssignmentInsert.recordset[0].id;

      // 3) Insert driver assignment + snapshot
      await new sql.Request(transaction)
        .input('routePlanId', sql.BigInt, routePlanId)
        .input('externalDriverId', sql.Int, externalDriver.id)
        .input('vehicleAssignmentId', sql.BigInt, vehicleAssignmentId)
        .input('assignmentStatus', sql.NVarChar(20), 'CONFIRMED')
        .input('driverCode', sql.NVarChar(20), externalDriver.driver_code)
        .input('driverName', sql.NVarChar(100), externalDriver.full_name)
        .input('driverPhone', sql.VarChar(15), externalDriver.phone)
        .input('driverNationalId', sql.VarChar(20), externalDriver.national_id)
        .input('driverLicenseNo', sql.VarChar(30), externalDriver.license_no)
        .input('driverLicenseClass', sql.NVarChar(50), externalDriver.license_class)
        .query(
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
        `
        );

      // 4) Insert selected customers + snapshots (1 row per ticket)
      for (const [index, ticket] of selectedTickets.entries()) {
        await new sql.Request(transaction)
          .input('routePlanId', sql.BigInt, routePlanId)
          .input('externalCustomerId', sql.Int, ticket.ExternalCustomerId)
          .input('sequenceNo', sql.Int, index + 1)
          .input('customerCode', sql.NVarChar(20), ticket.ExternalCustomerCode || null)
          .input('customerName', sql.NVarChar(100), ticket.ExternalCustomerName || ticket.TenKhachHang)
          .input('customerPhone', sql.VarChar(15), ticket.ExternalCustomerPhone || ticket.SoDienThoai)
          .input('pickup', sql.NVarChar(255), ticket.ExternalPickup || ticket.DiaChiDon)
          .input('dropoff', sql.NVarChar(255), ticket.ExternalDropoff || ticket.DiaChiTra)
          .input('note', sql.NVarChar(255), ticketNote(ticket))
          .query(
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
          `
          );
      }

      // 5) Create legacy route for current app screens
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
        .query(
          `
          INSERT INTO LoTrinhTrungChuyen
            (ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, GhiChu, TrangThaiLoTrinh, MaXe, MaTaiXe, MaNhanVien)
          OUTPUT INSERTED.MaLoTrinh
          VALUES (@ThoiGianBatDau, @ThoiGianKetThuc, @LoTrinhDuKien, @GhiChu, @TrangThaiLoTrinh, @MaXe, @MaTaiXe, @MaNhanVien)
        `
        );

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
          .query(
            `
            INSERT INTO ChiTietLoTrinh
              (ThuTuDonTra, DiemDon, DiemDonLat, DiemDonLng, DiemTra, DiemTraLat, DiemTraLng, ThoiGianDonDuKien, TrangThaiKhach, MaLoTrinh, MaVe)
            VALUES (@ThuTuDonTra, @DiemDon, @DiemDonLat, @DiemDonLng, @DiemTra, @DiemTraLat, @DiemTraLng, @ThoiGianDonDuKien, @TrangThaiKhach, @MaLoTrinh, @MaVe)
          `
          );

        await new sql.Request(transaction)
          .input('MaVe', sql.Int, ticket.MaVe)
          .input('TrangThaiVe', sql.NVarChar(50), 'Đã có xe trung chuyển')
          .query(
            `
            UPDATE VeTrungChuyen
            SET TrangThaiVe = @TrangThaiVe
            WHERE MaVe = @MaVe
          `
          );
      }

      // link plan -> legacy route
      await new sql.Request(transaction)
        .input('routePlanId', sql.BigInt, routePlanId)
        .input('notes', sql.NVarChar(500), buildRoutePlanNotes(GhiChu, routeId))
        .query(
          `
          UPDATE route_plans
          SET updated_at = GETDATE(),
              notes = @notes
          WHERE id = @routePlanId
        `
        );

      await syncLegacyResources(transaction, { MaXe: Number(MaXe), MaTaiXe: Number(MaTaiXe) }, 'Chưa thực hiện');
      await syncRoutePlanProjection(transaction, routeId, {
        eventType: 'ROUTE_CREATED',
        message: 'Tạo kế hoạch điều phối',
        payload: { source: 'route-plans' },
        createdBy
      });

      await transaction.commit();

      return sendSuccess(
        res,
        {
          route: {
            MaLoTrinh: routeId,
            BienSo: legacyVehicle.BienSo,
            TenTaiXe: legacyDriver.HoTen
          },
          routePlan: { id: routePlanId, planCode }
        },
        'Tạo lộ trình thành công',
        201
      );
    } catch (innerError) {
      await transaction.rollback();
      throw innerError;
    }
  } catch (err) {
    console.error('Create route plan error:', err);
    return sendError(
      res,
      err.status || 500,
      err.message || 'Lỗi tạo lộ trình',
      err.code || 'SERVER_ERROR',
      err.detail ? { detail: err.detail } : null
    );
  }
});

module.exports = router;
