const express = require('express');

const { getPool, sql } = require('../db');
const { CUSTOMER_STATUSES } = require('../constants/status');
const { sendError, sendSuccess } = require('../utils/http');
const { isValidPhoneNumber, toPositiveInteger } = require('../utils/validation');

const router = express.Router();

const CUSTOMER_COLUMNS = `
  MaKhachHang,
  TenKhachHang,
  SoDienThoai,
  DiaChiDon,
  DiaChiTra,
  TrangThai
`;

const CUSTOMER_OUTPUT_COLUMNS = `
  INSERTED.MaKhachHang,
  INSERTED.TenKhachHang,
  INSERTED.SoDienThoai,
  INSERTED.DiaChiDon,
  INSERTED.DiaChiTra,
  INSERTED.TrangThai
`;

const ALLOWED_CUSTOMER_STATUSES = new Set(Object.values(CUSTOMER_STATUSES));

function getCustomerPayload(body = {}) {
  return {
    TenKhachHang: String(body.TenKhachHang || '').trim(),
    SoDienThoai: String(body.SoDienThoai || '').trim(),
    DiaChiDon: String(body.DiaChiDon || '').trim(),
    DiaChiTra: String(body.DiaChiTra || '').trim(),
    TrangThai: body.TrangThai ? String(body.TrangThai).trim() : CUSTOMER_STATUSES.ACTIVE
  };
}

function validateCustomerPayload(customer) {
  if (!customer.TenKhachHang || !customer.SoDienThoai || !customer.DiaChiDon || !customer.DiaChiTra) {
    return 'Tên, số điện thoại và địa chỉ đón/trả là bắt buộc';
  }

  if (!isValidPhoneNumber(customer.SoDienThoai)) {
    return 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)';
  }

  if (!ALLOWED_CUSTOMER_STATUSES.has(customer.TrangThai)) {
    return 'Trạng thái khách hàng không hợp lệ';
  }

  return null;
}

router.get('/', async (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  const includeInactive = String(req.query.includeInactive || '').trim() === '1';

  try {
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT ${CUSTOMER_COLUMNS}
      FROM KhachHang
      WHERE 1 = 1
    `;

    if (!includeInactive) {
      query += ` AND ISNULL(TrangThai, N'') <> N'${CUSTOMER_STATUSES.INACTIVE}'`;
    }

    if (keyword) {
      query += ' AND (TenKhachHang LIKE @kw OR SoDienThoai LIKE @kw OR DiaChiDon LIKE @kw OR DiaChiTra LIKE @kw)';
      request.input('kw', sql.NVarChar(100), `%${keyword}%`);
    }

    query += ' ORDER BY MaKhachHang DESC';

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
        SELECT ${CUSTOMER_COLUMNS}
        FROM KhachHang
        WHERE MaKhachHang = @id
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
  const validationMessage = validateCustomerPayload(customer);
  if (validationMessage) {
    return sendError(res, 400, validationMessage, 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();

    const existing = await pool
      .request()
      .input('phone', sql.VarChar(15), customer.SoDienThoai)
      .query(`
        SELECT 1
        FROM KhachHang
        WHERE SoDienThoai = @phone
          AND ISNULL(TrangThai, N'') <> N'${CUSTOMER_STATUSES.INACTIVE}'
      `);

    if (existing.recordset.length > 0) {
      return sendError(res, 409, 'Số điện thoại đã tồn tại', 'CONFLICT');
    }

    const result = await pool
      .request()
      .input('TenKhachHang', sql.NVarChar(100), customer.TenKhachHang)
      .input('SoDienThoai', sql.VarChar(15), customer.SoDienThoai)
      .input('DiaChiDon', sql.NVarChar(255), customer.DiaChiDon)
      .input('DiaChiTra', sql.NVarChar(255), customer.DiaChiTra)
      .input('TrangThai', sql.NVarChar(30), customer.TrangThai)
      .query(`
        INSERT INTO KhachHang (TenKhachHang, SoDienThoai, DiaChiDon, DiaChiTra, TrangThai)
        OUTPUT ${CUSTOMER_OUTPUT_COLUMNS}
        VALUES (@TenKhachHang, @SoDienThoai, @DiaChiDon, @DiaChiTra, @TrangThai)
      `);

    return sendSuccess(res, result.recordset[0], 'Tạo khách hàng thành công', 201);
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
  const validationMessage = validateCustomerPayload(customer);
  if (validationMessage) {
    return sendError(res, 400, validationMessage, 'VALIDATION_ERROR');
  }

  try {
    const pool = await getPool();

    const existingCustomer = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        SELECT ${CUSTOMER_COLUMNS}
        FROM KhachHang
        WHERE MaKhachHang = @id
      `);

    if (existingCustomer.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy khách hàng', 'NOT_FOUND');
    }

    const existingPhone = await pool
      .request()
      .input('id', sql.Int, id)
      .input('phone', sql.VarChar(15), customer.SoDienThoai)
      .query(`
        SELECT 1
        FROM KhachHang
        WHERE SoDienThoai = @phone
          AND MaKhachHang <> @id
          AND ISNULL(TrangThai, N'') <> N'${CUSTOMER_STATUSES.INACTIVE}'
      `);

    if (existingPhone.recordset.length > 0) {
      return sendError(res, 409, 'Số điện thoại đã tồn tại cho khách hàng khác', 'CONFLICT');
    }

    const result = await pool
      .request()
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
        OUTPUT ${CUSTOMER_OUTPUT_COLUMNS}
        WHERE MaKhachHang = @id
      `);

    return sendSuccess(res, result.recordset[0], 'Cập nhật khách hàng thành công');
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

    const relatedTickets = await pool
      .request()
      .input('id', sql.Int, id)
      .query('SELECT TOP 1 1 FROM VeTrungChuyen WHERE MaKhachHang = @id');

    if (relatedTickets.recordset.length > 0) {
      return sendError(res, 409, 'Không thể ngưng hoạt động khách hàng đang có vé', 'CONFLICT');
    }

    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`
        UPDATE KhachHang
        SET TrangThai = N'${CUSTOMER_STATUSES.INACTIVE}'
        OUTPUT ${CUSTOMER_OUTPUT_COLUMNS}
        WHERE MaKhachHang = @id
      `);

    if (result.recordset.length === 0) {
      return sendError(res, 404, 'Không tìm thấy khách hàng', 'NOT_FOUND');
    }

    return sendSuccess(res, result.recordset[0], 'Đã chuyển khách hàng sang ngừng hoạt động');
  } catch (err) {
    console.error('Delete customer error:', err);
    return sendError(res, 500, 'Lỗi cập nhật trạng thái khách hàng', 'SERVER_ERROR');
  }
});

module.exports = router;
