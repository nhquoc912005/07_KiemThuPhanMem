const express = require('express');

const { query } = require('../db');
const { sendError, sendSuccess } = require('../utils/http');

const router = express.Router();

router.get('/', async (req, res) => {
  const status = String(req.query.status || '').trim();
  const keyword = String(req.query.keyword || '').trim();

  try {
    const params = [];

    let sqlText = `
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
      WHERE COALESCE(k.TrangThai, '') <> 'Ngừng hoạt động'
    `;

    if (status) {
      params.push(status);
      sqlText += ` AND v.TrangThaiVe = $${params.length}`;
    }

    if (keyword) {
      params.push(`%${keyword}%`);
      sqlText += `
        AND (
          k.TenKhachHang ILIKE $${params.length} OR
          k.SoDienThoai ILIKE $${params.length} OR
          k.DiaChiDon ILIKE $${params.length} OR
          k.DiaChiTra ILIKE $${params.length}
        )
      `;
    }

    sqlText += ' ORDER BY v.MaVe DESC';

    const result = await query(sqlText, params);
    return sendSuccess(res, result.rows, 'Lấy danh sách vé trung chuyển thành công');
  } catch (err) {
    console.error('Get tickets error:', err);
    return sendError(res, 500, 'Lỗi lấy danh sách vé trung chuyển', 'SERVER_ERROR');
  }
});

module.exports = router;
