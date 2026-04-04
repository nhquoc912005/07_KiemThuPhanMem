const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getPool } = require('./db');
const { requireAuth, requireRole } = require('./middleware/auth');
const { DISPATCHER_ROLE, ensurePasswordHashes } = require('./utils/auth');

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const vehicleRoutes = require('./routes/vehicles');
const driverRoutes = require('./routes/drivers');
const routeRoutes = require('./routes/routes');
const ticketRoutes = require('./routes/tickets');
const reportRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'DB connection failed', detail: err.message });
  }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', requireAuth, requireRole(DISPATCHER_ROLE), customerRoutes);
app.use('/api/v1/vehicles', requireAuth, requireRole(DISPATCHER_ROLE), vehicleRoutes);
app.use('/api/v1/drivers', requireAuth, requireRole(DISPATCHER_ROLE), driverRoutes);
app.use('/api/v1/routes', requireAuth, routeRoutes);
app.use('/api/v1/tickets', requireAuth, requireRole(DISPATCHER_ROLE), ticketRoutes);
app.use('/api/v1/reports', requireAuth, requireRole(DISPATCHER_ROLE), reportRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

const PORT = process.env.APP_PORT || 3000;

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
