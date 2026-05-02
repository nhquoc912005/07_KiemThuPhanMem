const express = require('express');

const { query, withTransaction } = require('../db');
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

async function syncLegacyResources(client, { MaXe, MaTaiXe }, routeStatus) {
  let vehicleStatus = 'Rảnh';
  let driverStatus = 'Rảnh';

  if (routeStatus === 'Chưa thực hiện') {
    vehicleStatus = 'Đã phân công';
    driverStatus = 'Đã phân công';
  } else if (routeStatus === 'Đang thực hiện' || routeStatus === 'Đang gặp sự cố') {
    vehicleStatus = 'Đang chạy';
    driverStatus = 'Đang thực hiện';
  }

  await query('UPDATE XeTrungChuyen SET TrangThaiXe = $1 WHERE MaXe = $2', [vehicleStatus, MaXe], client);
  await query('UPDATE TaiXe SET TrangThaiTaiXe = $1 WHERE MaTaiXe = $2', [driverStatus, MaTaiXe], client);

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

  await query(
    `
      UPDATE external_vehicles
      SET availability_status = $1,
          updated_at = NOW()
      WHERE legacy_ma_xe = $2
    `,
    [externalVehicleStatus, MaXe],
    client
  );

  await query(
    `
      UPDATE external_drivers
      SET availability_status = $1,
          updated_at = NOW()
      WHERE legacy_ma_tai_xe = $2
    `,
    [externalDriverStatus, MaTaiXe],
    client
  );
}

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
    const payload = await withTransaction(async (client) => {
      const ticketsResult = await query(
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
          WHERE v.MaVe = ANY($1::int[])
          ORDER BY k.DiaChiDon, k.DiaChiTra, v.MaVe
        `,
        [selectedTicketIds],
        client
      );

      const selectedTickets = ticketsResult.rows;

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

      const vehicleLegacyResult = await query('SELECT * FROM XeTrungChuyen WHERE MaXe = $1 LIMIT 1', [Number(MaXe)], client);

      if (vehicleLegacyResult.rows.length === 0) {
        throw Object.assign(new Error('Xe không tồn tại'), { status: 400 });
      }

      const legacyVehicle = vehicleLegacyResult.rows[0];

      const externalVehicleResult = await query(
        `
          SELECT *
          FROM external_vehicles
          WHERE legacy_ma_xe = $1
          LIMIT 1
        `,
        [Number(MaXe)],
        client
      );

      if (externalVehicleResult.rows.length === 0) {
        throw Object.assign(new Error('Xe chưa có dữ liệu external (vui lòng chạy seed Option 1)'), { status: 422 });
      }

      const externalVehicle = externalVehicleResult.rows[0];

      if (externalVehicle.operational_status === 'INACTIVE' || externalVehicle.is_active === false) {
        throw Object.assign(new Error('Xe đang ngừng hoạt động'), { status: 409 });
      }

      if (totalSeats > Number(legacyVehicle.SoCho)) {
        throw Object.assign(new Error('Hành khách vượt quá sức chứa xe'), { status: 422 });
      }

      const vehicleConflict = await query(
        `
          SELECT MaLoTrinh
          FROM LoTrinhTrungChuyen
          WHERE MaXe = $1
            AND TrangThaiLoTrinh IN ('Chưa thực hiện', 'Đang thực hiện', 'Đang gặp sự cố')
          LIMIT 1
        `,
        [Number(MaXe)],
        client
      );

      if (vehicleConflict.rows.length > 0) {
        throw Object.assign(new Error('Xe đang được phân công cho lộ trình khác'), { status: 409 });
      }

      const driverLegacyResult = await query('SELECT * FROM TaiXe WHERE MaTaiXe = $1 LIMIT 1', [Number(MaTaiXe)], client);

      if (driverLegacyResult.rows.length === 0) {
        throw Object.assign(new Error('Tài xế không tồn tại'), { status: 400 });
      }

      const legacyDriver = driverLegacyResult.rows[0];

      const externalDriverResult = await query(
        `
          SELECT *
          FROM external_drivers
          WHERE legacy_ma_tai_xe = $1
          LIMIT 1
        `,
        [Number(MaTaiXe)],
        client
      );

      if (externalDriverResult.rows.length === 0) {
        throw Object.assign(new Error('Tài xế chưa có dữ liệu external (vui lòng chạy seed Option 1)'), {
          status: 422
        });
      }

      const externalDriver = externalDriverResult.rows[0];
      if (externalDriver.work_status === 'INACTIVE' || externalDriver.is_active === false) {
        throw Object.assign(new Error('Tài xế đang ngừng hoạt động'), { status: 409 });
      }

      const driverConflict = await query(
        `
          SELECT MaLoTrinh
          FROM LoTrinhTrungChuyen
          WHERE MaTaiXe = $1
            AND TrangThaiLoTrinh IN ('Chưa thực hiện', 'Đang thực hiện', 'Đang gặp sự cố')
          LIMIT 1
        `,
        [Number(MaTaiXe)],
        client
      );

      if (driverConflict.rows.length > 0) {
        throw Object.assign(new Error('Tài xế đang được phân công cho lộ trình khác'), { status: 409 });
      }

      const dispatcherResult = await query('SELECT 1 FROM NhanVienDieuPhoi WHERE MaNhanVien = $1 LIMIT 1', [dispatcherId], client);

      if (dispatcherResult.rows.length === 0) {
        throw Object.assign(new Error('Nhân viên điều phối không tồn tại'), { status: 400 });
      }

      const planCode = generatePlanCode();
      const planInsert = await query(
        `
          INSERT INTO route_plans (plan_code, planned_start_at, planned_end_at, status, notes, created_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `,
        [planCode, routeStart, routeEnd, 'CONFIRMED', GhiChu ? String(GhiChu).trim() : null, createdBy],
        client
      );

      const routePlanId = planInsert.rows[0].id;

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
          externalVehicle.id,
          'CONFIRMED',
          externalVehicle.vehicle_code,
          externalVehicle.plate_number,
          externalVehicle.vehicle_type,
          externalVehicle.capacity,
          externalVehicle.seat_count
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
          externalDriver.id,
          vehicleAssignmentId,
          'CONFIRMED',
          externalDriver.driver_code,
          externalDriver.full_name,
          externalDriver.phone,
          externalDriver.national_id,
          externalDriver.license_no,
          externalDriver.license_class
        ],
        client
      );

      for (const [index, ticket] of selectedTickets.entries()) {
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
            ticket.ExternalCustomerId,
            index + 1,
            ticket.ExternalCustomerCode || null,
            ticket.ExternalCustomerName || ticket.TenKhachHang,
            ticket.ExternalCustomerPhone || ticket.SoDienThoai,
            ticket.ExternalPickup || ticket.DiaChiDon,
            ticket.ExternalDropoff || ticket.DiaChiTra,
            ticketNote(ticket)
          ],
          client
        );
      }

      const routePlanText = String(LoTrinhDuKien || '').trim() || buildRoutePlanText(selectedTickets);
      const routeInsert = await query(
        `
          INSERT INTO LoTrinhTrungChuyen
            (ThoiGianBatDau, ThoiGianKetThuc, LoTrinhDuKien, GhiChu, TrangThaiLoTrinh, MaXe, MaTaiXe, MaNhanVien)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING MaLoTrinh
        `,
        [
          routeStart,
          routeEnd,
          routePlanText || null,
          GhiChu ? String(GhiChu).trim() : null,
          'Chưa thực hiện',
          Number(MaXe),
          Number(MaTaiXe),
          dispatcherId
        ],
        client
      );

      const routeId = routeInsert.rows[0].MaLoTrinh;

      for (const [index, ticket] of selectedTickets.entries()) {
        const expectedPickupTime = new Date(routeStart.getTime() + index * 10 * 60 * 1000);
        const pickupCoordinates = resolveCoordinates(ticket.DiaChiDon, ticket.DiaChiDonLat, ticket.DiaChiDonLng);
        const dropoffCoordinates = resolveCoordinates(ticket.DiaChiTra, ticket.DiaChiTraLat, ticket.DiaChiTraLng);

        await query(
          `
            INSERT INTO ChiTietLoTrinh
              (ThuTuDonTra, DiemDon, DiemDonLat, DiemDonLng, DiemTra, DiemTraLat, DiemTraLng, ThoiGianDonDuKien, TrangThaiKhach, MaLoTrinh, MaVe)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            index + 1,
            ticket.DiaChiDon,
            pickupCoordinates?.lat ?? null,
            pickupCoordinates?.lng ?? null,
            ticket.DiaChiTra,
            dropoffCoordinates?.lat ?? null,
            dropoffCoordinates?.lng ?? null,
            expectedPickupTime,
            null,
            routeId,
            ticket.MaVe
          ],
          client
        );

        await query(
          `
            UPDATE VeTrungChuyen
            SET TrangThaiVe = $1
            WHERE MaVe = $2
          `,
          ['Đã có xe trung chuyển', ticket.MaVe],
          client
        );
      }

      await query(
        `
          UPDATE route_plans
          SET updated_at = NOW(),
              notes = $1
          WHERE id = $2
        `,
        [buildRoutePlanNotes(GhiChu, routeId), routePlanId],
        client
      );

      await syncLegacyResources(client, { MaXe: Number(MaXe), MaTaiXe: Number(MaTaiXe) }, 'Chưa thực hiện');
      await syncRoutePlanProjection(client, routeId, {
        eventType: 'ROUTE_CREATED',
        message: 'Tạo kế hoạch điều phối',
        payload: { source: 'route-plans' },
        createdBy
      });

      return {
        route: {
          MaLoTrinh: routeId,
          BienSo: legacyVehicle.BienSo,
          TenTaiXe: legacyDriver.HoTen
        },
        routePlan: { id: routePlanId, planCode }
      };
    });

    return sendSuccess(res, payload, 'Tạo lộ trình thành công', 201);
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
