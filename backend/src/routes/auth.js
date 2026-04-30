const express = require('express');

const { query, withTransaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createDriverWithAccount } = require('../services/driverAccountService');
const {
  DISPATCHER_ROLE,
  DRIVER_ROLE,
  JWT_EXPIRES_IN,
  generateOtpCode,
  hashOtpCode,
  hashPassword,
  signAccessToken,
  signPasswordChangeToken,
  verifyPassword,
  verifyPasswordChangeToken
} = require('../utils/auth');
const { sendError, sendSuccess } = require('../utils/http');
const {
  isValidNationalId,
  isValidPhoneNumber,
  isValidUsername,
  normalizeUsername,
  normalizeVietnamPhoneNumber
} = require('../utils/validation');

const router = express.Router();

const otpStore = new Map();
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const TEMPORARY_LOCK_MINUTES = 15;
const ACCOUNT_LOCK_COLUMN_CANDIDATES = ['khoatamthoidenluc', 'khoatamthoideluc'];
let accountLockColumnPromise;
const STRONG_PASSWORD_MESSAGE =
  'Mật khẩu phải có ít nhất 8 ký tự (gồm chữ, số và ký tự đặc biệt)';

function isStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return false;
  }

  return /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function getTemporaryLockMessage() {
  return `Tài khoản đã bị khóa tạm thời do đăng nhập sai quá ${MAX_FAILED_LOGIN_ATTEMPTS} lần. Vui lòng thử lại sau ${TEMPORARY_LOCK_MINUTES} phút.`;
}

function buildLoginFieldErrors(username, password) {
  const fieldErrors = {};

  if (!username) {
    fieldErrors.username = 'Vui lòng nhập tên đăng nhập';
  } else if (!isValidUsername(username)) {
    fieldErrors.username = 'Tên đăng nhập không đúng định dạng';
  }

  if (!password) {
    fieldErrors.password = 'Vui lòng nhập mật khẩu';
  }

  return fieldErrors;
}

function buildFirstLoginFieldErrors(newPassword, confirmPassword) {
  const fieldErrors = {};

  if (!newPassword) {
    fieldErrors.newPassword = 'Vui lòng nhập mật khẩu mới';
  } else if (!isStrongPassword(newPassword)) {
    fieldErrors.newPassword = STRONG_PASSWORD_MESSAGE;
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = 'Vui lòng nhập lại mật khẩu';
  } else if (newPassword !== confirmPassword) {
    fieldErrors.confirmPassword = 'Mật khẩu nhập lại không khớp';
  }

  return fieldErrors;
}

function getFirstFieldErrorMessage(fieldErrors) {
  return (
    fieldErrors.username ||
    fieldErrors.password ||
    fieldErrors.newPassword ||
    fieldErrors.confirmPassword ||
    'Dữ liệu không hợp lệ'
  );
}

function parseLockUntil(value) {
  if (!value) {
    return null;
  }

  const lockUntil = new Date(value);
  return Number.isNaN(lockUntil.getTime()) ? null : lockUntil;
}

function serializeUser(row) {
  return {
    MaTaiKhoan: row.MaTaiKhoan,
    TenDangNhap: row.TenDangNhap,
    VaiTro: row.VaiTro,
    TrangThaiTaiKhoan: row.TrangThaiTaiKhoan,
    YeuCauDoiMatKhau: Boolean(row.YeuCauDoiMatKhau),
    SoDienThoai: row.SoDienThoai,
    HoTen: row.HoTen,
    MaTaiXe: row.MaTaiXe,
    MaNhanVien: row.MaNhanVien
  };
}

async function getAccountLockColumnName(client = null) {
  if (!accountLockColumnPromise) {
    accountLockColumnPromise = (async () => {
      const result = await query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'taikhoannguoidung'
            AND column_name = ANY($1::text[])
        `,
        [ACCOUNT_LOCK_COLUMN_CANDIDATES],
        client
      );

      const availableColumns = new Set(
        result.rows.map((row) => String(row.column_name || '').trim().toLowerCase())
      );

      for (const candidate of ACCOUNT_LOCK_COLUMN_CANDIDATES) {
        if (availableColumns.has(candidate)) {
          return candidate;
        }
      }

      throw new Error(
        `Missing account lock column. Expected one of: ${ACCOUNT_LOCK_COLUMN_CANDIDATES.join(', ')}`
      );
    })().catch((error) => {
      accountLockColumnPromise = null;
      throw error;
    });
  }

  return accountLockColumnPromise;
}

async function loadUserByAccountId(accountId, client = null) {
  const lockColumn = await getAccountLockColumnName(client);
  const result = await query(
    `
      SELECT
        tk.mataikhoan AS "MaTaiKhoan",
        tk.tendangnhap AS "TenDangNhap",
        tk.matkhaumahoa AS "MatKhauMaHoa",
        tk.sodienthoai AS "SoDienThoai",
        tk.vaitro AS "VaiTro",
        tk.trangthaitaikhoan AS "TrangThaiTaiKhoan",
        tk.yeucaudoimatkhau AS "YeuCauDoiMatKhau",
        tk.solandangnhapsai AS "SoLanDangNhapSai",
        tk.${lockColumn} AS "KhoaTamThoiDenLuc",
        tx.mataixe AS "MaTaiXe",
        nv.manhanvien AS "MaNhanVien",
        COALESCE(tx.hoten, nv.hoten) AS "HoTen"
      FROM taikhoannguoidung tk
      LEFT JOIN taixe tx ON tx.mataikhoan = tk.mataikhoan
      LEFT JOIN nhanviendieuphoi nv ON nv.mataikhoan = tk.mataikhoan
      WHERE tk.mataikhoan = $1
    `,
    [accountId],
    client
  );

  return result.rows[0] || null;
}

async function loadUserByUsername(username, client = null) {
  const lockColumn = await getAccountLockColumnName(client);
  const result = await query(
    `
      SELECT
        tk.mataikhoan AS "MaTaiKhoan",
        tk.tendangnhap AS "TenDangNhap",
        tk.matkhaumahoa AS "MatKhauMaHoa",
        tk.sodienthoai AS "SoDienThoai",
        tk.vaitro AS "VaiTro",
        tk.trangthaitaikhoan AS "TrangThaiTaiKhoan",
        tk.yeucaudoimatkhau AS "YeuCauDoiMatKhau",
        tk.solandangnhapsai AS "SoLanDangNhapSai",
        tk.${lockColumn} AS "KhoaTamThoiDenLuc",
        tx.mataixe AS "MaTaiXe",
        nv.manhanvien AS "MaNhanVien",
        COALESCE(tx.hoten, nv.hoten) AS "HoTen"
      FROM taikhoannguoidung tk
      LEFT JOIN taixe tx ON tx.mataikhoan = tk.mataikhoan
      LEFT JOIN nhanviendieuphoi nv ON nv.mataikhoan = tk.mataikhoan
      WHERE tk.tendangnhap = $1
    `,
    [username],
    client
  );

  return result.rows[0] || null;
}

async function clearLoginFailures(accountId, client = null) {
  const lockColumn = await getAccountLockColumnName(client);
  await query(
    `
      UPDATE taikhoannguoidung
      SET solandangnhapsai = 0,
          ${lockColumn} = NULL
      WHERE mataikhoan = $1
    `,
    [accountId],
    client
  );
}

async function registerFailedLoginAttempt(user, client = null) {
  const nextFailedCount = Number(user.SoLanDangNhapSai || 0) + 1;
  const shouldLock = nextFailedCount >= MAX_FAILED_LOGIN_ATTEMPTS;
  const lockUntil = shouldLock
    ? new Date(Date.now() + TEMPORARY_LOCK_MINUTES * 60 * 1000)
    : null;
  const lockColumn = await getAccountLockColumnName(client);

  await query(
    `
      UPDATE taikhoannguoidung
      SET solandangnhapsai = $1,
          ${lockColumn} = $2
      WHERE mataikhoan = $3
    `,
    [shouldLock ? 0 : nextFailedCount, lockUntil, user.MaTaiKhoan],
    client
  );

  return { shouldLock, lockUntil };
}

router.post('/login', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const fieldErrors = buildLoginFieldErrors(username, password);

  if (Object.keys(fieldErrors).length > 0) {
    return sendError(
      res,
      400,
      getFirstFieldErrorMessage(fieldErrors),
      'VALIDATION_ERROR',
      { fieldErrors }
    );
  }

  try {
    const user = await loadUserByUsername(username);

    if (!user) {
      return sendError(res, 404, 'Tài khoản không tồn tại', 'ACCOUNT_NOT_FOUND');
    }

    if (!user.TrangThaiTaiKhoan) {
      return sendError(res, 403, 'Tài khoản đã bị khóa', 'ACCOUNT_LOCKED');
    }

    const lockUntil = parseLockUntil(user.KhoaTamThoiDenLuc);
    if (lockUntil && lockUntil.getTime() > Date.now()) {
      return sendError(
        res,
        423,
        getTemporaryLockMessage(),
        'ACCOUNT_TEMPORARILY_LOCKED',
        { lockUntil: lockUntil.toISOString() }
      );
    }

    if (lockUntil) {
      await clearLoginFailures(user.MaTaiKhoan);
      user.SoLanDangNhapSai = 0;
      user.KhoaTamThoiDenLuc = null;
    }

    const isValidPassword = await verifyPassword(password, user.MatKhauMaHoa);
    if (!isValidPassword) {
      const failedAttempt = await registerFailedLoginAttempt(user);
      if (failedAttempt.shouldLock) {
        return sendError(
          res,
          423,
          getTemporaryLockMessage(),
          'ACCOUNT_TEMPORARILY_LOCKED',
          { lockUntil: failedAttempt.lockUntil?.toISOString() || null }
        );
      }

      return sendError(res, 401, 'Sai mật khẩu', 'INVALID_PASSWORD');
    }

    const serializedUser = serializeUser(user);
    await clearLoginFailures(user.MaTaiKhoan);

    if (user.YeuCauDoiMatKhau) {
      return sendSuccess(
        res,
        {
          requirePasswordChange: true,
          passwordChangeToken: signPasswordChangeToken(serializedUser),
          user: serializedUser
        },
        'Vui lòng đổi mật khẩu lần đầu'
      );
    }

    return sendSuccess(
      res,
      {
        accessToken: signAccessToken(serializedUser),
        expiresIn: JWT_EXPIRES_IN,
        requirePasswordChange: false,
        user: serializedUser
      },
      'Đăng nhập thành công'
    );
  } catch (err) {
    console.error('Login error:', err);
    return sendError(res, 500, 'Lỗi hệ thống khi đăng nhập', 'SERVER_ERROR');
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await loadUserByAccountId(Number(req.auth?.sub));

    if (!user) {
      return sendError(res, 404, 'Không tìm thấy người dùng hiện tại', 'NOT_FOUND');
    }

    if (!user.TrangThaiTaiKhoan) {
      return sendError(res, 403, 'Tài khoản đã bị khóa', 'ACCOUNT_LOCKED');
    }

    return sendSuccess(res, serializeUser(user), 'Lấy hồ sơ người dùng thành công');
  } catch (err) {
    console.error('Get current user error:', err);
    return sendError(res, 500, 'Lỗi hệ thống khi lấy hồ sơ người dùng', 'SERVER_ERROR');
  }
});

router.post('/logout', (_req, res) => {
  return sendSuccess(res, null, 'Đã đăng xuất');
});

router.post('/forgot-password', async (req, res) => {
  const phoneNumber = normalizeVietnamPhoneNumber(req.body?.phoneNumber);
  if (!phoneNumber) {
    return sendError(res, 400, 'phoneNumber là bắt buộc', 'VALIDATION_ERROR');
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return sendError(
      res,
      400,
      'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)',
      'VALIDATION_ERROR'
    );
  }

  try {
    const result = await query(
      `
        SELECT mataikhoan AS "MaTaiKhoan"
        FROM taikhoannguoidung
        WHERE sodienthoai = $1
      `,
      [phoneNumber]
    );

    if (result.rows.length === 0) {
      return sendError(res, 404, 'Tài khoản không tồn tại', 'NOT_FOUND');
    }

    const otp = generateOtpCode();
    const expiresInSeconds = 60;
    otpStore.set(phoneNumber, {
      otpHash: hashOtpCode(phoneNumber, otp),
      expiresAtMs: Date.now() + expiresInSeconds * 1000
    });

    console.log(`[OTP DEMO] ${phoneNumber}: ${otp}`);

    return sendSuccess(
      res,
      { expiresInSeconds },
      'Đã tạo mã OTP mới. Vui lòng xem log backend để lấy mã demo.'
    );
  } catch (err) {
    console.error('Forgot password error:', err);
    return sendError(res, 500, 'Lỗi hệ thống khi xử lý quên mật khẩu', 'SERVER_ERROR');
  }
});

router.post('/register', async (req, res) => {
  const { role, fullName, username, phoneNumber, password, cccd, licenseType } = req.body || {};
  const normalizedPhoneNumber = normalizeVietnamPhoneNumber(phoneNumber);
  const normalizedUsername = normalizeUsername(username);

  if (!role || !fullName || !normalizedUsername || !normalizedPhoneNumber || !password) {
    return sendError(res, 400, 'Thiếu thông tin bắt buộc', 'VALIDATION_ERROR');
  }

  if (!isValidUsername(normalizedUsername)) {
    return sendError(res, 400, 'Tên đăng nhập không đúng định dạng', 'VALIDATION_ERROR');
  }

  if (!isValidPhoneNumber(normalizedPhoneNumber)) {
    return sendError(
      res,
      400,
      'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)',
      'VALIDATION_ERROR'
    );
  }

  if (!isStrongPassword(password)) {
    return sendError(res, 400, STRONG_PASSWORD_MESSAGE, 'VALIDATION_ERROR');
  }

  const normalizedRole = role === 'driver' ? 'driver' : 'dispatcher';
  const roleLabel = normalizedRole === 'driver' ? DRIVER_ROLE : DISPATCHER_ROLE;

  if (normalizedRole === 'driver' && !isValidNationalId(cccd)) {
    return sendError(res, 400, 'CCCD không hợp lệ (12 chữ số)', 'VALIDATION_ERROR');
  }

  if (normalizedRole === 'driver' && !String(licenseType || '').trim()) {
    return sendError(res, 400, 'Vui lòng chọn loại bằng lái', 'VALIDATION_ERROR');
  }

  try {
    const createdPayload = await withTransaction(async (client) => {
      if (normalizedRole === 'driver') {
        const result = await createDriverWithAccount(client, {
          HoTen: String(fullName).trim(),
          SoDienThoai: normalizedPhoneNumber,
          CCCD: String(cccd).trim(),
          LoaiBangLai: licenseType ? String(licenseType).trim() : null,
          TrangThaiTaiXe: 'Rảnh',
          TenDangNhap: normalizedUsername,
          MatKhau: password
        });

        const createdUser = await loadUserByAccountId(result.account.MaTaiKhoan, client);
        return { user: serializeUser(createdUser) };
      }

      const hashedPassword = await hashPassword(password);

      const existingUser = await query(
        'SELECT 1 FROM taikhoannguoidung WHERE tendangnhap = $1 LIMIT 1',
        [normalizedUsername],
        client
      );

      if (existingUser.rows.length > 0) {
        throw Object.assign(new Error('Tên đăng nhập đã tồn tại'), { status: 409, code: 'CONFLICT' });
      }

      const existingPhone = await query(
        'SELECT 1 FROM taikhoannguoidung WHERE sodienthoai = $1 LIMIT 1',
        [normalizedPhoneNumber],
        client
      );

      if (existingPhone.rows.length > 0) {
        throw Object.assign(new Error('Số điện thoại đã tồn tại'), { status: 409, code: 'CONFLICT' });
      }

      const accountResult = await query(
        `
          INSERT INTO taikhoannguoidung (
            tendangnhap,
            matkhaumahoa,
            sodienthoai,
            vaitro,
            yeucaudoimatkhau
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING
            mataikhoan AS "MaTaiKhoan",
            tendangnhap AS "TenDangNhap",
            sodienthoai AS "SoDienThoai",
            vaitro AS "VaiTro",
            trangthaitaikhoan AS "TrangThaiTaiKhoan",
            yeucaudoimatkhau AS "YeuCauDoiMatKhau"
        `,
        [normalizedUsername, hashedPassword, normalizedPhoneNumber, roleLabel, false],
        client
      );

      const account = accountResult.rows[0];
      const dispatcherResult = await query(
        `
          INSERT INTO nhanviendieuphoi (hoten, sodienthoai, trangthai, mataikhoan)
          VALUES ($1, $2, $3, $4)
          RETURNING manhanvien AS "MaNhanVien"
        `,
        [fullName, normalizedPhoneNumber, 'Hoạt động', account.MaTaiKhoan],
        client
      );

      return {
        user: {
          MaTaiKhoan: account.MaTaiKhoan,
          TenDangNhap: account.TenDangNhap,
          VaiTro: account.VaiTro,
          TrangThaiTaiKhoan: account.TrangThaiTaiKhoan,
          YeuCauDoiMatKhau: Boolean(account.YeuCauDoiMatKhau),
          SoDienThoai: account.SoDienThoai,
          HoTen: fullName,
          MaTaiXe: null,
          MaNhanVien: dispatcherResult.rows[0]?.MaNhanVien
        }
      };
    });

    return sendSuccess(res, createdPayload, 'Đăng ký thành công', 201);
  } catch (err) {
    console.error('Register error:', err);
    return sendError(
      res,
      err.status || 500,
      err.message || 'Lỗi hệ thống khi đăng ký tài khoản',
      err.code || 'SERVER_ERROR'
    );
  }
});

router.post('/change-password-first-login', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');
  const fieldErrors = buildFirstLoginFieldErrors(newPassword, confirmPassword);

  if (!token) {
    return sendError(
      res,
      400,
      'Phiên đổi mật khẩu lần đầu không hợp lệ',
      'INVALID_PASSWORD_CHANGE_TOKEN'
    );
  }

  if (Object.keys(fieldErrors).length > 0) {
    return sendError(
      res,
      400,
      getFirstFieldErrorMessage(fieldErrors),
      'VALIDATION_ERROR',
      { fieldErrors }
    );
  }

  let payload;
  try {
    payload = verifyPasswordChangeToken(token);
  } catch (_error) {
    return sendError(
      res,
      401,
      'Phiên đổi mật khẩu lần đầu không hợp lệ hoặc đã hết hạn',
      'INVALID_PASSWORD_CHANGE_TOKEN'
    );
  }

  try {
    const user = await loadUserByAccountId(Number(payload.sub));

    if (!user) {
      return sendError(res, 404, 'Tài khoản không tồn tại', 'ACCOUNT_NOT_FOUND');
    }

    if (!user.TrangThaiTaiKhoan) {
      return sendError(res, 403, 'Tài khoản đã bị khóa', 'ACCOUNT_LOCKED');
    }

    if (!user.YeuCauDoiMatKhau) {
      return sendError(
        res,
        400,
        'Tài khoản không yêu cầu đổi mật khẩu lần đầu',
        'FIRST_LOGIN_PASSWORD_CHANGE_NOT_REQUIRED'
      );
    }

    const sameAsCurrentPassword = await verifyPassword(newPassword, user.MatKhauMaHoa);
    if (sameAsCurrentPassword) {
      return sendError(
        res,
        400,
        'Mật khẩu mới phải khác mật khẩu hiện tại',
        'VALIDATION_ERROR',
        { fieldErrors: { newPassword: 'Mật khẩu mới phải khác mật khẩu hiện tại' } }
      );
    }

    const hashedPassword = await hashPassword(newPassword);
    const lockColumn = await getAccountLockColumnName();
    await query(
      `
        UPDATE taikhoannguoidung
        SET matkhaumahoa = $1,
            yeucaudoimatkhau = FALSE,
            solandangnhapsai = 0,
            ${lockColumn} = NULL
        WHERE mataikhoan = $2
      `,
      [hashedPassword, user.MaTaiKhoan]
    );

    const refreshedUser = await loadUserByAccountId(user.MaTaiKhoan);
    const serializedUser = serializeUser(refreshedUser);

    return sendSuccess(
      res,
      {
        accessToken: signAccessToken(serializedUser),
        expiresIn: JWT_EXPIRES_IN,
        requirePasswordChange: false,
        user: serializedUser
      },
      'Đổi mật khẩu lần đầu thành công'
    );
  } catch (err) {
    console.error('First login password change error:', err);
    return sendError(res, 500, 'Lỗi hệ thống khi đổi mật khẩu lần đầu', 'SERVER_ERROR');
  }
});

router.post('/reset-password', async (req, res) => {
  const phoneNumber = normalizeVietnamPhoneNumber(req.body?.phoneNumber);
  const otp = String(req.body?.otp || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!phoneNumber || !otp || !newPassword) {
    return sendError(res, 400, 'phoneNumber, otp và newPassword là bắt buộc', 'VALIDATION_ERROR');
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return sendError(
      res,
      400,
      'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)',
      'VALIDATION_ERROR'
    );
  }

  const cachedOtp = otpStore.get(phoneNumber);
  if (!cachedOtp) {
    return sendError(res, 400, 'Chưa có OTP, vui lòng gửi OTP trước.', 'OTP_NOT_FOUND');
  }

  if (Date.now() > cachedOtp.expiresAtMs) {
    otpStore.delete(phoneNumber);
    return sendError(res, 400, 'Mã OTP đã hết hạn vui lòng gửi lại', 'OTP_EXPIRED');
  }

  if (hashOtpCode(phoneNumber, otp) !== cachedOtp.otpHash) {
    return sendError(res, 400, 'Mã OTP không đúng', 'OTP_INVALID');
  }

  if (!isStrongPassword(newPassword)) {
    return sendError(res, 400, STRONG_PASSWORD_MESSAGE, 'VALIDATION_ERROR');
  }

  try {
    const existing = await query(
      `
        SELECT
          mataikhoan AS "MaTaiKhoan",
          matkhaumahoa AS "MatKhauMaHoa"
        FROM taikhoannguoidung
        WHERE sodienthoai = $1
      `,
      [phoneNumber]
    );

    if (existing.rows.length === 0) {
      return sendError(res, 404, 'Tài khoản không tồn tại', 'NOT_FOUND');
    }

    const currentPassword = existing.rows[0].MatKhauMaHoa;
    const sameAsCurrentPassword = await verifyPassword(newPassword, currentPassword);
    if (sameAsCurrentPassword) {
      return sendError(res, 400, 'Nhập mật khẩu khác', 'VALIDATION_ERROR');
    }

    const hashedPassword = await hashPassword(newPassword);
    const lockColumn = await getAccountLockColumnName();

    await query(
      `
        UPDATE taikhoannguoidung
        SET matkhaumahoa = $1,
            yeucaudoimatkhau = FALSE,
            solandangnhapsai = 0,
            ${lockColumn} = NULL
        WHERE sodienthoai = $2
      `,
      [hashedPassword, phoneNumber]
    );

    otpStore.delete(phoneNumber);
    return sendSuccess(res, null, 'Đặt lại mật khẩu thành công');
  } catch (err) {
    console.error('Reset password error:', err);
    return sendError(res, 500, 'Lỗi hệ thống khi đặt lại mật khẩu', 'SERVER_ERROR');
  }
});

module.exports = router;
