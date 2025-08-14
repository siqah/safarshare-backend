const mongoose = require('mongoose');

const driverApplicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  licenseNumber: {
    type: String,
    required: true,
    trim: true
  },
  licenseExpiry: {
    type: Date,
    required: true
  },
  vehicleInfo: {
    make: {
      type: String,
      required: true,
      trim: true
    },
    model: {
      type: String,
      required: true,
      trim: true
    },
    year: {
      type: Number,
      required: true,
      min: 2000
    },
    color: {
      type: String,
      required: true,
      trim: true
    },
    plateNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    seats: {
      type: Number,
      required: true,
      min: 1,
      max: 8
    }
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: {
    type: Date
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewNotes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
driverApplicationSchema.index({ userId: 1 });
driverApplicationSchema.index({ status: 1 });
driverApplicationSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('DriverApplication', driverApplicationSchema);