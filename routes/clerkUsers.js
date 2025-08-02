const express = require('express');
const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/ClerkUser');
const { requireAuth, optionalAuth } = require('../middleware/clerkAuth');
const router = express.Router();

// Helper function to get or create user from Clerk
const getOrCreateUser = async (clerkId) => {
  let user = await User.findOne({ clerkId });
  
  if (!user) {
    try {
      // Fetch user data from Clerk
      const clerkUser = await clerkClient.users.getUser(clerkId);
      
      user = new User({
        clerkId: clerkId,
        email: clerkUser.emailAddresses[0]?.emailAddress,
        firstName: clerkUser.firstName || 'Unknown',
        lastName: clerkUser.lastName || 'User',
        profileImageUrl: clerkUser.imageUrl || '',
        phone: clerkUser.phoneNumbers?.[0]?.phoneNumber || '',
        emailVerified: clerkUser.emailAddresses[0]?.verification?.status === 'verified'
      });
      
      await user.save();
      console.log('✅ User auto-created:', user.email);
    } catch (error) {
      console.error('❌ Error fetching user from Clerk:', error);
      throw new Error('Failed to fetch user data');
    }
  }
  
  return user;
};

// Get current user profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth.userId);
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile'
    });
  }
});

// Update user profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.auth.userId);
    
    const allowedUpdates = [
      'phone',
      'dateOfBirth',
      'bio',
      'preferences',
      'isDriver',
      'driverLicense'
    ];
    
    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });
    
    // Handle nested preferences object
    if (req.body.preferences) {
      updates.preferences = {
        ...user.preferences,
        ...req.body.preferences
      };
    }
    
    const updatedUser = await User.findOneAndUpdate(
      { clerkId: req.auth.userId },
      updates,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
});

// Get user by ID (public)
router.get('/:userId', optionalAuth, async (req, res) => {
  try {
    const user = await User.findOne({ 
      clerkId: req.params.userId,
      isActive: true 
    }).select('-__v');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Return limited public information
    const publicUser = {
      _id: user._id,
      clerkId: user.clerkId,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      rating: user.rating,
      totalRides: user.totalRides,
      isDriver: user.isDriver,
      preferences: {
        chattiness: user.preferences.chattiness,
        music: user.preferences.music,
        smoking: user.preferences.smoking,
        pets: user.preferences.pets
      }
    };
    
    res.json({
      success: true,
      user: publicUser
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user'
    });
  }
});

module.exports = router;
