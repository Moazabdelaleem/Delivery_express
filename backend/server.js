const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const { Server } = require('socket.io');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const orderRoutes = require('./routes/order.routes');
const walletRoutes = require('./routes/wallet.routes');
const paymentRoutes = require('./routes/payment.routes');
const returnRoutes = require('./routes/return.routes');
const shiftRoutes = require('./routes/shift.routes');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Dynamic Origin Configuration for Production & Development
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : '*';

const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};

let io = null;
if (process.env.VERCEL !== '1') {
  io = new Server(server, {
    cors: corsOptions
  });

  const { bufferEvent, replayPendingEvents, extractUserId } = require('./utils/socketReplay');

  app.set('io', io);
  app.set('bufferEvent', bufferEvent);

  // Track active driver location timestamps for 2-minute watchdog
  const driverLastSeenMap = new Map();

  io.on('connection', (socket) => {
    const userId = extractUserId(socket);
    // Also extract role from JWT to place socket in a role-specific room
    let userRole = null;
    try {
      const token = socket.handshake?.auth?.token || socket.handshake?.query?.token;
      if (token) {
        const jwt = require('jsonwebtoken');
        const DEFAULT_JWT_SECRET = '9bda240f68c7f20f9c3ec80fc52b90aa737e1eeaeded48f07fff226ad153d48a66678539e24d82dd7cf55abb01a4d8aa89c7128b2f7a1dc7019e5ef507bf0aaf';
        const decoded = jwt.verify(token, process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
        userRole = decoded?.role || null;
      }
    } catch (_) {}

    if (userId) {
      socket.userId = userId;
      socket.join(`user_${userId}`);
      if (userRole) socket.join(`role_${userRole}`);
      console.log(`⚡ Socket client connected: ${socket.id} (User ID: ${userId}, Role: ${userRole || 'unknown'})`);
      replayPendingEvents(socket, userId);
    } else {
      console.log('⚡ Socket client connected:', socket.id, '(Unauthenticated)');
    }

    socket.on('identify', (data) => {
      const id = data?.userId || data?.user_id || extractUserId({ handshake: { auth: { token: data?.token } } });
      let role = data?.role;
      if (!role && data?.token) {
        try {
          const jwt = require('jsonwebtoken');
          const DEFAULT_JWT_SECRET = '9bda240f68c7f20f9c3ec80fc52b90aa737e1eeaeded48f07fff226ad153d48a66678539e24d82dd7cf55abb01a4d8aa89c7128b2f7a1dc7019e5ef507bf0aaf';
          const decoded = jwt.verify(data.token, process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
          role = decoded?.role;
        } catch (_) {}
      }
      if (id) {
        socket.userId = id;
        socket.join(`user_${id}`);
        if (role) socket.join(`role_${role}`);
        console.log(`🔑 Socket client identified: ${socket.id} (User ID: ${id}, Role: ${role || 'unknown'})`);
        replayPendingEvents(socket, id);
      }
    });

    socket.on('driver_location_updated', async (data) => {
      const driverId = data?.delivery_guy_id || socket.userId;
      if (driverId) {
        try {
          const shiftCheck = await db.query(
            `SELECT id FROM driver_shifts WHERE delivery_guy_id = $1 AND clock_out_at IS NULL`,
            [driverId]
          );
          if (shiftCheck.rows.length > 0) {
            driverLastSeenMap.set(driverId, {
              driver_id: driverId,
              driver_name: data.driver_name || 'Driver',
              last_seen_at: Date.now(),
              lat: data.lat,
              lng: data.lng
            });
            // Only broadcast GPS to supervisors and managers — not all connected users
            io.to('role_supervisor').to('role_manager').emit('driver_location_updated', data);
          } else {
            console.warn(`⚠️ Rejected socket location update for driver ${driverId}: No active shift`);
          }
        } catch (err) {
          console.error('Error verifying shift for socket location update:', err.message);
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket client disconnected:', socket.id, socket.userId ? `(User ID: ${socket.userId})` : '');
    });
  });

  // 2-Minute GPS Disconnection Watchdog Check (runs every 30 seconds)
  setInterval(async () => {
    const TWO_MINUTES_MS = 2 * 60 * 1000;
    const now = Date.now();

    for (const [driverId, info] of driverLastSeenMap.entries()) {
      if (now - info.last_seen_at > TWO_MINUTES_MS && !info.disconnected_alert_sent) {
        info.disconnected_alert_sent = true;
        console.warn(`⚠️ GPS signal lost for active driver '${info.driver_name}' (ID: ${driverId}) for > 2 minutes.`);
        // Only notify supervisors and managers, not all users
        io.to('role_supervisor').to('role_manager').emit('gps_disconnected', {
          delivery_guy_id: driverId,
          driver_name: info.driver_name,
          last_seen_at: new Date(info.last_seen_at).toISOString(),
          message: `GPS signal lost for driver ${info.driver_name} (no updates for >2 minutes).`
        });
      }
    }
  }, 30000);
} else {
  app.set('io', null);
  app.set('bufferEvent', () => {});
}

// Middleware
app.use(cors(corsOptions));
// Security headers (helmet) — disable contentSecurityPolicy for API-only backend
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const authController = require('./controllers/auth.controller');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/shifts', shiftRoutes);

const auth = require('./middleware/auth');

// Push Token Storage (POST /api/users/push-token)
app.post('/api/users/push-token', auth, authController.savePushToken);

// Seed Demo Accounts (POST /api/seed) — only available in non-production environments
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.post('/api/seed', authController.seedDemoAccounts);
  // Auto-seed demo accounts on startup
  authController.seedDemoAccounts().catch(err => console.error('Auto-seed error:', err));
}


// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});




// Global Express Error Handler
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled Global Express Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'An internal server error occurred.'
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception thrown:', err);
});

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
  console.warn('⚠️ DATABASE_URL environment variable is missing on server.');
}

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET environment variable is missing on server.');
}

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`🚀 Delivery Express Backend & Socket Server running on port ${PORT}`);
  });
}

module.exports = app;

