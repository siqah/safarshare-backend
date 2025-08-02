const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
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
  avatar: {
    type: String,
    default: null
  },
  phone: {
    type: String,
    default: null
  },
  dateOfBirth: {
    type: Date,
    default: null
  },
  bio: {
    type: String,
    default: null
  },
  rating: {
    type: Number,
    default: 5.0,
    min: 0,
    max: 5
  },
  totalRides: {
    type: Number,
    default: 0
  },
  isDriver: {
    type: Boolean,
    default: false
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
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  lastLogin: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Check if password reset token is valid
userSchema.methods.isPasswordResetTokenValid = function(token) {
  if (!this.passwordResetToken || !this.passwordResetExpires) {
    return false;
  }
  
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  return (
    this.passwordResetToken === hashedToken &&
    this.passwordResetExpires > Date.now()
  );
};

// Clear password reset token
userSchema.methods.clearPasswordResetToken = function() {
  this.passwordResetToken = undefined;
  this.passwordResetExpires = undefined;
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.emailVerificationToken;
  delete user.passwordResetToken;
  delete user.passwordResetExpires;
  return user;
};

module.exports = mongoose.model('User', userSchema);