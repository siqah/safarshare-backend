const express = require('express');
const { requireAuth, ensureUserInDB } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Protect all routes in this router
router.use(requireAuth);
router.use(ensureUserInDB);

// POST /api/account/select-role
// Body: { role: 'rider' | 'driver' }
router.post('/select-role', async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['rider', 'driver'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = await User.findById(req.clerkUser._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.role = role; // pre-save hook keeps isDriver in sync
    await user.save();

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
