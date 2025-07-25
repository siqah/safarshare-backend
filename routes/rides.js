const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Ride = require('../models/Ride');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Create a new ride
router.post('/', auth, [
  body('fromLocation').trim().isLength({ min: 1 }),
  body('toLocation').trim().isLength({ min: 1 }),
  body('departureDate').isISO8601(),
  body('departureTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('pricePerSeat').isNumeric().isFloat({ min: 0 }),
  body('totalSeats').isInt({ min: 1, max: 8 }),
  body('vehicle.make').trim().isLength({ min: 1 }),
  body('vehicle.model').trim().isLength({ min: 1 }),
  body('vehicle.color').trim().isLength({ min: 1 }),
  body('vehicle.licensePlate').trim().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const rideData = {
      ...req.body,
      driverId: req.user._id,
      availableSeats: req.body.totalSeats
    };

    const ride = new Ride(rideData);
    await ride.save();

    // Populate driver info
    await ride.populate('driverId', 'firstName lastName avatar rating totalRides');

    res.status(201).json({
      message: 'Ride created successfully',
      ride
    });
  } catch (error) {
    console.error('Create ride error:', error);
    res.status(500).json({ message: 'Server error during ride creation' });
  }
});

// Search rides - Updated to show default rides and prioritize matches
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
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { from, to, date, maxPrice, minSeats, page = 1, limit = 10 } = req.query;
    
    // Base query for active rides
    const baseQuery = { 
      status: 'active',
      departureDate: { $gte: new Date() } // Only future rides
    };

    let rides;
    let total;

    // If no search criteria provided, show default rides
    if (!from && !to && !date && !maxPrice && !minSeats) {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      rides = await Ride.find(baseQuery)
        .populate('driverId', 'firstName lastName avatar rating totalRides')
        .sort({ departureDate: 1, departureTime: 1 })
        .skip(skip)
        .limit(parseInt(limit));

      total = await Ride.countDocuments(baseQuery);
    } else {
      // Build search queries with different priorities
      const exactMatches = { ...baseQuery };
      const partialMatches = { ...baseQuery };
      
      if (from) {
        exactMatches.fromLocation = { $regex: `^${from}$`, $options: 'i' };
        partialMatches.fromLocation = { $regex: from, $options: 'i' };
      }
      
      if (to) {
        exactMatches.toLocation = { $regex: `^${to}$`, $options: 'i' };
        partialMatches.toLocation = { $regex: to, $options: 'i' };
      }
      
      if (date) {
        const searchDate = new Date(date);
        const dateQuery = {
          $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
          $lt: new Date(searchDate.setHours(23, 59, 59, 999))
        };
        exactMatches.departureDate = dateQuery;
        partialMatches.departureDate = dateQuery;
      }
      
      if (maxPrice) {
        const priceQuery = { $lte: parseFloat(maxPrice) };
        exactMatches.pricePerSeat = priceQuery;
        partialMatches.pricePerSeat = priceQuery;
      }
      
      if (minSeats) {
        const seatsQuery = { $gte: parseInt(minSeats) };
        exactMatches.availableSeats = seatsQuery;
        partialMatches.availableSeats = seatsQuery;
      }

      // Get exact matches first
      const exactRides = await Ride.find(exactMatches)
        .populate('driverId', 'firstName lastName avatar rating totalRides')
        .sort({ departureDate: 1, departureTime: 1 })
        .limit(parseInt(limit));

      // Get partial matches excluding exact matches
      const exactIds = exactRides.map(ride => ride._id);
      const partialRides = await Ride.find({
        ...partialMatches,
        _id: { $nin: exactIds }
      })
        .populate('driverId', 'firstName lastName avatar rating totalRides')
        .sort({ departureDate: 1, departureTime: 1 })
        .limit(parseInt(limit) - exactRides.length);

      // Combine results with exact matches first
      rides = [...exactRides, ...partialRides];
      
      // Get total count for pagination
      total = await Ride.countDocuments(partialMatches);
    }

    res.json({
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
    res.status(500).json({ message: 'Server error during ride search' });
  }
});

// Add a new endpoint to get featured/popular rides for homepage
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
        'driverId.rating': -1 // Prioritize higher rated drivers
      })
      .limit(6);

    res.json({ rides });
  } catch (error) {
    console.error('Get featured rides error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get rides by driver
router.get('/driver/:driverId', async (req, res) => {
  try {
    const rides = await Ride.find({ driverId: req.params.driverId })
      .populate('driverId', 'firstName lastName avatar rating totalRides')
      .sort({ departureDate: -1 });

    res.json({ rides });
  } catch (error) {
    console.error('Get driver rides error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get my rides (as driver)
router.get('/my-rides', auth, async (req, res) => {
  try {
    const rides = await Ride.find({ driverId: req.user._id })
      .populate('driverId', 'firstName lastName avatar rating totalRides')
      .populate({
        path: 'bookings',
        populate: {
          path: 'passengerId',
          select: 'firstName lastName avatar rating'
        }
      })
      .sort({ departureDate: -1 });

    res.json({ rides });
  } catch (error) {
    console.error('Get my rides error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get ride by ID
router.get('/:rideId', async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId)
      .populate('driverId', 'firstName lastName avatar rating totalRides phone');

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    res.json({ ride });
  } catch (error) {
    console.error('Get ride error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update ride
router.put('/:rideId', auth, async (req, res) => {
  try {
    const ride = await Ride.findOne({ _id: req.params.rideId, driverId: req.user._id });
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found or unauthorized' });
    }

    const updates = req.body;
    Object.assign(ride, updates);
    await ride.save();

    await ride.populate('driverId', 'firstName lastName avatar rating totalRides');

    res.json({
      message: 'Ride updated successfully',
      ride
    });
  } catch (error) {
    console.error('Update ride error:', error);
    res.status(500).json({ message: 'Server error during ride update' });
  }
});

// Cancel ride
router.delete('/:rideId', auth, async (req, res) => {
  try {
    const ride = await Ride.findOne({ _id: req.params.rideId, driverId: req.user._id });
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found or unauthorized' });
    }

    ride.status = 'cancelled';
    await ride.save();

    res.json({ message: 'Ride cancelled successfully' });
  } catch (error) {
    console.error('Cancel ride error:', error);
    res.status(500).json({ message: 'Server error during ride cancellation' });
  }
});

module.exports = router;