const express = require('express');

const { query, withTransaction } = require('../db');
const { CUSTOMER_STATUSES } = require('../constants/status');
const { sendError, sendSuccess } = require('../utils/http');
const {
  isValidPhoneNumber,
  normalizeVietnamPhoneNumber,
  toPositiveInteger
} = require('../utils/validation');

const router = express.Router();

const CUSTOMER_SELECT_COLUMNS = `
  legacy_ma_khach_hang AS MaKhachHang,
  full_name AS TenKhachHang,
  phone AS SoDienThoai,
  default_pickup_address AS DiaChiDon,
  default_dropoff_address AS DiaChiTra,
  CASE
    WHEN status = 'ACTIVE' AND is_active = TRUE THEN '${CUSTOMER_STATUSES.ACTIVE}'
    ELSE '${CUSTOMER_STATUSES.INACTIVE}'
  END AS TrangThai
`;

const ALLOWED_CUSTOMER_STATUSES = new Set(Object.values(CUSTOMER_STATUSES));
const REQUIRED_FIELD_MESSAGE = 'Thông tin bắt buộc không được để trống';
const INVALID_PHONE_MESSAGE = 'Số điện thoại không hợp lệ';
const DUPLICATE_PHONE_MESSAGE = 'Số điện thoại đã tồn tại';
const DELETE_BLOCKED_MESSAGE = 'Không thể xóa khách hàng';

function buildCustomerCode(legacyId) {
  return `KH${String(legacyId).padStart(8, '0')}`;
}

function toExternalStatus(customerStatus) {
  return customerStatus === CUSTOMER_STATUSES.INACTIVE ? 'INACTIVE' : 'ACTIVE';
}

function toExternalIsActive(customerStatus) {
  return customerStatus !== CUSTOMER_STATUSES.INACTIVE;
}

function getCustomerPayload(body = {}) {
  return {
    TenKhachHang: String(body.TenKhachHang || '').trim(),
    SoDienThoai: normalizeVietnamPhoneNumber(body.SoDienThoai),
    DiaChiDon: String(body.DiaChiDon || '').trim(),
    DiaChiTra: String(body.DiaChiTra || '').trim(),
    TrangThai: body.TrangThai ? String(body.TrangThai).trim() : CUSTOMER_STATUSES.ACTIVE
  };
}

function buildCustomerFieldErrors(customer) {
  const fieldErrors = {};

  if (!customer.TenKhachHang) {
    fieldErrors.TenKhachHang = REQUIRED_FIELD_MESSAGE;
  }

  if (!customer.SoDienThoai) {
    fieldErrors.SoDienThoai = REQUIRED_FIELD_MESSAGE;
  } else if (!isValidPhoneNumber(customer.SoDienThoai)) {
    fieldErrors.SoDienThoai = INVALID_PHONE_MESSAGE;
  }

  if (!customer.DiaChiDon) {
    fieldErrors.DiaChiDon = REQUIRED_FIELD_MESSAGE;
  }

  if (!customer.DiaChiTra) {
    fieldErrors.DiaChiTra = REQUIRED_FIELD_MESSAGE;
  }

  return fieldErrors;
}

function getFirstFieldErrorMessage(fieldErrors) {
  return (
    fieldErrors.TenKhachHang ||
    fieldErrors.SoDienThoai ||
    fieldErrors.DiaChiDon ||
    fieldErrors.DiaChiTra ||
    'Dữ liệu khách hàng không hợp lệ'
  );
}

function validateCustomerPayload(customer) {
  const fieldErrors = buildCustomerFieldErrors(customer);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      message: getFirstFieldErrorMessage(fieldErrors),
      fieldErrors
    };
  }

  if (!ALLOWED_CUSTOMER_STATUSES.has(customer.TrangThai)) {
    return {
      message: 'Trạng thái khách hàng không hợp lệ',
      fieldErrors: {
        TrangThai: 'Trạng thái khách hàng không hợp lệ'
      }
    };
  }

  return null;
}

function sendCustomerValidationError(res, status, message, fieldErrors, errorCode = 'VALIDATION_ERROR') {
  return sendError(res, status, message, errorCode, { fieldErrors });
}

async function loadCustomerByLegacyId(id, client = null) {
  const result = await query(
    `
      SELECT ${CUSTOMER_SELECT_COLUMNS}
      FROM external_customers
      WHERE legacy_ma_khach_hang = $1
    `,
    [id],
    client
  );

  return result.rows[0] || null;
}

router.get('/', async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const includeInactive = String(req.query.includeInactive || '').trim() === '1';

  try {
    const params = [];
    let sqlText = `
      SELECT ${CUSTOMER_SELECT_COLUMNS}
      FROM external_customers
      WHERE 1 = 1
    `;

    if (!includeInactive) {
      sqlText += ` AND status = 'ACTIVE' AND is_active = TRUE`;
    }

    if (keyword) {
      params.push(`%${keyword}%`);
      sqlText += `
        AND (
          full_name ILIKE $${params.length} OR
          phone ILIKE $${params.length} OR
          default_pickup_address ILIKE $${params.length} OR
          default_dropoff_address ILIKE $${params.length}
        )
      `;
    }

    sqlText += ' ORDER BY legacy_ma_khach_hang DESC';

    const result = await query(sqlText, params);
    return sendSuccess(res, result.rows, 'Lấy danh sách khách hàng thành công');
  } catch (err) {
    console.error('Get customers error:', err);
    return sendError(res, 500, 'Lỗi lấy danh sách khách hàng', 'SERVER_ERROR');
  }
});

router.get('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã khách hàng không hợp lệ', 'VALIDATION_ERROR');
  }

  try {
    const customer = await loadCustomerByLegacyId(id);

    if (!customer) {
      return sendError(res, 404, 'Không tìm thấy khách hàng', 'NOT_FOUND');
    }

    return sendSuccess(res, customer, 'Lấy thông tin khách hàng thành công');
  } catch (err) {
    console.error('Get customer detail error:', err);
    return sendError(res, 500, 'Lỗi lấy thông tin khách hàng', 'SERVER_ERROR');
  }
});

router.post('/', async (req, res) => {
  const customer = getCustomerPayload(req.body);
  const validation = validateCustomerPayload(customer);
  if (validation) {
    return sendCustomerValidationError(
      res,
      400,
      validation.message,
      validation.fieldErrors
    );
  }

  try {
    const created = await withTransaction(async (client) => {
      const existing = await query(
        'SELECT 1 FROM external_customers WHERE phone = $1 LIMIT 1',
        [customer.SoDienThoai],
        client
      );

      if (existing.rows.length > 0) {
        throw Object.assign(new Error(DUPLICATE_PHONE_MESSAGE), {
          status: 409,
          code: 'CONFLICT',
          fieldErrors: { SoDienThoai: DUPLICATE_PHONE_MESSAGE }
        });
      }

      const legacyInsert = await query(
        `
          INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING MaKhachHang
        `,
        [customer.TenKhachHang, customer.SoDienThoai, customer.DiaChiDon, customer.DiaChiTra, customer.TrangThai],
        client
      );

      const legacyId = legacyInsert.rows[0].MaKhachHang;
      await query(
        `
          INSERT INTO external_customers (
            legacy_ma_khach_hang,
            customer_code,
            full_name,
            phone,
            default_pickup_address,
            default_dropoff_address,
            status,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          legacyId,
          buildCustomerCode(legacyId),
          customer.TenKhachHang,
          customer.SoDienThoai,
          customer.DiaChiDon,
          customer.DiaChiTra,
          toExternalStatus(customer.TrangThai),
          toExternalIsActive(customer.TrangThai)
        ],
        client
      );

      return loadCustomerByLegacyId(legacyId, client);
    });

    return sendSuccess(res, created, 'Tạo khách hàng thành công', 201);
  } catch (err) {
    console.error('Create customer error:', err);

    if (err.fieldErrors) {
      return sendCustomerValidationError(res, err.status || 409, err.message, err.fieldErrors, err.code || 'CONFLICT');
    }

    return sendError(res, 500, 'Lỗi tạo khách hàng', 'SERVER_ERROR');
  }
});

router.put('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã khách hàng không hợp lệ', 'VALIDATION_ERROR');
  }

  const customer = getCustomerPayload(req.body);
  const validation = validateCustomerPayload(customer);
  if (validation) {
    return sendCustomerValidationError(
      res,
      400,
      validation.message,
      validation.fieldErrors
    );
  }

  try {
    const updated = await withTransaction(async (client) => {
      const existingCustomer = await loadCustomerByLegacyId(id, client);

      if (!existingCustomer) {
        throw Object.assign(new Error('Không tìm thấy khách hàng'), { status: 404, code: 'NOT_FOUND' });
      }

      const existingPhone = await query(
        `
          SELECT 1
          FROM external_customers
          WHERE phone = $1
            AND legacy_ma_khach_hang <> $2
          LIMIT 1
        `,
        [customer.SoDienThoai, id],
        client
      );

      if (existingPhone.rows.length > 0) {
        throw Object.assign(new Error(DUPLICATE_PHONE_MESSAGE), {
          status: 409,
          code: 'CONFLICT',
          fieldErrors: { SoDienThoai: DUPLICATE_PHONE_MESSAGE }
        });
      }

      await query(
        `
          UPDATE KhachHang
          SET TenKhachHang = $1,
              SoDienThoai = $2,
              DiaChiDon = $3,
              DiaChiTra = $4,
              TrangThai = $5
          WHERE MaKhachHang = $6
        `,
        [customer.TenKhachHang, customer.SoDienThoai, customer.DiaChiDon, customer.DiaChiTra, customer.TrangThai, id],
        client
      );

      await query(
        `
          UPDATE external_customers
          SET full_name = $1,
              phone = $2,
              default_pickup_address = $3,
              default_dropoff_address = $4,
              status = $5,
              is_active = $6,
              updated_at = NOW()
          WHERE legacy_ma_khach_hang = $7
        `,
        [
          customer.TenKhachHang,
          customer.SoDienThoai,
          customer.DiaChiDon,
          customer.DiaChiTra,
          toExternalStatus(customer.TrangThai),
          toExternalIsActive(customer.TrangThai),
          id
        ],
        client
      );

      return loadCustomerByLegacyId(id, client);
    });

    return sendSuccess(res, updated, 'Cập nhật khách hàng thành công');
  } catch (err) {
    console.error('Update customer error:', err);

    if (err.fieldErrors) {
      return sendCustomerValidationError(res, err.status || 409, err.message, err.fieldErrors, err.code || 'CONFLICT');
    }

    if (err.code === 'NOT_FOUND') {
      return sendError(res, 404, err.message, 'NOT_FOUND');
    }

    return sendError(res, 500, 'Lỗi cập nhật khách hàng', 'SERVER_ERROR');
  }
});

router.delete('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã khách hàng không hợp lệ', 'VALIDATION_ERROR');
  }

  try {
    const disabled = await withTransaction(async (client) => {
      const relatedTickets = await query('SELECT 1 FROM VeTrungChuyen WHERE MaKhachHang = $1 LIMIT 1', [id], client);

      if (relatedTickets.rows.length > 0) {
        throw Object.assign(new Error(DELETE_BLOCKED_MESSAGE), { status: 409, code: 'CONFLICT' });
      }

      const existingCustomer = await loadCustomerByLegacyId(id, client);

      if (!existingCustomer) {
        throw Object.assign(new Error('Không tìm thấy khách hàng'), { status: 404, code: 'NOT_FOUND' });
      }

      await query(
        `
          UPDATE KhachHang
          SET TrangThai = $1
          WHERE MaKhachHang = $2
        `,
        [CUSTOMER_STATUSES.INACTIVE, id],
        client
      );

      await query(
        `
          UPDATE external_customers
          SET status = 'INACTIVE',
              is_active = FALSE,
              updated_at = NOW()
          WHERE legacy_ma_khach_hang = $1
        `,
        [id],
        client
      );

      return loadCustomerByLegacyId(id, client);
    });

    return sendSuccess(res, disabled, 'Đã chuyển khách hàng sang ngừng hoạt động');
  } catch (err) {
    console.error('Delete customer error:', err);

    if (err.code === 'CONFLICT') {
      return sendError(res, err.status || 409, err.message, 'CONFLICT');
    }

    if (err.code === 'NOT_FOUND') {
      return sendError(res, 404, err.message, 'NOT_FOUND');
    }

    return sendError(res, 500, 'Lỗi cập nhật trạng thái khách hàng', 'SERVER_ERROR');
  }
});

module.exports = router;
