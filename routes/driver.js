const express = require('express');
const router = express.Router();

// DEPRECATED: Driver application routes have been removed.
// This placeholder returns 410 Gone for any access.
router.all('*', (_req, res) => {
  res.status(410).json({
    success: false,
    message: 'Driver application endpoints are removed. Use /api/account/select-role for role selection.'
  });
});

module.exports = router;