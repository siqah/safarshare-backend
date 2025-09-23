import express from "express";
import  cookieParser from "cookie-parser";
import cors from "cors";
import { connectDB } from "./config/db.js";
import dotenv from "dotenv";
import http from "http"

dotenv.config();
import auth from './routes/auth.js';
import driver from './routes/driver.js';
import ride from './routes/ride.js';
import notification from './routes/notification.js';
import message from './routes/message.js';
import { initSocket } from "./config/socket.js";


const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
initSocket(server);

app.use(express.json());
app.use(cookieParser())

// CORS setup
const allowedOrigins = [
  "http://localhost:5173",
  "https://safarishare.netlify.app"
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// Handle preflight requests
app.options("*", cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));


//Routes
app.use('/api/auth', auth);
app.use('/api/driver', driver);
app.use('/api/ride', ride);
app.use('/api/notifications', notification);
app.use('/api/messages', message);


// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const start = async () => {
  try {
    await connectDB(process.env.MONGODB_URI);
    console.log('✅ Database connected');

    // IMPORTANT: listen on the HTTP server (so Socket.IO works)
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  }
};
start();
