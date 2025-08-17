const express = require('express');
const router = express.Router();

// DEPRECATED: Use /api/clerkUsers instead for user profile endpoints
router.all('*', (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This route is deprecated. Please use /api/clerkUsers instead.'
  });
});

module.exports = router;