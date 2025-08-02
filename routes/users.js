const express = require('express');
const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/ClerkUser');
const { requireAuth, optionalAuth } = require('../middleware/clerkAuth');
const router = express.Router();

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    res.json({ user: req.user.toJSON() });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/profile', auth, [
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('phone').optional().isMobilePhone(),
  body('bio').optional().trim(),
  body('dateOfBirth').optional().isISO8601(),
  body('preferences.chattiness').optional().isIn(['silent', 'moderate', 'talkative']),
  body('preferences.music').optional().isBoolean(),
  body('preferences.smoking').optional().isBoolean(),
  body('preferences.pets').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const updates = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Profile updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error during profile update' });
  }
});

// Get user by ID (public info only)
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('firstName lastName avatar rating totalRides isDriver preferences createdAt');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;