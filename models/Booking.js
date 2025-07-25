const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride',
    required: true
  },
  passengerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seatsBooked: {
    type: Number,
    required: true,
    min: 1,
    max: 4
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'completed', 'cancelled'],
    default: 'pending'
  },
  message: {
    type: String,
    default: null
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentId: {
    type: String,
    default: null
  },
  mpesaTransactionId: {
    type: String,
    default: null
  },
  mpesaReceiptNumber: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate bookings
bookingSchema.index({ rideId: 1, passengerId: 1 }, { unique: true });

// Index for queries
bookingSchema.index({ passengerId: 1, status: 1 });
bookingSchema.index({ rideId: 1, status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);