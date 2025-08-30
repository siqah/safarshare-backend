const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Auth
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  },

  // User profile info
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
  
  // Driver / role information
  isDriver: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['rider', 'driver', 'admin'],
    default: 'rider',
    index: true
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
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ isDriver: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ role: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Backward-compatible avatar virtual
userSchema.virtual('avatar').get(function() {
  return this.profileImageUrl;
});

// Virtual for admin check
userSchema.virtual('isAdmin').get(function () {
  return this.role === 'admin';
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

// Password helpers
userSchema.methods.comparePassword = async function(plain) {
  return bcrypt.compare(plain, this.password);
};

// Transform JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject({ virtuals: true });
  delete user.__v;
  delete user.password;
  return user;
};

// Hash password before save
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Keep isDriver and role in sync
userSchema.pre('save', function(next) {
  if (this.isModified('role') && !this.isModified('isDriver')) {
    this.isDriver = this.role === 'driver';
  }
  if (this.isModified('isDriver') && !this.isModified('role')) {
    this.role = this.isDriver ? 'driver' : (this.role === 'admin' ? 'admin' : 'rider');
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
