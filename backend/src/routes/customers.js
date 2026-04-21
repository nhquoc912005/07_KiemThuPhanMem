const express = require('express');

const { getPool, sql } = require('../db');
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
    WHEN status = N'ACTIVE' AND is_active = 1 THEN N'${CUSTOMER_STATUSES.ACTIVE}'
    ELSE N'${CUSTOMER_STATUSES.INACTIVE}'
  END AS TrangThai
`;

const CUSTOMER_OUTPUT_COLUMNS = `
  INSERTED.legacy_ma_khach_hang AS MaKhachHang,
  INSERTED.full_name AS TenKhachHang,
  INSERTED.phone AS SoDienThoai,
  INSERTED.default_pickup_address AS DiaChiDon,
  INSERTED.default_dropoff_address AS DiaChiTra,
  CASE
    WHEN INSERTED.status = N'ACTIVE' AND INSERTED.is_active = 1 THEN N'${CUSTOMER_STATUSES.ACTIVE}'
    ELSE N'${CUSTOMER_STATUSES.INACTIVE}'
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
  return customerStatus === CUSTOMER_STATUSES.INACTIVE ? 0 : 1;
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

router.get('/', async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const includeInactive = String(req.query.includeInactive || '').trim() === '1';

  try {
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT ${CUSTOMER_SELECT_COLUMNS}
      FROM external_customers
      WHERE 1 = 1
    `;

    if (!includeInactive) {
      query += ` AND status = N'ACTIVE' AND is_active = 1`;
    }

    if (keyword) {
      query += ' AND (full_name LIKE @kw OR phone LIKE @kw OR default_pickup_address LIKE @kw OR default_dropoff_address LIKE @kw)';
      request.input('kw', sql.NVarChar(100), `%${keyword}%`);
    }

    query += ' ORDER BY legacy_ma_khach_hang DESC';

    const result = await request.query(query);
    return sendSuccess(res, result.recordset, 'Lấy danh sách khách hàng thành công');
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
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ${CUSTOMER_SELECT_COLUMNS}
        FROM external_customers
        WHERE legacy_ma_khach_hang = @id
      `);

    if (result.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy khách hàng', 'NOT_FOUND');
    }

    return sendSuccess(res, result.recordset[0], 'Lấy thông tin khách hàng thành công');
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
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const existing = await new sql.Request(transaction)
        .input('phone', sql.VarChar(15), customer.SoDienThoai)
        .query(`
          SELECT TOP 1 1
          FROM external_customers
          WHERE phone = @phone
        `);

      if (existing.recordset.length > 0) {
        await transaction.rollback();
        return sendCustomerValidationError(
          res,
          409,
          DUPLICATE_PHONE_MESSAGE,
          { SoDienThoai: DUPLICATE_PHONE_MESSAGE },
          'CONFLICT'
        );
      }

      const legacyInsert = await new sql.Request(transaction)
        .input('TenKhachHang', sql.NVarChar(100), customer.TenKhachHang)
        .input('SoDienThoai', sql.VarChar(15), customer.SoDienThoai)
        .input('DiaChiDon', sql.NVarChar(255), customer.DiaChiDon)
        .input('DiaChiTra', sql.NVarChar(255), customer.DiaChiTra)
        .input('TrangThai', sql.NVarChar(30), customer.TrangThai)
        .query(`
          INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai)
          OUTPUT INSERTED.MaKhachHang
          VALUES (@TenKhachHang, @SoDienThoai, @DiaChiDon, @DiaChiTra, @TrangThai)
        `);

      const legacyId = legacyInsert.recordset[0].MaKhachHang;
      const result = await new sql.Request(transaction)
        .input('legacyId', sql.Int, legacyId)
        .input('customerCode', sql.NVarChar(20), buildCustomerCode(legacyId))
        .input('fullName', sql.NVarChar(100), customer.TenKhachHang)
        .input('phone', sql.VarChar(15), customer.SoDienThoai)
        .input('pickup', sql.NVarChar(255), customer.DiaChiDon)
        .input('dropoff', sql.NVarChar(255), customer.DiaChiTra)
        .input('status', sql.NVarChar(20), toExternalStatus(customer.TrangThai))
        .input('isActive', sql.Bit, toExternalIsActive(customer.TrangThai))
        .query(`
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
          OUTPUT ${CUSTOMER_OUTPUT_COLUMNS}
          VALUES (@legacyId, @customerCode, @fullName, @phone, @pickup, @dropoff, @status, @isActive)
        `);

      await transaction.commit();
      return sendSuccess(res, result.recordset[0], 'Tạo khách hàng thành công', 201);
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
  } catch (err) {
    console.error('Create customer error:', err);
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
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const existingCustomer = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query(`
          SELECT TOP 1 legacy_ma_khach_hang
          FROM external_customers
          WHERE legacy_ma_khach_hang = @id
        `);

      if (existingCustomer.recordset.length === 0) {
        await transaction.rollback();
        return sendError(res, 404, 'Không tìm thấy khách hàng', 'NOT_FOUND');
      }

      const existingPhone = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('phone', sql.VarChar(15), customer.SoDienThoai)
        .query(`
          SELECT TOP 1 1
          FROM external_customers
          WHERE phone = @phone
            AND legacy_ma_khach_hang <> @id
        `);

      if (existingPhone.recordset.length > 0) {
        await transaction.rollback();
        return sendCustomerValidationError(
          res,
          409,
          DUPLICATE_PHONE_MESSAGE,
          { SoDienThoai: DUPLICATE_PHONE_MESSAGE },
          'CONFLICT'
        );
      }

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('TenKhachHang', sql.NVarChar(100), customer.TenKhachHang)
        .input('SoDienThoai', sql.VarChar(15), customer.SoDienThoai)
        .input('DiaChiDon', sql.NVarChar(255), customer.DiaChiDon)
        .input('DiaChiTra', sql.NVarChar(255), customer.DiaChiTra)
        .input('TrangThai', sql.NVarChar(30), customer.TrangThai)
        .query(`
          UPDATE KhachHang
          SET TenKhachHang = @TenKhachHang,
              SoDienThoai = @SoDienThoai,
              DiaChiDon = @DiaChiDon,
              DiaChiTra = @DiaChiTra,
              TrangThai = @TrangThai
          WHERE MaKhachHang = @id
        `);

      const result = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('fullName', sql.NVarChar(100), customer.TenKhachHang)
        .input('phone', sql.VarChar(15), customer.SoDienThoai)
        .input('pickup', sql.NVarChar(255), customer.DiaChiDon)
        .input('dropoff', sql.NVarChar(255), customer.DiaChiTra)
        .input('status', sql.NVarChar(20), toExternalStatus(customer.TrangThai))
        .input('isActive', sql.Bit, toExternalIsActive(customer.TrangThai))
        .query(`
          UPDATE external_customers
          SET full_name = @fullName,
              phone = @phone,
              default_pickup_address = @pickup,
              default_dropoff_address = @dropoff,
              status = @status,
              is_active = @isActive,
              updated_at = GETDATE()
          OUTPUT ${CUSTOMER_OUTPUT_COLUMNS}
          WHERE legacy_ma_khach_hang = @id
        `);

      await transaction.commit();
      return sendSuccess(res, result.recordset[0], 'Cập nhật khách hàng thành công');
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
  } catch (err) {
    console.error('Update customer error:', err);
    return sendError(res, 500, 'Lỗi cập nhật khách hàng', 'SERVER_ERROR');
  }
});

router.delete('/:id', async (req, res) => {
  const id = toPositiveInteger(req.params.id);
  if (id == null) {
    return sendError(res, 400, 'Mã khách hàng không hợp lệ', 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const relatedTickets = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query('SELECT TOP 1 1 FROM VeTrungChuyen WHERE MaKhachHang = @id');

      if (relatedTickets.recordset.length > 0) {
        await transaction.rollback();
        return sendError(res, 409, DELETE_BLOCKED_MESSAGE, 'CONFLICT');
      }

      const existingCustomer = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query(`
          SELECT TOP 1 legacy_ma_khach_hang
          FROM external_customers
          WHERE legacy_ma_khach_hang = @id
        `);

      if (existingCustomer.recordset.length === 0) {
        await transaction.rollback();
        return sendError(res, 404, 'Không tìm thấy khách hàng', 'NOT_FOUND');
      }

      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('TrangThai', sql.NVarChar(30), CUSTOMER_STATUSES.INACTIVE)
        .query(`
          UPDATE KhachHang
          SET TrangThai = @TrangThai
          WHERE MaKhachHang = @id
        `);

      const result = await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query(`
          UPDATE external_customers
          SET status = N'INACTIVE',
              is_active = 0,
              updated_at = GETDATE()
          OUTPUT ${CUSTOMER_OUTPUT_COLUMNS}
          WHERE legacy_ma_khach_hang = @id
        `);

      await transaction.commit();
      return sendSuccess(res, result.recordset[0], 'Đã chuyển khách hàng sang ngừng hoạt động');
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
  } catch (err) {
    console.error('Delete customer error:', err);
    return sendError(res, 500, 'Lỗi cập nhật trạng thái khách hàng', 'SERVER_ERROR');
  }
});

module.exports = router;
