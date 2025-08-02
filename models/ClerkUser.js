const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Clerk user ID - this is the primary identifier
  clerkId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // User profile info (synced from Clerk)
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  profileImageUrl: {
    type: String,
    default: ''
  },
  
  // App-specific fields
  phone: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  bio: {
    type: String,
    maxlength: 500
  },
  
  // Rating system
  rating: {
    type: Number,
    default: 5,
    min: 0,
    max: 5
  },
  totalRides: {
    type: Number,
    default: 0
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  
  // Driver information
  isDriver: {
    type: Boolean,
    default: false
  },
  driverLicense: {
    type: String,
    trim: true
  },
  
  // User preferences
  preferences: {
    chattiness: {
      type: String,
      enum: ['quiet', 'moderate', 'chatty'],
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
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    }
  },
  
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  
  // Timestamps for account activity
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
userSchema.index({ clerkId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ isDriver: 1 });
userSchema.index({ isActive: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Method to calculate average rating
userSchema.methods.calculateAverageRating = function() {
  if (this.totalRatings === 0) return 5;
  return Math.round((this.rating * this.totalRatings) / this.totalRatings * 10) / 10;
};

// Method to update rating
userSchema.methods.updateRating = function(newRating) {
  const totalScore = this.rating * this.totalRatings;
  this.totalRatings += 1;
  this.rating = (totalScore + newRating) / this.totalRatings;
  return this.save();
};

// Transform JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  
  // Remove sensitive fields
  delete user.__v;
  
  return user;
};

module.exports = mongoose.model('User', userSchema);
