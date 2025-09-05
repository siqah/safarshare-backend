import { Server } from "socket.io";

let io;

export const initSocket = (server) => {
  if (io) return io; 
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:5173",      
        "https://safarishare.netlify.app" 
      ]
    },
  });
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinDriverRoom", (driverId) =>{
      socket.join(`driver:${driverId}`);
      console.log(`socket ${socket.id} joined room driver:${driverId}`);
    });
    socket.on("discconnect", () => {
      console.log("User disconnected:", socket.id)
    });
  });

  return io;
}

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}