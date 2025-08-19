const express = require('express');
const User = require('../models/User');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /profile - current user profile (header-based)
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.clerkUser._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    return res.json({ success: true, user });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching profile' });
  }
});

// PUT /profile - update current user profile (header-based)
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const allowedUpdates = [
      'phone',
      'dateOfBirth',
      'bio',
      'preferences',
      'isDriver',
      'driverLicense',
      'firstName',
      'lastName',
      'email',
      'profileImageUrl',
    ];

    const updates = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // Merge preferences if object provided
    if (req.body.preferences && typeof req.body.preferences === 'object') {
      const current = await User.findById(req.clerkUser._id);
      updates.preferences = { ...(current?.preferences || {}), ...req.body.preferences };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.clerkUser._id,
      updates,
      { new: true, runValidators: true }
    );

    if (!updatedUser) return res.status(404).json({ success: false, message: 'User not found' });

    return res.json({ success: true, message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Error updating profile' });
  }
});

// GET /:userId - public user info by Mongo _id or legacy clerkId
router.get('/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    let user = null;
    // Try by Mongo _id
    try { user = await User.findById(userId); } catch {}
    // Fallback to legacy clerkId
    if (!user) {
      user = await User.findOne({ clerkId: userId, isActive: true });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const publicUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      rating: user.rating,
      totalRides: user.totalRides,
      isDriver: user.isDriver,
      preferences: {
        chattiness: user.preferences?.chattiness,
        music: user.preferences?.music,
        smoking: user.preferences?.smoking,
        pets: user.preferences?.pets
      }
    };

    return res.json({ success: true, user: publicUser });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching user' });
  }
});

// POST /sync - no-op sync for compatibility; returns current user
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.clerkUser._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.lastLogin = new Date();
    await user.save();

    return res.json({ success: true, user, message: 'User synced successfully' });
  } catch (error) {
    console.error('User sync error:', error);
    return res.status(500).json({ success: false, message: 'Error syncing user data' });
  }
});

module.exports = router;
