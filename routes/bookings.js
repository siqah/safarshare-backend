const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const Notification = require('../models/Notification'); // Add this import

const router = express.Router();

// Create a booking
router.post('/', auth, async (req, res) => {
  console.log('Booking request received from user:', req.user._id);
  console.log('Request body:', req.body);
  
  try {
    const { rideId, seatsBooked, message } = req.body;
    const passengerId = req.user._id;

    // Validate input
    if (!rideId || !seatsBooked) {
      return res.status(400).json({ 
        message: 'Ride ID and seats booked are required' 
      });
    }

    // Check if ride exists and has available seats
    const ride = await Ride.findById(rideId).populate('driverId');
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    if (ride.driverId._id.toString() === passengerId.toString()) {
      return res.status(400).json({ 
        message: 'You cannot book your own ride' 
      });
    }

    if (ride.availableSeats < seatsBooked) {
      return res.status(400).json({ 
        message: 'Not enough available seats' 
      });
    }

    // Check if user already has a booking for this ride
    const existingBooking = await Booking.findOne({
      rideId,
      passengerId,
      status: { $nin: ['cancelled', 'declined'] }
    });

    if (existingBooking) {
      return res.status(400).json({ 
        message: 'You already have a booking for this ride' 
      });
    }

    // Create booking
    const booking = new Booking({
      rideId,
      passengerId,
      seatsBooked: parseInt(seatsBooked),
      message: message || '',
      status: 'pending',
      paymentStatus: 'pending',
      totalAmount: ride.pricePerSeat * seatsBooked
    });

    await booking.save();
    
    // Populate the booking for response
    const populatedBooking = await Booking.findById(booking._id)
      .populate('rideId')
      .populate('passengerId', 'firstName lastName email avatar');

    console.log('Booking created successfully:', booking._id);

    // Emit real-time notification to driver
    if (req.io) {
      req.io.to(`user_${ride.driverId._id}`).emit('new-booking', {
        booking: populatedBooking,
        message: `New booking request from ${req.user.firstName} ${req.user.lastName}`
      });
    }

    res.status(201).json({
      success: true,
      booking: populatedBooking,
      message: 'Booking request sent successfully'
    });

  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during booking creation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get my bookings (as passenger)
router.get('/my-bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ passengerId: req.user._id })
      .populate('rideId')
      .populate({
        path: 'rideId',
        populate: {
          path: 'driverId',
          select: 'firstName lastName avatar rating phone'
        }
      })
      .sort({ createdAt: -1 });

    res.json({ bookings });
  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get bookings for my rides (as driver)
router.get('/ride-bookings', auth, async (req, res) => {
  try {
    const rides = await Ride.find({ driverId: req.user._id }).select('_id');
    const rideIds = rides.map(ride => ride._id);

    const bookings = await Booking.find({ rideId: { $in: rideIds } })
      .populate('passengerId', 'firstName lastName avatar rating phone')
      .populate('rideId', 'fromLocation toLocation departureDate departureTime')
      .sort({ createdAt: -1 });

    res.json({ bookings });
  } catch (error) {
    console.error('Get ride bookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept booking - Fix the notification creation
router.put('/:bookingId/accept', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .populate('rideId')
      .populate('passengerId', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if user is the driver of the ride
    if (!booking.rideId.driverId.equals(req.user._id)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({ message: 'Booking is not pending' });
    }

    // Check if enough seats still available
    if (booking.rideId.availableSeats < booking.seatsBooked) {
      return res.status(400).json({ message: 'Not enough seats available' });
    }

    booking.status = 'accepted';
    await booking.save();

    // Update available seats
    booking.rideId.availableSeats -= booking.seatsBooked;
    await booking.rideId.save();

    // Send real-time notification (without creating notification document for now)
    if (req.io) {
      req.io.to(`user_${booking.passengerId._id}`).emit('new-notification', {
        type: 'booking_accepted',
        title: 'Booking Accepted',
        message: `Your booking for the ride from ${booking.rideId.fromLocation} to ${booking.rideId.toLocation} has been accepted!`,
        bookingId: booking._id
      });
    }

    res.json({
      success: true,
      message: 'Booking accepted successfully',
      booking
    });
  } catch (error) {
    console.error('Accept booking error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during booking acceptance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Decline booking - Fix similar issues
router.put('/:bookingId/decline', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .populate('rideId')
      .populate('passengerId', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if user is the driver of the ride
    if (!booking.rideId.driverId.equals(req.user._id)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({ message: 'Booking is not pending' });
    }

    booking.status = 'declined';
    await booking.save();

    // Send real-time notification
    if (req.io) {
      req.io.to(`user_${booking.passengerId._id}`).emit('new-notification', {
        type: 'booking_declined',
        title: 'Booking Declined',
        message: `Your booking for the ride from ${booking.rideId.fromLocation} to ${booking.rideId.toLocation} has been declined.`,
        bookingId: booking._id
      });
    }

    res.json({
      success: true,
      message: 'Booking declined successfully',
      booking
    });
  } catch (error) {
    console.error('Decline booking error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during booking decline',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Cancel booking (by passenger)
router.put('/:bookingId/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('rideId');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if user is the passenger
    if (!booking.passengerId.equals(req.user._id)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking is already cancelled' });
    }

    const previousStatus = booking.status;
    booking.status = 'cancelled';
    await booking.save();

    // If booking was accepted, restore available seats
    if (previousStatus === 'accepted') {
      booking.rideId.availableSeats += booking.seatsBooked;
      await booking.rideId.save();
    }

    res.json({
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ message: 'Server error during booking cancellation' });
  }
});

// Get pending booking requests (for drivers)
router.get('/requests', auth, async (req, res) => {
  try {
    // Find all rides by this driver
    const rides = await Ride.find({ driverId: req.user._id }).select('_id');
    const rideIds = rides.map(ride => ride._id);

    // Find all pending booking requests for these rides
    const bookingRequests = await Booking.find({ 
      rideId: { $in: rideIds },
      status: 'pending'
    })
      .populate('passengerId', 'firstName lastName avatar rating phone')
      .populate('rideId', 'fromLocation toLocation departureDate departureTime pricePerSeat')
      .sort({ createdAt: -1 });

    res.json({ requests: bookingRequests });
  } catch (error) {
    console.error('Get booking requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;