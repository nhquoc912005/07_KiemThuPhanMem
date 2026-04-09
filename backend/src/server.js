require('dotenv').config();

const { getPool } = require('./db');
const { ensurePasswordHashes } = require('./utils/auth');
const { createApp } = require('./app');

const PORT = process.env.APP_PORT || 3000;
const app = createApp();

getPool()
  .then(async () => {
    const migratedCount = await ensurePasswordHashes();
    if (migratedCount > 0) {
      console.log(`Migrated ${migratedCount} account password(s) to bcrypt hashes`);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`API server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server due to DB error:', err);
    process.exit(1);
  });
