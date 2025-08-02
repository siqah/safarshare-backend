const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Ride = require('../models/Ride');
const Booking = require('../models/Booking');
const ClerkUser = require('../models/ClerkUser');
const { requireAuth, optionalAuth } = require('../middleware/clerkAuth');
const { createNotification } = require('../utils/notifications');

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Rides routes are working!',
    timestamp: new Date().toISOString()
  });
});

// Get all rides (public) - for browsing/searching
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const rides = await Ride.find({ 
      status: 'active',
      departureDate: { $gte: new Date() } // Only future rides
    })
      .populate('driverId', 'firstName lastName avatar rating totalRides')
      .sort({ departureDate: 1, departureTime: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Ride.countDocuments({ 
      status: 'active',
      departureDate: { $gte: new Date() }
    });

    res.json({
      success: true,
      rides,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get rides error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching rides',
      error: error.message 
    });
  }
});

// Create a new ride
router.post('/', requireAuth, [
  body('fromLocation').trim().isLength({ min: 1 }).withMessage('From location is required'),
  body('toLocation').trim().isLength({ min: 1 }).withMessage('To location is required'),
  body('departureDate').isISO8601().withMessage('Valid departure date is required'),
  body('departureTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time format required (HH:MM)'),
  body('pricePerSeat').isNumeric().isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('totalSeats').isInt({ min: 1, max: 8 }).withMessage('Seats must be between 1 and 8'),
  body('vehicle.make').optional().trim(),
  body('vehicle.model').optional().trim(),
  body('vehicle.color').optional().trim(),
  body('vehicle.licensePlate').optional().trim(),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const rideData = {
      ...req.body,
      driverId: req.clerkUser._id,
      availableSeats: req.body.totalSeats,
      status: 'active'
    };

    const ride = new Ride(rideData);
    await ride.save();

    // Populate driver info
    await ride.populate('driverId', 'firstName lastName avatar rating totalRides');

    res.status(201).json({
      success: true,
      message: 'Ride created successfully',
      ride
    });
  } catch (error) {
    console.error('Create ride error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during ride creation',
      error: error.message
    });
  }
});

// Search rides with filters
router.get('/search', [
  query('from').optional().trim(),
  query('to').optional().trim(),
  query('date').optional().isISO8601(),
  query('maxPrice').optional().isNumeric(),
  query('minSeats').optional().isInt({ min: 1 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { from, to, date, maxPrice, minSeats, page = 1, limit = 10 } = req.query;
    
    // Build search query
    const searchQuery = { 
      status: 'active',
      departureDate: { $gte: new Date() }
    };

    if (from) {
      searchQuery.fromLocation = { $regex: from, $options: 'i' };
    }
    
    if (to) {
      searchQuery.toLocation = { $regex: to, $options: 'i' };
    }
    
    if (date) {
      const searchDate = new Date(date);
      searchQuery.departureDate = {
        $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
        $lt: new Date(searchDate.setHours(23, 59, 59, 999))
      };
    }
    
    if (maxPrice) {
      searchQuery.pricePerSeat = { $lte: parseFloat(maxPrice) };
    }
    
    if (minSeats) {
      searchQuery.availableSeats = { $gte: parseInt(minSeats) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const rides = await Ride.find(searchQuery)
      .populate('driverId', 'firstName lastName avatar rating totalRides')
      .sort({ departureDate: 1, departureTime: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Ride.countDocuments(searchQuery);

    res.json({
      success: true,
      rides,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      searchApplied: !!(from || to || date || maxPrice || minSeats)
    });
  } catch (error) {
    console.error('Search rides error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during ride search',
      error: error.message
    });
  }
});

// Get featured/popular rides for homepage
router.get('/featured', async (req, res) => {
  try {
    const rides = await Ride.find({ 
      status: 'active',
      departureDate: { $gte: new Date() }
    })
      .populate('driverId', 'firstName lastName avatar rating totalRides')
      .sort({ 
        departureDate: 1, 
        departureTime: 1,
        'driverId.rating': -1
      })
      .limit(6);

    res.json({ 
      success: true,
      rides 
    });
  } catch (error) {
    console.error('Get featured rides error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get my rides as driver
router.get('/my-rides', requireAuth, async (req, res) => {
  try {
    const rides = await Ride.find({ driverId: req.clerkUser._id })
      .populate('driverId', 'firstName lastName avatar rating totalRides')
      .populate({
        path: 'bookings',
        populate: {
          path: 'passengerId',
          select: 'firstName lastName avatar rating'
        }
      })
      .sort({ departureDate: -1 });

    res.json({ 
      success: true,
      rides 
    });
  } catch (error) {
    console.error('Get my rides error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get rides by specific driver
router.get('/driver/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    
    const rides = await Ride.find({ 
      driverId,
      status: 'active',
      departureDate: { $gte: new Date() }
    })
      .populate('driverId', 'firstName lastName avatar rating totalRides')
      .sort({ departureDate: 1 });

    res.json({ 
      success: true,
      rides 
    });
  } catch (error) {
    console.error('Get rides by driver error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get single ride by ID
router.get('/:rideId', async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId)
      .populate('driverId', 'firstName lastName avatar rating totalRides phone')
      .populate({
        path: 'bookings',
        populate: {
          path: 'passengerId',
          select: 'firstName lastName avatar rating'
        }
      });

    if (!ride) {
      return res.status(404).json({ 
        success: false,
        message: 'Ride not found' 
      });
    }

    res.json({ 
      success: true,
      ride 
    });
  } catch (error) {
    console.error('Get ride error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Update ride (only by driver)
router.put('/:rideId', requireAuth, [
  body('fromLocation').optional().trim().isLength({ min: 1 }),
  body('toLocation').optional().trim().isLength({ min: 1 }),
  body('departureDate').optional().isISO8601(),
  body('departureTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('pricePerSeat').optional().isNumeric().isFloat({ min: 0 }),
  body('totalSeats').optional().isInt({ min: 1, max: 8 }),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const ride = await Ride.findOne({ 
      _id: req.params.rideId, 
      driverId: req.clerkUser._id 
    });
    
    if (!ride) {
      return res.status(404).json({ 
        success: false,
        message: 'Ride not found or unauthorized' 
      });
    }

    // Check if ride has bookings and prevent certain updates
    const hasBookings = ride.bookings && ride.bookings.length > 0;
    if (hasBookings && (req.body.totalSeats || req.body.departureDate || req.body.departureTime)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify date, time, or seats when ride has bookings'
      });
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        ride[key] = req.body[key];
      }
    });

    // Update available seats if total seats changed
    if (req.body.totalSeats) {
      ride.availableSeats = req.body.totalSeats - (ride.bookings?.length || 0);
    }

    await ride.save();
    await ride.populate('driverId', 'firstName lastName avatar rating totalRides');

    res.json({
      success: true,
      message: 'Ride updated successfully',
      ride
    });
  } catch (error) {
    console.error('Update ride error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during ride update',
      error: error.message
    });
  }
});

// Cancel ride (only by driver)
router.delete('/:rideId', requireAuth, async (req, res) => {
  try {
    const ride = await Ride.findOne({ 
      _id: req.params.rideId, 
      driverId: req.clerkUser._id 
    }).populate('bookings');
    
    if (!ride) {
      return res.status(404).json({ 
        success: false,
        message: 'Ride not found or unauthorized' 
      });
    }

    // Notify all passengers about cancellation
    if (ride.bookings && ride.bookings.length > 0) {
      for (const booking of ride.bookings) {
        await createNotification({
          userId: booking.passengerId,
          type: 'ride_cancelled',
          title: 'Ride Cancelled',
          message: `Your ride from ${ride.fromLocation} to ${ride.toLocation} has been cancelled by the driver.`,
          relatedId: ride._id,
          relatedModel: 'Ride'
        });

        // Update booking status
        await Booking.findByIdAndUpdate(booking._id, { status: 'cancelled' });
      }
    }

    ride.status = 'cancelled';
    await ride.save();

    res.json({ 
      success: true,
      message: 'Ride cancelled successfully' 
    });
  } catch (error) {
    console.error('Cancel ride error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during ride cancellation',
      error: error.message
    });
  }
});

// Book a ride
router.post('/:rideId/book', requireAuth, [
  body('seats').isInt({ min: 1, max: 8 }).withMessage('Seats must be between 1 and 8'),
  body('pickupLocation').optional().trim(),
  body('dropoffLocation').optional().trim(),
  body('specialRequests').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { seats, pickupLocation, dropoffLocation, specialRequests } = req.body;
    const ride = await Ride.findById(req.params.rideId);

    if (!ride) {
      return res.status(404).json({ 
        success: false,
        message: 'Ride not found' 
      });
    }

    // Check if user is trying to book their own ride
    if (ride.driverId.toString() === req.clerkUser._id.toString()) {
      return res.status(400).json({ 
        success: false,
        message: 'You cannot book your own ride' 
      });
    }

    // Check if ride is active
    if (ride.status !== 'active') {
      return res.status(400).json({ 
        success: false,
        message: 'Ride is not available for booking' 
      });
    }

    // Check if enough seats available
    if (ride.availableSeats < seats) {
      return res.status(400).json({ 
        success: false,
        message: `Only ${ride.availableSeats} seats available` 
      });
    }

    // Check if user already has a booking for this ride
    const existingBooking = await Booking.findOne({
      rideId: req.params.rideId,
      passengerId: req.clerkUser._id,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (existingBooking) {
      return res.status(400).json({ 
        success: false,
        message: 'You already have a booking for this ride' 
      });
    }

    // Create booking
    const booking = new Booking({
      rideId: ride._id,
      passengerId: req.clerkUser._id,
      driverId: ride.driverId,
      seats,
      totalAmount: ride.pricePerSeat * seats,
      pickupLocation,
      dropoffLocation,
      specialRequests,
      status: 'pending'
    });

    await booking.save();

    // Update ride
    ride.availableSeats -= seats;
    ride.bookings.push(booking._id);
    await ride.save();

    // Create notification for driver
    await createNotification({
      userId: ride.driverId,
      type: 'new_booking',
      title: 'New Booking Request',
      message: `${req.clerkUser.firstName} ${req.clerkUser.lastName} wants to book ${seats} seat(s) for your ride from ${ride.fromLocation} to ${ride.toLocation}.`,
      relatedId: booking._id,
      relatedModel: 'Booking'
    });

    await booking.populate([
      { path: 'passengerId', select: 'firstName lastName avatar rating' },
      { path: 'rideId', select: 'fromLocation toLocation departureDate departureTime' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Booking request sent successfully',
      booking
    });
  } catch (error) {
    console.error('Book ride error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during booking',
      error: error.message
    });
  }
});

// Get ride bookings (for driver)
router.get('/:rideId/bookings', requireAuth, async (req, res) => {
  try {
    const ride = await Ride.findOne({ 
      _id: req.params.rideId, 
      driverId: req.clerkUser._id 
    });

    if (!ride) {
      return res.status(404).json({ 
        success: false,
        message: 'Ride not found or unauthorized' 
      });
    }

    const bookings = await Booking.find({ rideId: req.params.rideId })
      .populate('passengerId', 'firstName lastName avatar rating phone')
      .sort({ createdAt: -1 });

    res.json({ 
      success: true,
      bookings 
    });
  } catch (error) {
    console.error('Get ride bookings error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;

