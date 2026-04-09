const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.SQL_SERVER || 'localhost',
  port: Number(process.env.SQL_PORT) || 1433,
  database: process.env.SQL_DATABASE || 'TrungChuyenDB',
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: process.env.SQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true'
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise;

async function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

module.exports = {
  sql,
  getPool
};

