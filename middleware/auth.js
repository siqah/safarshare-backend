const User = require('../models/User');

// Simple header-based auth replacement (no external providers)
// - requireAuth: expects 'X-User-Id' header containing a user identifier
// - optionalAuth: tries to set req.clerkUser if header is present; otherwise continues
// If the provided ID is not a valid Mongo ObjectId or doesn't exist, we try clerkId field; if still not found, we auto-create a user.

const HEADER_USER_ID = 'x-user-id';

const ensureUserForId = async (rawId) => {
  if (!rawId) return null;
  let user = null;
  try {
    // Try Mongo _id
    user = await User.findById(rawId);
    if (user) return user;
  } catch {}

  // Try legacy clerkId
  user = await User.findOne({ clerkId: rawId });
  if (user) return user;

  // Auto-create minimal user
  const guest = new User({
    clerkId: rawId, // reuse field as external identifier
    email: `${rawId}@guest.local`,
    firstName: 'Guest',
    lastName: rawId.toString().slice(0, 6),
    profileImageUrl: '',
    isDriver: false,
  });
  await guest.save();
  return guest;
};

const requireAuth = async (req, res, next) => {
  try {
    const headerVal = req.headers[HEADER_USER_ID] || req.headers[HEADER_USER_ID.toUpperCase()];
    const user = await ensureUserForId(headerVal);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User ID header missing or invalid' });
    }

    req.auth = { userId: user._id.toString() };
    req.clerkUser = user; // kept for backward compatibility in routes
    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const headerVal = req.headers[HEADER_USER_ID] || req.headers[HEADER_USER_ID.toUpperCase()];
    if (!headerVal) {
      req.auth = null;
      req.clerkUser = null;
      return next();
    }

    const user = await ensureUserForId(headerVal);
    req.auth = user ? { userId: user._id.toString() } : null;
    req.clerkUser = user || null;
    return next();
  } catch (error) {
    req.auth = null;
    req.clerkUser = null;
    return next();
  }
};

module.exports = { requireAuth, optionalAuth };
