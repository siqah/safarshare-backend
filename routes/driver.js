const express = require('express');
const { requireAuth, optionalAuth } = require('../middleware/clerkAuth');
const DriverApplication = require('../models/DriverApplication');
const ClerkUser = require('../models/ClerkUser');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

// Submit driver application (JSON only, no file uploads)
router.post('/apply', requireAuth, async (req, res) => {
  try {
    const { licenseNumber, licenseExpiry, vehicleInfo } = req.body;

    // Check if user already has an application
    const existingApplication = await DriverApplication.findOne({ userId: req.clerkUser._id });
    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'You already have a driver application. Please contact support if you need to update it.'
      });
    }

    // Parse vehicle info
    const parsedVehicleInfo = typeof vehicleInfo === 'string' ? JSON.parse(vehicleInfo) : vehicleInfo;

    // Validate license expiry
    const expiryDate = new Date(licenseExpiry);
    if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'License expiry date must be a valid future date'
      });
    }

    // Create application
    const application = new DriverApplication({
      userId: req.clerkUser._id,
      licenseNumber,
      licenseExpiry: expiryDate,
      vehicleInfo: parsedVehicleInfo,
      status: 'pending'
    });

    await application.save();

    // Populate the application for response
    const populatedApplication = await DriverApplication.findById(application._id)
      .populate('userId', 'firstName lastName email');

    // Create notification for admins (you can implement admin notification system)
    // For now, just log it
    console.log(`New driver application submitted by ${req.clerkUser.firstName} ${req.clerkUser.lastName}`);

    res.status(201).json({
      success: true,
      message: 'Driver application submitted successfully',
      application: populatedApplication
    });

  } catch (error) {
    console.error('Driver application error:', error);

    res.status(500).json({
      success: false,
      message: 'Server error during application submission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user's driver application
router.get('/application', requireAuth, async (req, res) => {
  try {
    const application = await DriverApplication.findOne({ userId: req.clerkUser._id });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'No driver application found'
      });
    }

    res.json({
      success: true,
      application
    });

  } catch (error) {
    console.error('Get driver application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch driver application'
    });
  }
});

// Update driver application (only for pending applications)
router.put('/application/:applicationId', requireAuth, async (req, res) => {
  try {
    const application = await DriverApplication.findOne({
      _id: req.params.applicationId,
      userId: req.clerkUser._id
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update application that has been reviewed'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['licenseNumber', 'licenseExpiry', 'vehicleInfo'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'licenseExpiry' ? new Date(req.body[field]) : req.body[field];
      }
    });

    Object.assign(application, updates);
    await application.save();

    res.json({
      success: true,
      message: 'Application updated successfully',
      application
    });

  } catch (error) {
    console.error('Update driver application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update application'
    });
  }
});

// Admin: Get all applications (for admin panel)
router.get('/applications', requireAuth, async (req, res) => {
  try {
    // This would typically have admin role checking
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    }

    const applications = await DriverApplication.find(query)
      .populate('userId', 'firstName lastName email')
      .sort({ submittedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await DriverApplication.countDocuments(query);

    res.json({
      success: true,
      applications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get driver applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch applications'
    });
  }
});

// Admin: Review application
router.put('/application/:applicationId/review', requireAuth, async (req, res) => {
  try {
    const { status, reviewNotes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "approved" or "rejected"'
      });
    }

    const application = await DriverApplication.findById(req.params.applicationId)
      .populate('userId', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Application has already been reviewed'
      });
    }

    // Update application
    application.status = status;
    application.reviewedAt = new Date();
    application.reviewedBy = req.clerkUser._id;
    application.reviewNotes = reviewNotes;
    await application.save();

    // Update user's isDriver status if approved
    if (status === 'approved') {
      await ClerkUser.findByIdAndUpdate(application.userId._id, { isDriver: true });
    }

    // Create notification for user
    await createNotification({
      userId: application.userId._id,
      type: status === 'approved' ? 'driver_approved' : 'driver_rejected',
      title: status === 'approved' ? 'Driver Application Approved! 🎉' : 'Driver Application Update',
      message: status === 'approved' 
        ? 'Congratulations! Your driver application has been approved. You can now start offering rides.'
        : `Your driver application has been reviewed. ${reviewNotes || 'Please contact support for more information.'}`,
      data: { applicationId: application._id },
      actionUrl: status === 'approved' ? '/offer' : '/driver/apply'
    }, req.io);

    res.json({
      success: true,
      message: `Application ${status} successfully`,
      application
    });

  } catch (error) {
    console.error('Review driver application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review application'
    });
  }
});

module.exports = router;