import { Server } from "socket.io";

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
  });

  return io;
}

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}