const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');

// Clerk-based authentication middleware
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the token with Clerk
    const sessionClaims = await clerkClient.verifyToken(token);
    if (!sessionClaims) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    // Get user details from Clerk
    const clerkUser = await clerkClient.users.getUser(sessionClaims.sub);
    if (!clerkUser) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Add user info to request for backward compatibility
    req.clerkUser = {
      _id: clerkUser.id,
      clerkId: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress || '',
      firstName: clerkUser.firstName || '',
      lastName: clerkUser.lastName || '',
      profileImageUrl: clerkUser.profileImageUrl || ''
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.clerkUser = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the token with Clerk
    const sessionClaims = await clerkClient.verifyToken(token);
    if (!sessionClaims) {
      req.clerkUser = null;
      return next();
    }

    // Get user details from Clerk
    const clerkUser = await clerkClient.users.getUser(sessionClaims.sub);
    if (!clerkUser) {
      req.clerkUser = null;
      return next();
    }

    req.clerkUser = {
      _id: clerkUser.id,
      clerkId: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress || '',
      firstName: clerkUser.firstName || '',
      lastName: clerkUser.lastName || '',
      profileImageUrl: clerkUser.profileImageUrl || ''
    };
  } catch (error) {
    console.error('Optional auth error:', error);
    req.clerkUser = null;
  }
  
  next();
};

// Middleware to ensure user exists in database
const ensureUserInDB = async (req, res, next) => {
  try {
    if (!req.clerkUser) {
      return next();
    }

    let user = await User.findOne({ clerkId: req.clerkUser.clerkId });
    
    if (!user) {
      // Create user in database if doesn't exist
      user = new User({
        clerkId: req.clerkUser.clerkId,
        email: req.clerkUser.email,
        firstName: req.clerkUser.firstName,
        lastName: req.clerkUser.lastName,
        profileImageUrl: req.clerkUser.profileImageUrl,
        role: 'rider', // default role
        isDriver: false
      });
      await user.save();
    }

    // Replace clerkUser with database user for routes
    req.clerkUser = user;
    next();
  } catch (error) {
    console.error('Error ensuring user in DB:', error);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

// Role-based middleware
const requireRole = (role) => {
  return async (req, res, next) => {
    if (!req.clerkUser || req.clerkUser.role !== role) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. ${role} role required.` 
      });
    }
    next();
  };
};

const requireAdmin = requireRole('admin');
const requireDriver = requireRole('driver');

module.exports = { 
  requireAuth, 
  optionalAuth, 
  ensureUserInDB,
  requireAdmin,
  requireDriver
};
