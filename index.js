
const express = require('express');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { connectDB } = require('./config/db');



const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());
app.use(cookieParser())
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

//Routes
app.use('/api/auth', require('./routes/auth'));


// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const start = async () => {
  try {
    await connectDB(process.env.MONGODB_URI);
    console.log('✅ Database connected');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  }
};
start();
