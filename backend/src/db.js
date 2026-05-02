const { Pool, types } = require('pg');
require('dotenv').config();

types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000
});

const ROW_KEY_ALIASES = {
  machitiet: 'MaChiTiet',
  makhachhang: 'MaKhachHang',
  maloTrinh: 'MaLoTrinh',
  malotrinh: 'MaLoTrinh',
  manhanvien: 'MaNhanVien',
  manhanvientaixe: 'MaNhanVienTaiXe',
  mataikhoan: 'MaTaiKhoan',
  mataixe: 'MaTaiXe',
  mave: 'MaVe',
  maxe: 'MaXe',
  biensO: 'BienSo',
  bienso: 'BienSo',
  cccd: 'CCCD',
  diachidon: 'DiaChiDon',
  diachidondlat: 'DiaChiDonLat',
  diachidondlng: 'DiaChiDonLng',
  diachidonlat: 'DiaChiDonLat',
  diachidonlng: 'DiaChiDonLng',
  diachitra: 'DiaChiTra',
  diachitralat: 'DiaChiTraLat',
  diachitralng: 'DiaChiTraLng',
  diemdOn: 'DiemDon',
  diemdon: 'DiemDon',
  diemdonlat: 'DiemDonLat',
  diemdonlng: 'DiemDonLng',
  diemtra: 'DiemTra',
  diemtralat: 'DiemTraLat',
  diemtralng: 'DiemTraLng',
  ghichu: 'GhiChu',
  hoten: 'HoTen',
  khunggiotrungchuyen: 'KhungGioTrungChuyen',
  khoatamthoideluc: 'KhoaTamThoiDenLuc',
  khoatamthoidenluc: 'KhoaTamThoiDenLuc',
  loaibanglai: 'LoaiBangLai',
  loaixe: 'LoaiXe',
  lotrinhdukien: 'LoTrinhDuKien',
  matkhauhoA: 'MatKhauMaHoa',
  matkhaumahoa: 'MatKhauMaHoa',
  quangduongdukien: 'QuangDuongDuKien',
  sochO: 'SoCho',
  socho: 'SoCho',
  sodienthoai: 'SoDienThoai',
  sodienthoaitaixe: 'SoDienThoaiTaiXe',
  solandangnhapsai: 'SoLanDangNhapSai',
  soluongghe: 'SoLuongGhe',
  taikhoandangnhap: 'TaiKhoanDangNhap',
  tendangnhap: 'TenDangNhap',
  tenkhachhang: 'TenKhachHang',
  tennhanvien: 'TenNhanVien',
  tentaixe: 'TenTaiXe',
  thoigianbatdau: 'ThoiGianBatDau',
  thoigiandukien: 'ThoiGianDuKien',
  thoigiandondukien: 'ThoiGianDonDuKien',
  thoigianketthuc: 'ThoiGianKetThuc',
  trangthai: 'TrangThai',
  trangthaikhach: 'TrangThaiKhach',
  trangthailotrinh: 'TrangThaiLoTrinh',
  trangthaitaikhoan: 'TrangThaiTaiKhoan',
  trangthaitaixe: 'TrangThaiTaiXe',
  trangthaive: 'TrangThaiVe',
  trangthaixe: 'TrangThaiXe',
  thutudontra: 'ThuTuDonTra',
  tongghe: 'TongGhe',
  vaitro: 'VaiTro',
  yeucaudoimatkhau: 'YeuCauDoiMatKhau',

  conflictcount: 'ConflictCount',
  driverid: 'driverId',
  employeecodecount: 'EmployeeCodeCount',
  externalcustomercode: 'ExternalCustomerCode',
  externalcustomerid: 'ExternalCustomerId',
  externalcustomername: 'ExternalCustomerName',
  externalcustomerphone: 'ExternalCustomerPhone',
  externaldropoff: 'ExternalDropoff',
  externalpickup: 'ExternalPickup',
  khuvuc: 'KhuVuc',
  latesteventid: 'latestEventId',
  nationalidcount: 'NationalIdCount',
  ngay: 'Ngay',
  phonecount: 'PhoneCount',
  routeplanid: 'routePlanId',
  sokhach: 'SoKhach',
  sodiemdOntra: 'SoDiemDonTra',
  sodiemdontra: 'SoDiemDonTra',
  thongkexetrong: 'ThongKeXeTrong'
};

function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PostgreSQL/Supabase connection');
  }
}

function normalizeRowKeys(row) {
  const normalized = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[ROW_KEY_ALIASES[key] || key] = value;
  }

  return normalized;
}

async function query(text, params = [], client = null) {
  ensureDatabaseUrl();
  const executor = client || pool;
  const result = await executor.query(text, params);
  return {
    ...result,
    rows: result.rows.map(normalizeRowKeys)
  };
}

async function withTransaction(callback) {
  ensureDatabaseUrl();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function testConnection() {
  await query('SELECT 1 AS ok');
  return true;
}

function createCompatType(name) {
  const type = () => name;
  type.type = name;
  return type;
}

function normalizeTypeArgs(_typeOrValue, value) {
  return value === undefined ? _typeOrValue : value;
}

function convertNamedSql(text, paramsByName) {
  const values = [];
  const indexes = new Map();
  let pendingLimitName = null;
  let pgText = String(text)
    .replace(/\bN'/g, "'")
    .replace(/\bGETDATE\(\)/gi, 'NOW()')
    .replace(/\bDATETIME2?\b/gi, 'timestamp')
    .replace(/\bSELECT\s+TOP\s+1\s+/gi, 'SELECT ')
    .replace(/\bSELECT\s+TOP\s+\(@(\w+)\)\s+/gi, (_match, name) => {
      pendingLimitName = name;
      return 'SELECT ';
    });

  let returningClause = '';
  pgText = pgText.replace(/OUTPUT\s+INSERTED\.([A-Za-z0-9_]+(?:\s*,\s*INSERTED\.[A-Za-z0-9_]+)*)/gi, (_match, columns) => {
    returningClause = ` RETURNING ${columns.replace(/INSERTED\./gi, '').trim()}`;
    return '';
  });

  pgText = pgText.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name) => {
    if (!indexes.has(name)) {
      indexes.set(name, values.length + 1);
      values.push(paramsByName.get(name));
    }

    return `$${indexes.get(name)}`;
  });

  if (returningClause && !/\bRETURNING\b/i.test(pgText)) {
    pgText = `${pgText.trim()}${returningClause}`;
  }

  if (pendingLimitName) {
    if (!indexes.has(pendingLimitName)) {
      indexes.set(pendingLimitName, values.length + 1);
      values.push(paramsByName.get(pendingLimitName));
    }

    pgText = `${pgText.trim()} LIMIT $${indexes.get(pendingLimitName)}`;
  }

  return { text: pgText, values };
}

class PgCompatRequest {
  constructor(executor = null) {
    this.executor = executor;
    this.params = new Map();
  }

  input(name, typeOrValue, value) {
    this.params.set(name, normalizeTypeArgs(typeOrValue, value));
    return this;
  }

  async query(text) {
    const converted = convertNamedSql(text, this.params);
    const result = await query(converted.text, converted.values, this.executor?.client || this.executor || null);
    return {
      ...result,
      recordset: result.rows,
      rowsAffected: [result.rowCount]
    };
  }
}

class PgCompatTransaction {
  constructor() {
    this.client = null;
    this._aborted = false;
  }

  async begin() {
    ensureDatabaseUrl();
    this.client = await pool.connect();
    await this.client.query('BEGIN');
  }

  async commit() {
    if (!this.client) {
      return;
    }

    await this.client.query('COMMIT');
    this.client.release();
    this.client = null;
  }

  async rollback() {
    if (!this.client) {
      return;
    }

    this._aborted = true;
    await this.client.query('ROLLBACK');
    this.client.release();
    this.client = null;
  }
}

class PgCompatConnectionPool {
  async connect() {
    ensureDatabaseUrl();
    return pool;
  }

  request() {
    return new PgCompatRequest(pool);
  }

  async close() {
    await pool.end();
  }
}

pool.request = () => new PgCompatRequest(pool);

const sql = {
  BigInt: createCompatType('bigint'),
  Bit: createCompatType('boolean'),
  ConnectionPool: PgCompatConnectionPool,
  connect: async () => {
    ensureDatabaseUrl();
    return pool;
  },
  DateTime: createCompatType('timestamp'),
  DateTime2: createCompatType('timestamp'),
  Decimal: () => 'numeric',
  Int: createCompatType('integer'),
  MAX: 'max',
  NVarChar: createCompatType('text'),
  Request: PgCompatRequest,
  Transaction: PgCompatTransaction,
  VarChar: createCompatType('text')
};

function getPool() {
  ensureDatabaseUrl();
  return pool;
}

module.exports = {
  getPool,
  pool,
  query,
  sql,
  testConnection,
  withTransaction
};
