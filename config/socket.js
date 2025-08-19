const socketIo = require('socket.io');

function createSocket(server, { allowedOrigins = [], isDev = false } = {}) {
  const io = socketIo(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const o = origin.replace(/\/$/, '');
        if (isDev || allowedOrigins.includes(o) || o.endsWith('.netlify.app')) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake?.auth?.userId;
    if (userId) socket.join(`user_${userId}`);

    socket.on('join-room', (roomId) => socket.join(roomId));
    socket.on('leave-room', (roomId) => socket.leave(roomId));

    socket.on('join-ride', (rideId) => socket.join(`ride_${rideId}`));
    socket.on('leave-ride', (rideId) => socket.leave(`ride_${rideId}`));

    socket.on('send-message', (data) => {
      if (!data?.receiverId || !data?.message) return;
      socket.to(`user_${data.receiverId}`).emit('new-message', {
        message: data.message,
        sender: data.sender,
        timestamp: new Date()
      });
    });

    socket.on('send-notification', (data) => {
      if (!data?.userId || !data?.notification) return;
      socket.to(`user_${data.userId}`).emit('new-notification', {
        notification: data.notification,
        timestamp: new Date()
      });
    });

    socket.on('booking-update', (data) => {
      if (!data?.rideId) return;
      socket.to(`ride_${data.rideId}`).emit('booking-status-changed', data);
      if (data.driverId) socket.to(`user_${data.driverId}`).emit('booking-status-changed', data);
      if (data.passengerId) socket.to(`user_${data.passengerId}`).emit('booking-status-changed', data);
    });

    socket.on('typing-start', (data) => {
      if (!data?.receiverId) return;
      socket.to(`user_${data.receiverId}`).emit('user-typing', { userId, isTyping: true });
    });

    socket.on('typing-stop', (data) => {
      if (!data?.receiverId) return;
      socket.to(`user_${data.receiverId}`).emit('user-typing', { userId, isTyping: false });
    });
  });

  return io;
}

module.exports = { createSocket };
