const express = require('express');

const { getPool, sql } = require('../db');
const { sendError, sendSuccess } = require('../utils/http');

const router = express.Router();

router.get('/summary', async (req, res) => {
  const fromDate = String(req.query.fromDate || '').trim();
  const toDate = String(req.query.toDate || '').trim();

  try {
    const pool = await getPool();
    const request = pool.request();

    let query = `
      SELECT
        lt.MaLoTrinh,
        CONVERT(date, lt.ThoiGianBatDau) AS Ngay,
        lt.MaXe,
        lt.MaTaiXe,
        xtc.LoaiXe,
        xtc.BienSo,
        tx.HoTen AS TenTaiXe,
        lt.TrangThaiLoTrinh,
        COUNT(DISTINCT ct.MaChiTiet) AS SoDiemDonTra,
        COUNT(DISTINCT ct.MaVe) AS SoKhach,
        ISNULL(SUM(v.SoLuongGhe), 0) AS TongGhe,
        MIN(k.DiaChiDon) AS KhuVuc,
        lt.LoTrinhDuKien
      FROM LoTrinhTrungChuyen lt
      LEFT JOIN XeTrungChuyen xtc ON lt.MaXe = xtc.MaXe
      LEFT JOIN TaiXe tx ON lt.MaTaiXe = tx.MaTaiXe
      LEFT JOIN ChiTietLoTrinh ct ON lt.MaLoTrinh = ct.MaLoTrinh
      LEFT JOIN VeTrungChuyen v ON v.MaVe = ct.MaVe
      LEFT JOIN KhachHang k ON k.MaKhachHang = v.MaKhachHang
      WHERE 1 = 1
    `;

    if (fromDate) {
      request.input('fromDate', sql.DateTime, fromDate);
      query += ' AND lt.ThoiGianBatDau >= @fromDate';
    }

    if (toDate) {
      request.input('toDate', sql.DateTime, toDate);
      query += ' AND lt.ThoiGianBatDau < DATEADD(DAY, 1, @toDate)';
    }

    query += `
      GROUP BY
        lt.MaLoTrinh,
        CONVERT(date, lt.ThoiGianBatDau),
        lt.MaXe,
        lt.MaTaiXe,
        xtc.LoaiXe,
        xtc.BienSo,
        tx.HoTen,
        lt.TrangThaiLoTrinh,
        lt.LoTrinhDuKien
      ORDER BY Ngay DESC, lt.MaLoTrinh DESC
    `;

    const result = await request.query(query);
    return sendSuccess(res, result.recordset, 'Lấy báo cáo tổng hợp thành công');
  } catch (err) {
    console.error('Get summary report error:', err);
    return sendError(res, 500, 'Lỗi lấy báo cáo tổng hợp', 'SERVER_ERROR');
  }
});

module.exports = router;
