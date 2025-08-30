const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fromLocation: {
    type: String,
    required: true,
    trim: true
  },
  toLocation: {
    type: String,
    required: true,
    trim: true
  },
  departureDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date >= today;
      },
      message: 'Departure date must be today or in the future'
    }
  },
  departureTime: {
    type: String,
    required: true
  },
  pricePerSeat: {
    type: Number,
    required: true,
    min: 0
  },
  availableSeats: {
    type: Number,
    required: true,
    min: 0,
    max: 8
  },
  totalSeats: {
    type: Number,
    required: true,
    min: 1,
    max: 8
  },
  description: {
    type: String,
    default: null
  },
  waypoints: [{
    type: String,
    trim: true
  }],
  vehicle: {
    make: {
      type: String,
      required: true
    },
    model: {
      type: String,
      required: true
    },
    color: {
      type: String,
      required: true
    },
    licensePlate: {
      type: String,
      required: true
    }
  },
  preferences: {
    chattiness: {
      type: String,
      enum: ['silent', 'moderate', 'talkative'],
      default: 'moderate'
    },
    music: {
      type: Boolean,
      default: true
    },
    smoking: {
      type: Boolean,
      default: false
    },
    pets: {
      type: Boolean,
      default: false
    }
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  bookings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  }]
}, {
  timestamps: true
});

rideSchema.index({ fromLocation: 'text', toLocation: 'text' });
rideSchema.index({ departureDate: 1, status: 1 });
rideSchema.index({ driverId: 1 });

rideSchema.pre('save', function(next) {
  if (this.availableSeats > this.totalSeats) {
    return next(new Error('Available seats cannot exceed total seats'));
  }
  next();
});

module.exports = mongoose.model('Ride', rideSchema);
