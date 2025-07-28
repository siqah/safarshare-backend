const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const DriverApplication = require('../models/DriverApplication');
const User = require('../models/User');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/documents';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, JPG, PNG) and PDF files are allowed'));
    }
  }
});

// Submit driver application
router.post('/apply', auth, upload.fields([
  { name: 'license', maxCount: 1 },
  { name: 'registration', maxCount: 1 },
  { name: 'insurance', maxCount: 1 }
]), async (req, res) => {
  try {
    const { licenseNumber, licenseExpiry, vehicleInfo } = req.body;

    // Check if user already has an application
    const existingApplication = await DriverApplication.findOne({ userId: req.user._id });
    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: 'You already have a driver application. Please contact support if you need to update it.'
      });
    }

    // Validate required files
    if (!req.files?.license || !req.files?.registration || !req.files?.insurance) {
      return res.status(400).json({
        success: false,
        message: 'All documents (license, registration, insurance) are required'
      });
    }

    // Parse vehicle info
    const parsedVehicleInfo = typeof vehicleInfo === 'string' 
      ? JSON.parse(vehicleInfo) 
      : vehicleInfo;

    // Validate license expiry
    const expiryDate = new Date(licenseExpiry);
    if (expiryDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'License expiry date must be in the future'
      });
    }

    // Create application
    const application = new DriverApplication({
      userId: req.user._id,
      licenseNumber,
      licenseExpiry: expiryDate,
      vehicleInfo: parsedVehicleInfo,
      documents: {
        license: req.files.license[0].filename,
        registration: req.files.registration[0].filename,
        insurance: req.files.insurance[0].filename
      },
      status: 'pending'
    });

    await application.save();

    // Populate the application for response
    const populatedApplication = await DriverApplication.findById(application._id)
      .populate('userId', 'firstName lastName email');

    // Create notification for admins (you can implement admin notification system)
    // For now, just log it
    console.log(`New driver application submitted by ${req.user.firstName} ${req.user.lastName}`);

    res.status(201).json({
      success: true,
      message: 'Driver application submitted successfully',
      application: populatedApplication
    });

  } catch (error) {
    console.error('Driver application error:', error);
    
    // Clean up uploaded files if there was an error
    if (req.files) {
      Object.values(req.files).flat().forEach(file => {
        fs.unlink(file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during application submission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user's driver application
router.get('/application', auth, async (req, res) => {
  try {
    const application = await DriverApplication.findOne({ userId: req.user._id });

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
router.put('/application/:applicationId', auth, async (req, res) => {
  try {
    const application = await DriverApplication.findOne({
      _id: req.params.applicationId,
      userId: req.user._id
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
        updates[field] = req.body[field];
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
router.get('/applications', auth, async (req, res) => {
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
router.put('/application/:applicationId/review', auth, async (req, res) => {
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
    application.reviewedBy = req.user._id;
    application.reviewNotes = reviewNotes;
    await application.save();

    // Update user's isDriver status if approved
    if (status === 'approved') {
      await User.findByIdAndUpdate(application.userId._id, { isDriver: true });
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