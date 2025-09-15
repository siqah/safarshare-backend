import { Server } from "socket.io";
import Ride from "../models/Ride.js";

function throttle(fn, ms) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer);
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
}

let io;

export const initSocket = (server) => {
  if (io) return io; 
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:5173",      
        "http://localhost:5174",      
        "https://safarishare.netlify.app" 
      ],
      credentials: true
    },
  });
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Preferred auth event to join appropriate rooms
    socket.on('auth', ({ userId, role }) => {
      if(!userId) return;
      socket.data.userId = userId;
      socket.data.role = role;
      // Join role-specific rooms
      if(role === 'driver'){
        socket.join(`driver:${userId}`);
        console.log(`socket ${socket.id} joined room driver:${userId}`);
      }
      if(role === 'user' || role === 'passenger'){
        socket.join(`passenger:${userId}`);
        console.log(`socket ${socket.id} joined room passenger:${userId}`);
      }
    });

    // Backward compatibility for old client
    socket.on("joinDriverRoom", (driverId) =>{
      if(!driverId) return;
      socket.join(`driver:${driverId}`);
      console.log(`socket ${socket.id} joined room driver:${driverId}`);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id)
    });

    // Per-ride rooms: used for live location broadcasting and contextual events
    socket.on('ride:join', ({ rideId }) => {
      if (!rideId) return;
      socket.join(`ride:${rideId}`);
    });

    socket.on('ride:leave', ({ rideId }) => {
      if (!rideId) return;
      socket.leave(`ride:${rideId}`);
    });

    // Throttled broadcaster to avoid flooding
    const broadcastLocation = throttle((payload) => {
      const { rideId, lat, lng, speed } = payload || {};
      if (!rideId || typeof lat !== 'number' || typeof lng !== 'number') return;
      io.to(`ride:${rideId}`).emit('ride:location', {
        rideId,
        lat,
        lng,
        speed: typeof speed === 'number' ? speed : undefined,
        at: Date.now(),
      });
    }, 1000);

    // Only the ride's driver may publish location for that ride
    socket.on('ride:location', async (payload) => {
      try {
        const { rideId, lat, lng } = payload || {};
        if (!rideId || typeof lat !== 'number' || typeof lng !== 'number') return;
        const userId = socket.data?.userId;
        if (!userId) return;
        const ride = await Ride.findById(rideId).select('driver').lean();
        if (!ride) return;
        if (ride.driver.toString() !== String(userId)) return;
        broadcastLocation(payload);
      } catch (err) {
        // swallow errors to keep socket healthy
      }
    });
  });

  return io;
}

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}