const express = require('express');
const User = require('../models/User');
const Ride = require('../models/Ride');
const Booking = require('../models/Booking');
const Message = require('../models/Message');
const router = express.Router();


// Dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalRiders,
      totalDrivers,
      totalRides,
      totalBookings,
      totalMessages,
      activeRides,
      pendingBookings,
      recentUsers,
      topDrivers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'rider' }),
      User.countDocuments({ role: 'driver' }),
      Ride.countDocuments(),
      Booking.countDocuments(),
      Message.countDocuments(),
      Ride.countDocuments({ status: 'active' }),
      Booking.countDocuments({ status: 'pending' }),
      User.find().sort({ createdAt: -1 }).limit(5).select('firstName lastName email role createdAt'),
      User.find({ role: 'driver' }).sort({ rating: -1, totalRides: -1 }).limit(5).select('firstName lastName rating totalRides')
    ]);

    res.json({
      stats: {
        totalUsers,
        totalRiders,
        totalDrivers,
        totalRides,
        totalBookings,
        totalMessages,
        activeRides,
        pendingBookings
      },
      recentUsers,
      topDrivers
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// User management
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1'), 1);
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const search = req.query.search?.trim() || '';
    const role = req.query.role?.trim() || '';

    const filter = {};
    if (search) {
      filter.$or = [
        { email: new RegExp(search, 'i') },
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') }
      ];
    }
    if (role && ['rider', 'driver', 'admin'].includes(role)) {
      filter.role = role;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-__v'),
      User.countDocuments(filter)
    ]);

    res.json({
      users,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { role, isActive } = req.body;
    const updateData = {};

    if (role && ['rider', 'driver', 'admin'].includes(role)) {
      updateData.role = role;
      updateData.isDriver = role === 'driver';
    }
    if (typeof isActive === 'boolean') {
      updateData.isActive = isActive;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Ride management
router.get('/rides', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1'), 1);
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const status = req.query.status?.trim() || '';

    const filter = {};
    if (status) filter.status = status;

    const [rides, total] = await Promise.all([
      Ride.find(filter)
        .populate('driverId', 'firstName lastName email rating')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Ride.countDocuments(filter)
    ]);

    res.json({
      rides,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    });
  } catch (error) {
    console.error('Admin rides error:', error);
    res.status(500).json({ error: 'Failed to fetch rides' });
  }
});

// Booking management
router.get('/bookings', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1'), 1);
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const status = req.query.status?.trim() || '';

    const filter = {};
    if (status) filter.status = status;

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('passengerId', 'firstName lastName email')
        .populate('rideId', 'fromLocation toLocation departureTime')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Booking.countDocuments(filter)
    ]);

    res.json({
      bookings,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    });
  } catch (error) {
    console.error('Admin bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

module.exports = router;
