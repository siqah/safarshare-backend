const { ClerkExpressRequireAuth, clerkClient } = require('@clerk/clerk-sdk-node');
const ClerkUser = require('../models/ClerkUser');

// Helper function to sync Clerk user data
const syncClerkUser = async (userId) => {
  try {
    // Get user from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);
    
    // Find or create user in our database
    let dbUser = await ClerkUser.findOne({ clerkId: userId });
    
    if (!dbUser) {
      // Create new user
      dbUser = new ClerkUser({
        clerkId: userId,
        email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress,
        firstName: clerkUser.firstName || '',
        lastName: clerkUser.lastName || '',
        avatar: clerkUser.imageUrl || '',
        createdAt: new Date(clerkUser.createdAt),
        updatedAt: new Date()
      });
      await dbUser.save();
      console.log('✅ Created new ClerkUser:', dbUser._id);
    } else {
      // Update existing user
      const updated = {
        email: clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress,
        firstName: clerkUser.firstName || '',
        lastName: clerkUser.lastName || '',
        avatar: clerkUser.imageUrl || '',
        updatedAt: new Date()
      };
      
      await ClerkUser.findByIdAndUpdate(dbUser._id, updated);
      dbUser = { ...dbUser.toObject(), ...updated };
      console.log('✅ Updated ClerkUser:', dbUser._id);
    }
    
    return dbUser;
  } catch (error) {
    console.error('❌ Error syncing Clerk user:', error);
    throw error;
  }
};

// Build verify options once
const buildVerifyOptions = () => {
  const authorizedParties = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
  ].filter(Boolean);

  return {
    secretKey: process.env.CLERK_SECRET_KEY,
    authorizedParties,
  };
};

// Enhanced middleware to require authentication and sync user
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = (req.headers.authorization || req.headers.Authorization || '').toString();
    const altHeader = req.headers['x-clerk-auth'];

    let userId = null;

    // Try local token verification first (supports both Session tokens and JWT templates)
    if ((authHeader && authHeader.startsWith('Bearer ')) || altHeader) {
      const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : altHeader;
      try {
        const payload = await clerkClient.verifyToken(token, buildVerifyOptions());
        userId = payload.sub;
      } catch (err) {
        console.warn('⚠️ Local token verification failed, falling back to Clerk middleware:', err?.message || err);
      }
    }

    // If local verification failed or no token, fall back to Clerk's Express middleware (session introspection)
    if (!userId) {
      await new Promise((resolve, reject) => {
        ClerkExpressRequireAuth({
          onError: (error) => {
            console.error('❌ Clerk session authentication error:', error?.message || error);
            return reject(error);
          }
        })(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Clerk middleware should set req.auth
      if (req.auth && req.auth.userId) {
        userId = req.auth.userId;
      }
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Ensure req.auth is set
    req.auth = { userId };

    // Sync user data
    try {
      const clerkUser = await syncClerkUser(userId);
      req.clerkUser = clerkUser;
    } catch (syncError) {
      console.error('❌ User sync failed:', syncError);
      return res.status(500).json({ success: false, message: 'User synchronization failed' });
    }

    return next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
};

// Middleware to optionally get user (doesn't require auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = (req.headers.authorization || '').toString();
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.auth = null;
      req.clerkUser = null;
      return next();
    }

    // If there's a token, try to verify it
    const token = authHeader.split(' ')[1];
    
    try {
      const payload = await clerkClient.verifyToken(token, buildVerifyOptions());
      req.auth = { userId: payload.sub };
      
      // Try to sync user data
      try {
        const clerkUser = await syncClerkUser(payload.sub);
        req.clerkUser = clerkUser;
      } catch (syncError) {
        console.log('⚠️ Optional user sync failed:', syncError.message);
        req.clerkUser = null;
      }
      
      next();
    } catch (error) {
      console.log('⚠️ Optional auth failed:', error.message);
      req.auth = null;
      req.clerkUser = null;
      next();
    }
  } catch (error) {
    console.error('❌ Optional auth middleware error:', error);
    req.auth = null;
    req.clerkUser = null;
    next();
  }
};

module.exports = {
  requireAuth,
  optionalAuth
};
