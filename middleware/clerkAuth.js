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

// Enhanced middleware to require authentication and sync user
const requireAuth = async (req, res, next) => {
  try {
    // First, use Clerk's built-in auth
    await new Promise((resolve, reject) => {
      ClerkExpressRequireAuth({
        onError: (error) => {
          console.error('❌ Clerk authentication error:', error);
          return reject(new Error('Authentication required'));
        }
      })(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // If auth successful, sync user data
    if (req.auth && req.auth.userId) {
      try {
        const clerkUser = await syncClerkUser(req.auth.userId);
        req.clerkUser = clerkUser;
        next();
      } catch (syncError) {
        console.error('❌ User sync failed:', syncError);
        return res.status(500).json({
          success: false,
          message: 'User synchronization failed'
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.auth = null;
      req.clerkUser = null;
      return next();
    }

    // If there's a token, try to verify it
    const token = authHeader.split(' ')[1];
    
    try {
      const payload = await clerkClient.verifyToken(token);
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
