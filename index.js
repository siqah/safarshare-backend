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
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

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
    
    // Detailed error analysis
    if (error.name === 'MongooseServerSelectionError') {
      console.error('\n🔍 Possible solutions:');
      console.error('1. Check if your IP is whitelisted in MongoDB Atlas');
      console.error('2. Verify your username and password in the connection string');
      console.error('3. Ensure your cluster is not paused');
      console.error('4. Check your internet connection');
      console.error('5. Try allowing access from anywhere (0.0.0.0/0) in Network Access');
    }
    
    if (error.name === 'MongoParseError') {
      console.error('\n🔍 Connection string format error:');
      console.error('- Check if the connection string is properly formatted');
      console.error('- Ensure special characters in password are URL encoded');
    }
    
    console.error('\n💡 Quick fixes:');
    console.error('1. Go to MongoDB Atlas → Network Access → Add IP Address → Allow Access from Anywhere');
    console.error('2. Wait 1-2 minutes for changes to propagate');
    console.error('3. Restart this server');
    
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

mongoose.connection.on('reconnected', () => {
  console.log('🔄 Mongoose reconnected to MongoDB Atlas');
});

// Handle connection interruption
mongoose.connection.on('close', () => {
  console.log('🔴 MongoDB Atlas connection closed');
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));

// Rate limiting - Make it more lenient
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to 500 requests per windowMs
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: Math.ceil(15 * 60) // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for certain routes during development
  skip: (req) => {
    if (process.env.NODE_ENV === 'development') {
      // Skip rate limiting for auth routes to prevent login issues
      return req.path.startsWith('/api/auth/');
    }
    return false;
  }
});

// Apply less restrictive rate limiting
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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
    // Allow connection even without auth, but don't set userId
    next();
  }
});

// Socket.io for real-time features
io.on('connection', (socket) => {
  console.log('User connected:', socket.id, 'User ID:', socket.userId);

  // Join user to their personal room when they connect
  if (socket.userId) {
    socket.join(`user_${socket.userId}`);
    console.log(`User ${socket.userId} joined their personal room`);
    
    // Notify user they're online
    socket.broadcast.emit('user-online', socket.userId);
  }

  // Handle joining specific rooms (like ride rooms)
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room: ${roomId}`);
  });

  // Handle leaving specific rooms
  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    console.log(`Socket ${socket.id} left room: ${roomId}`);
  });

  // Handle sending messages
  socket.on('send-message', (data) => {
    console.log('Message data received:', data);
    
    // Validate message data
    if (!data.receiverId || !data.message) {
      console.error('Invalid message data:', data);
      return;
    }

    // Emit to the receiver's personal room
    socket.to(`user_${data.receiverId}`).emit('new-message', {
      message: data.message,
      sender: data.sender,
      timestamp: new Date()
    });

    console.log(`Message sent from ${socket.userId} to user_${data.receiverId}`);
  });

  // Handle sending notifications
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

  // Handle ride-specific events
  socket.on('join-ride', (rideId) => {
    socket.join(`ride_${rideId}`);
    console.log(`Socket ${socket.id} joined ride ${rideId}`);
  });

  socket.on('leave-ride', (rideId) => {
    socket.leave(`ride_${rideId}`);
    console.log(`Socket ${socket.id} left ride ${rideId}`);
  });

  // Handle booking updates
  socket.on('booking-update', (data) => {
    // Notify all users in the ride room
    socket.to(`ride_${data.rideId}`).emit('booking-status-changed', data);
    
    // Also notify specific users
    if (data.driverId) {
      socket.to(`user_${data.driverId}`).emit('booking-status-changed', data);
    }
    if (data.passengerId) {
      socket.to(`user_${data.passengerId}`).emit('booking-status-changed', data);
    }
  });

  // Handle typing indicators
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

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('Socket error for user', socket.userId, ':', error);
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, User ID: ${socket.userId}, Reason: ${reason}`);
    
    if (socket.userId) {
      // Notify others that user went offline
      socket.broadcast.emit('user-offline', socket.userId);
    }
  });

  // Ping-pong for connection health
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

// Make io available to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/driver', driverRoutes);

// Health check with MongoDB status
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

// Socket health check
app.get('/api/socket/health', (req, res) => {
  res.json({
    status: 'OK',
    connectedClients: io.engine.clientsCount,
    rooms: Object.keys(io.sockets.adapter.rooms),
    timestamp: new Date().toISOString()
  });
});

// Database health check
app.get('/api/db/health', async (req, res) => {
  try {
    // Test database connection
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5001;

// Start server only after database connection
const startServer = async () => {
  try {
    // Wait for database connection before starting server
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

// Graceful shutdown
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('🔴 Unhandled Promise Rejection:', err.message);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Start the server
startServer();

module.exports = { app, io };