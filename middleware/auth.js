// JWT auth / role middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Attach user if valid access token provided, else continue (for optional routes)
const optionalAuth = async (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.auth = payload; // { sub, email, role }
    req.user = await User.findById(payload.sub);
  } catch (e) {
    // ignore invalid
  }
  next();
};

// Require a valid access token
const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ success:false, message: 'No token provided' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.auth = payload;
    req.user = await User.findById(payload.sub);
    if (!req.user) return res.status(401).json({ success:false, message: 'User not found' });
    next();
  } catch (e) {
    return res.status(401).json({ success:false, message: 'Invalid or expired token' });
  }
};

// Require specific role (after requireAuth)
const requireRole = (role) => (req, res, next) => {
  if (!req.auth) return res.status(401).json({ success:false, message: 'Unauthorized' });
  if (Array.isArray(role) ? !role.includes(req.auth.role) : req.auth.role !== role) {
    return res.status(403).json({ success:false, message: 'Forbidden' });
  }
  next();
};

module.exports = { optionalAuth, requireAuth, requireRole };
