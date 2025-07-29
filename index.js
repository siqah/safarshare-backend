const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const rideRoutes = require('./routes/rides');
const bookingRoutes = require('./routes/bookings');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const driverRoutes = require('./routes/driver');

const app = express();
const server = http.createServer(app);

// MongoDB Atlas Connection Function
const connectDB = async () => {
  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    console.log('📍 Connection URI:', process.env.MONGODB_URI ? 'URI found' : 'URI missing');
    
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10, 
      minPoolSize: 1, 
      maxIdleTimeMS: 30000, 
      family: 4 
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    console.log('✅ MongoDB Atlas Connected Successfully!');
    console.log(`📂 Database: ${conn.connection.name}`);
    console.log(`🌐 Host: ${conn.connection.host}`);
    console.log(`🔌 Port: ${conn.connection.port}`);
    console.log(`📊 Ready State: ${conn.connection.readyState}`);

  } catch (error) {
    console.error('❌ MongoDB Atlas connection failed:', error.message);
    process.exit(1);
  }
};

// Connection event handlers
mongoose.connection.on('connected', () => {
  console.log('🟢 Mongoose connected to MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 Mongoose connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('🟡 Mongoose disconnected from MongoDB Atlas');
});

// MIDDLEWARE CONFIGURATION (IMPORTANT: ORDER MATTERS!)

// 1. Security middleware first
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// 2. CORS Configuration - SECURE FOR PRODUCTION
app.use(cors({
  origin: function (origin, callback) {
    // In development, log CORS checks
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 CORS Check - Origin:', origin);
    }
    
    // Allow requests with no origin (mobile apps, server-to-server, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Remove trailing slash from origin for comparison
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    const allowedOrigins = [
      // Development origins
      ...(process.env.NODE_ENV === 'development' ? [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000'
      ] : []),
      // Production origins
      'https://safarishare.netlify.app',
      'https://safarishare-app.netlify.app',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    // Check if normalized origin is in allowed list
    if (allowedOrigins.includes(normalizedOrigin)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Origin allowed:', normalizedOrigin);
      }
      return callback(null, true);
    }
    
    // Allow netlify.app subdomains in production
    if (normalizedOrigin.endsWith('.netlify.app')) {
      return callback(null, true);
    }
    
    // Block unauthorized origins in production
    if (process.env.NODE_ENV === 'production') {
      console.warn('🚫 CORS blocked origin:', normalizedOrigin);
      return callback(new Error('Not allowed by CORS'));
    }
    
    // Allow all in development
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Length'],
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// 3. Additional CORS headers middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (origin) {
    const normalizedOrigin = origin.replace(/\/$/, '');
    res.header('Access-Control-Allow-Origin', normalizedOrigin);
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling preflight request for:', req.url);
    return res.sendStatus(200);
  }
  
  next();
});

// 4. Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 500, // Stricter in production
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: Math.ceil(15 * 60)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // No skipping in production
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && req.path.startsWith('/api/auth/');
  }
});

app.use(limiter);

// 5. Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 6. Request logging
// Request logging - minimal in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Origin:', req.headers.origin);
  }
  next();
});

// Socket.IO Configuration
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      
      const normalizedOrigin = origin.replace(/\/$/, '');
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://safarishare.netlify.app'
      ];
      
      if (allowedOrigins.includes(normalizedOrigin) || normalizedOrigin.endsWith('.netlify.app')) {
        return callback(null, true);
      }
      
      return callback(null, true);
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Initialize MongoDB Connection
connectDB();

// Socket.IO authentication middleware
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      console.log(`User ${decoded.userId} authenticated for socket ${socket.id}`);
    }
    next();
  } catch (err) {
    console.log('Socket auth error:', err.message);
    next();
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('User connected:', socket.id, 'User ID:', socket.userId);
  }

  if (socket.userId) {
    socket.join(`user_${socket.userId}`);
    if (process.env.NODE_ENV === 'development') {
      console.log(`User ${socket.userId} joined their personal room`);
    }
    socket.broadcast.emit('user-online', socket.userId);
  }

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room: ${roomId}`);
  });

  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    console.log(`Socket ${socket.id} left room: ${roomId}`);
  });

  socket.on('send-message', (data) => {
    console.log('Message data received:', data);
    
    if (!data.receiverId || !data.message) {
      console.error('Invalid message data:', data);
      return;
    }

    socket.to(`user_${data.receiverId}`).emit('new-message', {
      message: data.message,
      sender: data.sender,
      timestamp: new Date()
    });

    console.log(`Message sent from ${socket.userId} to user_${data.receiverId}`);
  });

  socket.on('send-notification', (data) => {
    console.log('Notification data:', data);
    
    if (!data.userId || !data.notification) {
      console.error('Invalid notification data:', data);
      return;
    }

    socket.to(`user_${data.userId}`).emit('new-notification', {
      notification: data.notification,
      timestamp: new Date()
    });

    console.log(`Notification sent to user_${data.userId}`);
  });

  socket.on('join-ride', (rideId) => {
    socket.join(`ride_${rideId}`);
    console.log(`Socket ${socket.id} joined ride ${rideId}`);
  });

  socket.on('leave-ride', (rideId) => {
    socket.leave(`ride_${rideId}`);
    console.log(`Socket ${socket.id} left ride ${rideId}`);
  });

  socket.on('booking-update', (data) => {
    socket.to(`ride_${data.rideId}`).emit('booking-status-changed', data);
    
    if (data.driverId) {
      socket.to(`user_${data.driverId}`).emit('booking-status-changed', data);
    }
    if (data.passengerId) {
      socket.to(`user_${data.passengerId}`).emit('booking-status-changed', data);
    }
  });

  socket.on('typing-start', (data) => {
    socket.to(`user_${data.receiverId}`).emit('user-typing', {
      userId: socket.userId,
      isTyping: true
    });
  });

  socket.on('typing-stop', (data) => {
    socket.to(`user_${data.receiverId}`).emit('user-typing', {
      userId: socket.userId,
      isTyping: false
    });
  });

  socket.on('error', (error) => {
    console.error('Socket error for user', socket.userId, ':', error);
  });

  socket.on('disconnect', (reason) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`User disconnected: ${socket.id}, User ID: ${socket.userId}, Reason: ${reason}`);
    }
    
    if (socket.userId) {
      socket.broadcast.emit('user-offline', socket.userId);
    }
  });

  socket.on('ping', () => {
    socket.emit('pong');
  });
});

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/driver', driverRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: "SafariShare Backend is running ✅" });
});

// Health check endpoints
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusText = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
    database: {
      status: dbStatusText[dbStatus],
      readyState: dbStatus,
      host: mongoose.connection.host,
      name: mongoose.connection.name
    }
  });
});

app.get('/api/socket/health', (req, res) => {
  res.json({
    status: 'OK',
    connectedClients: io.engine.clientsCount,
    rooms: Object.keys(io.sockets.adapter.rooms),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/db/health', async (req, res) => {
  try {
    const adminDb = mongoose.connection.db.admin();
    const result = await adminDb.ping();
    
    res.json({
      status: 'OK',
      database: 'connected',
      ping: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add these endpoints after your existing health check endpoints (around line 420):

// Keep-alive endpoint for preventing sleep
app.get('/keep-alive', (req, res) => {
  const uptimeMinutes = Math.floor(process.uptime() / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const remainingMinutes = uptimeMinutes % 60;
  
  res.json({ 
    message: 'Server is alive and healthy',
    uptime: {
      minutes: uptimeMinutes,
      readable: uptimeHours > 0 ? `${uptimeHours}h ${remainingMinutes}m` : `${remainingMinutes}m`
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    },
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    connections: io.engine.clientsCount
  });
});

// Wake-up endpoint for cold starts
app.get('/wake-up', (req, res) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🌅 Wake-up call received');
  }
  
  res.json({ 
    message: 'Backend is awake!',
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    ready: true
  });
});

// Simple ping endpoint
app.get('/ping', (req, res) => {
  res.json({ 
    pong: true, 
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// Status endpoint with minimal info
app.get('/status', (req, res) => {
  res.json({ 
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    success: false,
    message: 'Route not found',
    path: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error occurred:', err);
  console.error('Stack:', err.stack);
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({ 
    success: false,
    message: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5001;

// Start server
const startServer = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔌 Socket.IO server ready`);
      console.log(`🌐 API URL: http://localhost:${PORT}`);
      console.log(`📱 Client URL: ${process.env.CLIENT_URL}`);
      console.log(`🗄️ Database: Connected to MongoDB Atlas`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('🔴 Server closed');
    mongoose.connection.close(false, () => {
      console.log('🔴 MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('🔴 Server closed');
    mongoose.connection.close(false, () => {
      console.log('🔴 MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('unhandledRejection', (err, promise) => {
  console.error('🔴 Unhandled Promise Rejection:', err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Start the server
startServer();

module.exports = { app, io };