const mongoose = require('mongoose');

let isConnected = false;

async function connectDB(uri) {
  if (!uri) throw new Error('MONGODB_URI not set');
  if (isConnected) return mongoose.connection;

  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

  await mongoose.connect(uri);
  isConnected = true;
  return mongoose.connection;
}



module.exports = { connectDB };
