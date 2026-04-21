const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { getPool, sql } = require('../db');

const DRIVER_ROLE = 'Tài xế';
const DISPATCHER_ROLE = 'Nhân viên điều phối';
const AUTH_ROLES = [DRIVER_ROLE, DISPATCHER_ROLE];
const PASSWORD_SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const PASSWORD_CHANGE_TOKEN_EXPIRES_IN =
  process.env.PASSWORD_CHANGE_TOKEN_EXPIRES_IN || '15m';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'trung-chuyen-demo-secret';
}

function looksLikeBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
}

async function hashPassword(password) {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  if (!looksLikeBcryptHash(passwordHash)) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}

function buildAuthPayload(user) {
  return {
    sub: String(user.MaTaiKhoan),
    TenDangNhap: user.TenDangNhap,
    VaiTro: user.VaiTro,
    MaTaiXe: user.MaTaiXe || null,
    MaNhanVien: user.MaNhanVien || null
  };
}

function signAccessToken(user) {
  return jwt.sign(buildAuthPayload(user), getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN
  });
}

function signPasswordChangeToken(user) {
  return jwt.sign(
    {
      sub: String(user.MaTaiKhoan),
      TenDangNhap: user.TenDangNhap,
      type: 'FIRST_LOGIN_PASSWORD_CHANGE'
    },
    getJwtSecret(),
    {
      expiresIn: PASSWORD_CHANGE_TOKEN_EXPIRES_IN
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}

function verifyPasswordChangeToken(token) {
  const payload = jwt.verify(token, getJwtSecret());
  if (payload?.type !== 'FIRST_LOGIN_PASSWORD_CHANGE') {
    throw new Error('INVALID_PASSWORD_CHANGE_TOKEN');
  }

  return payload;
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtpCode(phoneNumber, otp) {
  return crypto
    .createHash('sha256')
    .update(`${phoneNumber}:${otp}:${getJwtSecret()}`)
    .digest('hex');
}

async function ensurePasswordHashes() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT MaTaiKhoan, MatKhauMaHoa
    FROM TaiKhoanNguoiDung
  `);

  let updatedCount = 0;
  for (const row of result.recordset) {
    const storedPassword = String(row.MatKhauMaHoa || '');
    if (!storedPassword || looksLikeBcryptHash(storedPassword)) {
      continue;
    }

    const hashedPassword = await hashPassword(storedPassword);
    await pool
      .request()
      .input('MaTaiKhoan', sql.Int, row.MaTaiKhoan)
      .input('MatKhauMaHoa', sql.VarChar(255), hashedPassword)
      .query(`
        UPDATE TaiKhoanNguoiDung
        SET MatKhauMaHoa = @MatKhauMaHoa
        WHERE MaTaiKhoan = @MaTaiKhoan
      `);

    updatedCount += 1;
  }

  return updatedCount;
}

module.exports = {
  AUTH_ROLES,
  DISPATCHER_ROLE,
  DRIVER_ROLE,
  JWT_EXPIRES_IN,
  PASSWORD_CHANGE_TOKEN_EXPIRES_IN,
  ensurePasswordHashes,
  generateOtpCode,
  hashOtpCode,
  hashPassword,
  looksLikeBcryptHash,
  signAccessToken,
  signPasswordChangeToken,
  verifyAccessToken,
  verifyPassword,
  verifyPasswordChangeToken
};
