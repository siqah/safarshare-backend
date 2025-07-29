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

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/safarishare', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

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
app.use('/api/driver', driverRoutes)


// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount
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

const PORT = process.env.PORT || 5001; // Changed to 5001 to match your frontend config
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server ready`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = { app, io };