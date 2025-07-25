const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  payerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'KES'
  },
  platformFee: {
    type: Number,
    required: true,
    min: 0
  },
  driverPayout: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['mpesa'],
    default: 'mpesa'
  },
  mpesaPhoneNumber: {
    type: String,
    required: true
  },
  mpesaTransactionId: {
    type: String,
    default: null
  },
  mpesaReceiptNumber: {
    type: String,
    default: null
  },
  mpesaCheckoutRequestId: {
    type: String,
    default: null
  },
  failureReason: {
    type: String,
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for payment queries
paymentSchema.index({ payerId: 1, status: 1 });
paymentSchema.index({ receiverId: 1, status: 1 });
paymentSchema.index({ mpesaTransactionId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);