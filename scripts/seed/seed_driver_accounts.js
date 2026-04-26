const { getPool, sql } = require('../../backend/src/db');
const { DRIVER_ROLE, hashPassword } = require('../../backend/src/utils/auth');

const DEFAULT_PASSWORD = '123456';
const USERNAME_PREFIX = 'taixe';

function buildUsernameSet(rows) {
  return new Set(rows.map((row) => String(row.TenDangNhap || '').toLowerCase()).filter(Boolean));
}

function getNextUsername(usedUsernames, nextIndexRef) {
  while (usedUsernames.has(`${USERNAME_PREFIX}${nextIndexRef.value}`)) {
    nextIndexRef.value += 1;
  }

  const username = `${USERNAME_PREFIX}${nextIndexRef.value}`;
  usedUsernames.add(username);
  nextIndexRef.value += 1;
  return username;
}

async function seedDriverAccounts() {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  const existingAccountResult = await pool.request().query(`
    SELECT TenDangNhap
    FROM TaiKhoanNguoiDung
    WHERE TenDangNhap LIKE '${USERNAME_PREFIX}%'
  `);
  const usedUsernames = buildUsernameSet(existingAccountResult.recordset);
  const nextIndexRef = { value: 1 };
  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

  await transaction.begin();

  try {
    const unlinkedDriversResult = await new sql.Request(transaction).query(`
      SELECT MaTaiXe, HoTen, SoDienThoai, CCCD, LoaiBangLai, TrangThaiTaiXe
      FROM TaiXe
      WHERE MaTaiKhoan IS NULL
      ORDER BY MaTaiXe
    `);

    if (unlinkedDriversResult.recordset.length === 0) {
      await transaction.commit();
      console.log('Khong co tai xe nao can tao them tai khoan.');
      return;
    }

    const createdAccounts = [];

    for (const driver of unlinkedDriversResult.recordset) {
      const username = getNextUsername(usedUsernames, nextIndexRef);

      const insertedAccount = await new sql.Request(transaction)
        .input('TenDangNhap', sql.VarChar(50), username)
        .input('MatKhauMaHoa', sql.VarChar(255), hashedPassword)
        .input('SoDienThoai', sql.VarChar(15), driver.SoDienThoai || null)
        .input('VaiTro', sql.NVarChar(30), DRIVER_ROLE)
        .input('YeuCauDoiMatKhau', sql.Bit, 0)
        .query(`
          INSERT INTO TaiKhoanNguoiDung (
            TenDangNhap,
            MatKhauMaHoa,
            SoDienThoai,
            VaiTro,
            TrangThaiTaiKhoan,
            YeuCauDoiMatKhau
          )
          OUTPUT INSERTED.MaTaiKhoan, INSERTED.TenDangNhap
          VALUES (@TenDangNhap, @MatKhauMaHoa, @SoDienThoai, @VaiTro, 1, @YeuCauDoiMatKhau)
        `);

      const account = insertedAccount.recordset[0];

      await new sql.Request(transaction)
        .input('MaTaiXe', sql.Int, driver.MaTaiXe)
        .input('MaTaiKhoan', sql.Int, account.MaTaiKhoan)
        .query(`
          UPDATE TaiXe
          SET MaTaiKhoan = @MaTaiKhoan
          WHERE MaTaiXe = @MaTaiXe
        `);

      createdAccounts.push({
        MaTaiXe: driver.MaTaiXe,
        HoTen: driver.HoTen,
        SoDienThoai: driver.SoDienThoai,
        TenDangNhap: account.TenDangNhap,
        MatKhau: DEFAULT_PASSWORD
      });
    }

    await transaction.commit();

    console.log(JSON.stringify(createdAccounts, null, 2));
  } catch (error) {
    if (transaction._aborted !== true) {
      await transaction.rollback();
    }
    throw error;
  }
}

seedDriverAccounts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Loi tao tai khoan tai xe:', error);
    process.exit(1);
  });
