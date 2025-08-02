const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');
const emailService = require('../utils/emailService');

const router = express.Router();

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').trim().isLength({ min: 1 })
], async (req, res) => {
  try {
    console.log('📝 Registration attempt:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Create new user
    const user = new User({
      email,
      password,
      firstName,
      lastName
    });

    await user.save();

    // Send welcome email (don't block registration if it fails)
    emailService.sendWelcomeEmail(user.email, user.firstName)
      .then(result => {
        if (result.success) {
          console.log('✅ Welcome email sent to:', user.email);
        } else {
          console.log('⚠️ Failed to send welcome email:', result.error);
        }
      })
      .catch(error => {
        console.log('⚠️ Welcome email error:', error.message);
      });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    res.json({ user: req.user.toJSON() });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Forgot Password - Send reset email
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    console.log('🔐 Password reset request for:', req.body.email);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email, isActive: true });
    
    // Always return success message for security (don't reveal if email exists)
    const successMessage = 'If an account with that email exists, we have sent a password reset link.';
    
    if (!user) {
      console.log('🔍 Password reset attempted for non-existent email:', email);
      return res.json({
        success: true,
        message: successMessage
      });
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Send reset email
    const emailResult = await emailService.sendPasswordResetEmail(
      user.email,
      user.firstName,
      resetToken
    );

    if (!emailResult.success) {
      // Clear reset token if email failed
      user.clearPasswordResetToken();
      await user.save({ validateBeforeSave: false });
      
      console.error('❌ Failed to send password reset email:', emailResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email. Please try again.'
      });
    }

    console.log('✅ Password reset email sent to:', email);
    
    // In development, include the reset URL for testing
    const response = {
      success: true,
      message: successMessage
    };
    
    if (process.env.NODE_ENV === 'development') {
      response.resetUrl = emailResult.resetUrl;
      response.token = resetToken;
    }

    res.json(response);
    
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset request'
    });
  }
});

// Reset Password - Update password with token
router.post('/reset-password', [
  body('token').isLength({ min: 1 }).withMessage('Reset token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Password confirmation does not match password');
    }
    return true;
  })
], async (req, res) => {
  try {
    console.log('🔐 Password reset attempt with token');
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token, password } = req.body;

    // Find user with valid reset token
    const users = await User.find({
      passwordResetToken: { $exists: true },
      passwordResetExpires: { $gt: Date.now() }
    });

    let user = null;
    for (const u of users) {
      if (u.isPasswordResetTokenValid(token)) {
        user = u;
        break;
      }
    }

    if (!user) {
      console.log('❌ Invalid or expired password reset token');
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired'
      });
    }

    // Update password
    user.password = password;
    user.clearPasswordResetToken();
    await user.save();

    console.log('✅ Password reset successful for user:', user.email);

    // Generate new JWT token for auto-login
    const jwtToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Password reset successful',
      token: jwtToken,
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isDriver: user.isDriver
      }
    });

  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset'
    });
  }
});

// Validate Reset Token - Check if token is valid (for frontend validation)
router.post('/validate-reset-token', [
  body('token').isLength({ min: 1 }).withMessage('Reset token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token } = req.body;

    // Find user with valid reset token
    const users = await User.find({
      passwordResetToken: { $exists: true },
      passwordResetExpires: { $gt: Date.now() }
    });

    let user = null;
    for (const u of users) {
      if (u.isPasswordResetTokenValid(token)) {
        user = u;
        break;
      }
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is invalid or has expired'
      });
    }

    res.json({
      success: true,
      message: 'Token is valid',
      email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Partially hide email
    });

  } catch (error) {
    console.error('❌ Validate reset token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during token validation'
    });
  }
});

// Logout (client-side token removal)
router.post('/logout', auth, async (req, res) => {
  try {
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

module.exports = router;