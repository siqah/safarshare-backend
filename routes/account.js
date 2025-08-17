const express = require('express');
const { clerkClient } = require('@clerk/clerk-sdk-node');
const { requireAuth } = require('../middleware/clerkAuth');
const User = require('../models/ClerkUser');

const router = express.Router();

// Protect all routes in this router
router.use(requireAuth);

// POST /api/account/select-role
// Body: { role: 'rider' | 'driver' }
router.post('/select-role', async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['rider', 'driver'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    // req.clerkUser is populated by requireAuth
    let user = req.clerkUser;
    if (!user) {
      user = await User.findOne({ clerkId: req.auth.userId });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
    }

    user.role = role; // pre-save hook keeps isDriver in sync
    await user.save();

    // Reflect in Clerk publicMetadata (best-effort)
    try {
      await clerkClient.users.updateUser(req.auth.userId, {
        publicMetadata: { role, isDriver: role === 'driver' }
      });
    } catch (metaErr) {
      // Non-fatal
      if (process.env.NODE_ENV === 'development') {
        console.log('Clerk metadata update warning:', metaErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'Role updated successfully',
      user
    });
  } catch (error) {
    console.error('Select role error:', error);
    return res.status(500).json({ success: false, message: 'Failed to set role' });
  }
});

module.exports = router;
