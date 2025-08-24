const { createClerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');

// Initialize Clerk client with secret key
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Clerk-based authentication middleware
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Auth header received:', authHeader ? 'Present' : 'Missing'); // Debug log
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    console.log('Token extracted, length:', token ? token.length : 0); // Debug log
    
    // Verify the token with Clerk and get session claims
    const sessionClaims = await clerk.verifyToken(token);
    if (!sessionClaims) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    console.log('Session claims:', sessionClaims); // Debug log

    // Use session claims directly instead of making another API call
    // The session claims contain all the user info we need
    req.clerkUser = {
      _id: sessionClaims.sub,
      clerkId: sessionClaims.sub,
      email: sessionClaims.email || '',
      firstName: sessionClaims.given_name || '',
      lastName: sessionClaims.family_name || '',
      profileImageUrl: sessionClaims.picture || ''
    };

    console.log('Clerk user from token:', req.clerkUser); // Debug log

    next();
  } catch (error) {
    console.error('Auth error details:', {
      message: error.message,
      status: error.status,
      clerkError: error.clerkError
    });
    
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication failed',
      error: error.message 
    });
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
    const sessionClaims = await clerk.verifyToken(token);
    if (!sessionClaims) {
      req.clerkUser = null;
      return next();
    }

    // Use session claims directly
    req.clerkUser = {
      _id: sessionClaims.sub,
      clerkId: sessionClaims.sub,
      email: sessionClaims.email || '',
      firstName: sessionClaims.given_name || '',
      lastName: sessionClaims.family_name || '',
      profileImageUrl: sessionClaims.picture || ''
    };
  } catch (error) {
    console.error('Optional auth error:', {
      message: error.message,
      status: error.status
    });
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
