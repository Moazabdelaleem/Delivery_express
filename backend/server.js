const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const db = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const orderRoutes = require('./routes/order.routes');
const walletRoutes = require('./routes/wallet.routes');

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

// Socket.io Setup
const io = new Server(server, {
  cors: corsOptions
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('⚡ Socket client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('🔌 Socket client disconnected:', socket.id);
  });
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wallets', walletRoutes);

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
  throw new Error('DATABASE_URL environment variable is required.');
}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required.');
}

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`🚀 Delivery Express Backend & Socket Server running on port ${PORT}`);
  });
}

module.exports = app;

