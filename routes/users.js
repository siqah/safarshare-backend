const express = require('express');
const User = require('../models/User');

const router = express.Router();

router.get('/me', async (req, res) => {
  try {
    // After ensureUserInDB, req.clerkUser is the database user object
    return res.json({ success: true, user: req.clerkUser });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching profile' });
  }
});

// Update current user profile
router.put('/me', async (req, res) => {
  try {
    // Fields user is allowed to update via /me
    const allowedUpdates = [
      'firstName',
      'lastName',
      'email',
      'profileImageUrl',
      'phone',
      'dateOfBirth',
      'bio',
      'preferences',       // whole preferences object (merged below)
      'driverLicense'      // ONLY the license string; role/isDriver handled elsewhere
    ];

    // Reject any unexpected top-level fields (except those internally handled)
    const invalid = Object.keys(req.body).filter(k => !allowedUpdates.includes(k));
    if (invalid.length) {
      return res.status(400).json({
      success: false,
      message: `Cannot update fields: ${invalid.join(', ')}`
      });
    }

    const updates = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    // Merge preferences if provided as an object
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
    console.error('Update current user error:', error);
    return res.status(500).json({ success: false, message: 'Error updating profile' });
  }
});

// Select role for current user
router.post('/select-role', async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['rider', 'driver'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = await User.findById(req.clerkUser._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.role = role; // pre-save hook keeps isDriver in sync
    await user.save();

    return res.json({ success: true, message: 'Role updated successfully', user });
  } catch (error) {
    console.error('Select role error:', error);
    return res.status(500).json({ success: false, message: 'Failed to set role' });
  }
});

// Public: Get user by ID (supports either Mongo _id or legacy clerkId)
router.get('/:userId', async (req, res) => {
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

    // Return limited public information
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
    console.error('Get user by id error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching user' });
  }
});

module.exports = router;