const express = require('express');

const { getPool, sql } = require('../db');
const { sendError, sendSuccess } = require('../utils/http');

const router = express.Router();

router.get('/', async (req, res) => {
  const status = String(req.query.status || '').trim();
  const keyword = String(req.query.keyword || '').trim();

  try {
    const pool = await getPool();
    const request = pool.request();

    let query = `
      SELECT
        v.MaVe,
        v.KhungGioTrungChuyen,
        v.SoLuongGhe,
        v.TrangThaiVe,
        k.TenKhachHang,
        k.SoDienThoai,
        k.DiaChiDon,
        k.DiaChiTra
      FROM VeTrungChuyen v
      JOIN KhachHang k ON v.MaKhachHang = k.MaKhachHang
      WHERE ISNULL(k.TrangThai, N'') <> N'Ngừng hoạt động'
    `;

    if (status) {
      query += ' AND v.TrangThaiVe = @status';
      request.input('status', sql.NVarChar(50), status);
    }

    if (keyword) {
      query += `
        AND (
          k.TenKhachHang LIKE @kw OR
          k.SoDienThoai LIKE @kw OR
          k.DiaChiDon LIKE @kw OR
          k.DiaChiTra LIKE @kw
        )
      `;
      request.input('kw', sql.NVarChar(100), `%${keyword}%`);
    }

    query += ' ORDER BY v.MaVe DESC';

    const result = await request.query(query);
    return sendSuccess(res, result.recordset, 'Lấy danh sách vé trung chuyển thành công');
  } catch (err) {
    console.error('Get tickets error:', err);
    return sendError(res, 500, 'Lỗi lấy danh sách vé trung chuyển', 'SERVER_ERROR');
  }
});

module.exports = router;
