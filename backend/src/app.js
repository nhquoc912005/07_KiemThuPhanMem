const express = require('express');
const cors = require('cors');

const { testConnection } = require('./db');
const { requireAuth, requireRole } = require('./middleware/auth');
const { DISPATCHER_ROLE } = require('./utils/auth');

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const vehicleRoutes = require('./routes/vehicles');
const driverRoutes = require('./routes/drivers');
const routeRoutes = require('./routes/routes');
const routePlanRoutes = require('./routes/route-plans');
const ticketRoutes = require('./routes/tickets');
const reportRoutes = require('./routes/reports');

const ALLOWED_DEV_PORTS = new Set(['3000', '5173']);

function isIpv4Host(hostname) {
  const parts = String(hostname || '').trim().split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return false;
  }

  return parts.every((part) => {
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function isAllowedDevOrigin(origin) {
  if (!origin) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    const hostname = String(parsedOrigin.hostname || '').trim().toLowerCase();
    const port = String(parsedOrigin.port || (parsedOrigin.protocol === 'https:' ? '443' : '80'));

    if (!ALLOWED_DEV_PORTS.has(port)) {
      return false;
    }

    return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || isIpv4Host(hostname);
  } catch {
    return false;
  }
}

function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedDevOrigin(origin)) {
          return callback(null, true);
        }

        return callback(null, false);
      }
    })
  );
  app.use(express.json());

  app.get('/health', async (req, res) => {
    try {
      await testConnection();
      res.json({ status: 'ok', db: 'connected' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: 'DB connection failed', detail: err.message });
    }
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/customers', requireAuth, requireRole(DISPATCHER_ROLE), customerRoutes);
  app.use('/api/v1/vehicles', requireAuth, requireRole(DISPATCHER_ROLE), vehicleRoutes);
  app.use('/api/v1/drivers', requireAuth, requireRole(DISPATCHER_ROLE), driverRoutes);
  app.use('/api/v1/route-plans', requireAuth, requireRole(DISPATCHER_ROLE), routePlanRoutes);
  app.use('/api/v1/routes', requireAuth, routeRoutes);
  app.use('/api/v1/tickets', requireAuth, requireRole(DISPATCHER_ROLE), ticketRoutes);
  app.use('/api/v1/reports', requireAuth, requireRole(DISPATCHER_ROLE), reportRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: 'Not found' });
  });

  return app;
}

module.exports = { createApp };
