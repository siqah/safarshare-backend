const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
require('dotenv').config({ path: '.env' });

const { connectDB, disconnectDB } = require('./config/db');
const { createSocket } = require('./config/socket');

const rideRoutes = require('./routes/rides');
const bookingRoutes = require('./routes/bookings');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const usersRoutes = require('./routes/users');
const accountRoutes = require('./routes/account');

const app = express();
const server = http.createServer(app);

const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 5001;

// Security + parsers
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS (simple)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const o = origin.replace(/\/$/, '');
      if (isDev || allowedOrigins.includes(o) || o.endsWith('.netlify.app')) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-User-Id']
  })
);

// Minimal request log in dev
if (isDev) {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}

// Init Socket.IO and expose to routes
const io = createSocket(server, { allowedOrigins, isDev });
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/rides', rideRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/account', accountRoutes);

// Basic endpoints
app.get('/', (_req, res) => res.json({ message: 'SafariShare Backend is running' }));
app.get('/api/health', (_req, res) => {
  const s = mongoose.connection.readyState;
  res.json({
    status: s === 1 ? 'OK' : 'DEGRADED',
    db: s
  });
});

// 404 + error handlers
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ success: false, message: 'Internal server error' });
});

// Start
const startServer = async () => {
  try {
    await connectDB(process.env.MONGODB_URI);
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (e) {
    console.error('Failed to start server:', e.message);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down...');
  server.close(async () => {
    try {
      await disconnectDB();
    } finally {
      process.exit(0);
    }
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer();

module.exports = { app, io };
