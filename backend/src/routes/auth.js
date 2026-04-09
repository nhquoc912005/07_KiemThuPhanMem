const express = require('express');

const { getPool, sql } = require('../db');
const {
  DISPATCHER_ROLE,
  DRIVER_ROLE,
  JWT_EXPIRES_IN,
  generateOtpCode,
  hashOtpCode,
  hashPassword,
  signAccessToken,
  verifyPassword
} = require('../utils/auth');

const router = express.Router();

// OTP demo local: phone -> { otpHash, expiresAtMs }
const otpStore = new Map();

function isStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return false;
  }

  return /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function serializeUser(row) {
  return {
    MaTaiKhoan: row.MaTaiKhoan,
    TenDangNhap: row.TenDangNhap,
    VaiTro: row.VaiTro,
    TrangThaiTaiKhoan: row.TrangThaiTaiKhoan,
    SoDienThoai: row.SoDienThoai,
    HoTen: row.HoTen,
    MaTaiXe: row.MaTaiXe,
    MaNhanVien: row.MaNhanVien
  };
}

router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ message: 'username và password là bắt buộc' });
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('username', sql.VarChar(50), username)
      .query(`
        SELECT
          tk.MaTaiKhoan,
          tk.TenDangNhap,
          tk.MatKhauMaHoa,
          tk.SoDienThoai,
          tk.VaiTro,
          tk.TrangThaiTaiKhoan,
          tx.MaTaiXe,
          nv.MaNhanVien,
          COALESCE(tx.HoTen, nv.HoTen) AS HoTen
        FROM TaiKhoanNguoiDung tk
        LEFT JOIN TaiXe tx ON tx.MaTaiKhoan = tk.MaTaiKhoan
        LEFT JOIN NhanVienDieuPhoi nv ON nv.MaTaiKhoan = tk.MaTaiKhoan
        WHERE tk.TenDangNhap = @username
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại' });
    }

    const user = result.recordset[0];
    if (!user.TrangThaiTaiKhoan) {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa' });
    }

    const isValidPassword = await verifyPassword(password, user.MatKhauMaHoa);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Mật khẩu không đúng' });
    }

    const serializedUser = serializeUser(user);
    const accessToken = signAccessToken(serializedUser);

    return res.json({
      message: 'Đăng nhập thành công',
      accessToken,
      expiresIn: JWT_EXPIRES_IN,
      user: serializedUser
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi đăng nhập' });
  }
});

router.post('/logout', (req, res) => {
  return res.json({ message: 'Đã đăng xuất' });
});

router.post('/forgot-password', async (req, res) => {
  const phoneNumber = String(req.body?.phoneNumber || '').trim();
  if (!phoneNumber) {
    return res.status(400).json({ message: 'phoneNumber là bắt buộc' });
  }

  if (!/^0\d{9}$/.test(phoneNumber)) {
    return res
      .status(400)
      .json({ message: 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)' });
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('phone', sql.VarChar(15), phoneNumber)
      .query(`
        SELECT MaTaiKhoan
        FROM TaiKhoanNguoiDung
        WHERE SoDienThoai = @phone
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại' });
    }

    const otp = generateOtpCode();
    const expiresInSeconds = 60;
    otpStore.set(phoneNumber, {
      otpHash: hashOtpCode(phoneNumber, otp),
      expiresAtMs: Date.now() + expiresInSeconds * 1000
    });

    console.log(`[OTP DEMO] ${phoneNumber}: ${otp}`);

    return res.json({
      message: 'Đã tạo mã OTP mới. Vui lòng xem log backend để lấy mã demo.',
      expiresInSeconds
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi xử lý quên mật khẩu' });
  }
});

router.post('/register', async (req, res) => {
  const {
    role,
    fullName,
    username,
    phoneNumber,
    password,
    cccd,
    licenseType
  } = req.body || {};

  if (!role || !fullName || !username || !phoneNumber || !password) {
    return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
  }

  if (!/^0\d{9}$/.test(phoneNumber)) {
    return res
      .status(400)
      .json({ message: 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message: 'Mật khẩu phải có ít nhất 8 ký tự (gồm chữ, số và ký tự đặc biệt)'
    });
  }

  const normalizedRole = role === 'driver' ? 'driver' : 'dispatcher';
  const roleLabel = normalizedRole === 'driver' ? DRIVER_ROLE : DISPATCHER_ROLE;

  if (normalizedRole === 'driver' && (!cccd || !/^\d{12}$/.test(cccd))) {
    return res.status(400).json({ message: 'CCCD không hợp lệ (12 chữ số)' });
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    const hashedPassword = await hashPassword(password);

    await transaction.begin();

    try {
      const existingUser = await new sql.Request(transaction)
        .input('username', sql.VarChar(50), username)
        .query('SELECT 1 FROM TaiKhoanNguoiDung WHERE TenDangNhap = @username');

      if (existingUser.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({ message: 'Tên đăng nhập đã tồn tại' });
      }

      const existingPhone = await new sql.Request(transaction)
        .input('phone', sql.VarChar(15), phoneNumber)
        .query('SELECT 1 FROM TaiKhoanNguoiDung WHERE SoDienThoai = @phone');

      if (existingPhone.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({ message: 'Số điện thoại đã tồn tại' });
      }

      if (normalizedRole === 'driver') {
        const existingDriver = await new sql.Request(transaction)
          .input('cccd', sql.VarChar(20), cccd)
          .query('SELECT 1 FROM TaiXe WHERE CCCD = @cccd');

        if (existingDriver.recordset.length > 0) {
          await transaction.rollback();
          return res.status(409).json({ message: 'CCCD đã tồn tại' });
        }
      }

      const accountResult = await new sql.Request(transaction)
        .input('TenDangNhap', sql.VarChar(50), username)
        .input('MatKhauMaHoa', sql.VarChar(255), hashedPassword)
        .input('SoDienThoai', sql.VarChar(15), phoneNumber)
        .input('VaiTro', sql.NVarChar(30), roleLabel)
        .query(`
          INSERT INTO TaiKhoanNguoiDung (TenDangNhap, MatKhauMaHoa, SoDienThoai, VaiTro)
          OUTPUT INSERTED.*
          VALUES (@TenDangNhap, @MatKhauMaHoa, @SoDienThoai, @VaiTro)
        `);

      const account = accountResult.recordset[0];
      let detailRecord = null;

      if (normalizedRole === 'dispatcher') {
        const dispatcherResult = await new sql.Request(transaction)
          .input('HoTen', sql.NVarChar(100), fullName)
          .input('SoDienThoai', sql.VarChar(15), phoneNumber)
          .input('TrangThai', sql.NVarChar(30), 'Hoạt động')
          .input('MaTaiKhoan', sql.Int, account.MaTaiKhoan)
          .query(`
            INSERT INTO NhanVienDieuPhoi (HoTen, SoDienThoai, TrangThai, MaTaiKhoan)
            OUTPUT INSERTED.*
            VALUES (@HoTen, @SoDienThoai, @TrangThai, @MaTaiKhoan)
          `);
        detailRecord = dispatcherResult.recordset[0];
      } else {
        const driverResult = await new sql.Request(transaction)
          .input('HoTen', sql.NVarChar(100), fullName)
          .input('SoDienThoai', sql.VarChar(15), phoneNumber)
          .input('CCCD', sql.VarChar(20), cccd)
          .input('LoaiBangLai', sql.NVarChar(50), licenseType || null)
          .input('TrangThaiTaiXe', sql.NVarChar(30), 'Rảnh')
          .input('MaTaiKhoan', sql.Int, account.MaTaiKhoan)
          .query(`
            INSERT INTO TaiXe (HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe, MaTaiKhoan)
            OUTPUT INSERTED.*
            VALUES (@HoTen, @SoDienThoai, @CCCD, @LoaiBangLai, @TrangThaiTaiXe, @MaTaiKhoan)
          `);
        detailRecord = driverResult.recordset[0];
      }

      await transaction.commit();

      return res.status(201).json({
        message: 'Đăng ký thành công',
        user: {
          MaTaiKhoan: account.MaTaiKhoan,
          TenDangNhap: account.TenDangNhap,
          VaiTro: account.VaiTro,
          SoDienThoai: account.SoDienThoai,
          HoTen: fullName,
          MaTaiXe: detailRecord?.MaTaiXe,
          MaNhanVien: detailRecord?.MaNhanVien
        }
      });
    } catch (innerError) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }
      throw innerError;
    }
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi đăng ký tài khoản' });
  }
});

router.post('/reset-password', async (req, res) => {
  const phoneNumber = String(req.body?.phoneNumber || '').trim();
  const otp = String(req.body?.otp || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!phoneNumber || !otp || !newPassword) {
    return res.status(400).json({ message: 'phoneNumber, otp và newPassword là bắt buộc' });
  }

  if (!/^0\d{9}$/.test(phoneNumber)) {
    return res
      .status(400)
      .json({ message: 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)' });
  }

  const cachedOtp = otpStore.get(phoneNumber);
  if (!cachedOtp) {
    return res.status(400).json({ message: 'Chưa có OTP, vui lòng gửi OTP trước.' });
  }

  if (Date.now() > cachedOtp.expiresAtMs) {
    otpStore.delete(phoneNumber);
    return res.status(400).json({ message: 'Mã OTP đã hết hạn vui lòng gửi lại' });
  }

  if (hashOtpCode(phoneNumber, otp) !== cachedOtp.otpHash) {
    return res.status(400).json({ message: 'Mã OTP không đúng' });
  }

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      message: 'Mật khẩu phải có ít nhất 8 ký tự (gồm chữ, số và ký tự đặc biệt)'
    });
  }

  try {
    const pool = await getPool();
    const existing = await pool
      .request()
      .input('phone', sql.VarChar(15), phoneNumber)
      .query(`
        SELECT MaTaiKhoan, MatKhauMaHoa
        FROM TaiKhoanNguoiDung
        WHERE SoDienThoai = @phone
      `);

    if (existing.recordset.length === 0) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại' });
    }

    const currentPassword = existing.recordset[0].MatKhauMaHoa;
    const sameAsCurrentPassword = await verifyPassword(newPassword, currentPassword);
    if (sameAsCurrentPassword) {
      return res.status(400).json({ message: 'Nhập mật khẩu khác' });
    }

    const hashedPassword = await hashPassword(newPassword);

    await pool
      .request()
      .input('phone', sql.VarChar(15), phoneNumber)
      .input('MatKhauMaHoa', sql.VarChar(255), hashedPassword)
      .query(`
        UPDATE TaiKhoanNguoiDung
        SET MatKhauMaHoa = @MatKhauMaHoa
        WHERE SoDienThoai = @phone
      `);

    otpStore.delete(phoneNumber);
    return res.json({ message: 'Đặt lại mật khẩu thành công' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Lỗi hệ thống khi đặt lại mật khẩu' });
  }
});

module.exports = router;
