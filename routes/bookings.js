const express = require('express');
const { body, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

const router = express.Router();

// Create booking
router.post('/', auth, [
  body('rideId').isMongoId(),
  body('seatsBooked').isInt({ min: 1, max: 4 }),
  body('message').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { rideId, seatsBooked, message } = req.body;

    // Check if ride exists and is active
    const ride = await Ride.findById(rideId).populate('driverId');
    if (!ride || ride.status !== 'active') {
      return res.status(404).json({ message: 'Ride not found or not available' });
    }

    // Check if user is trying to book their own ride
    if (ride.driverId._id.equals(req.user._id)) {
      return res.status(400).json({ message: 'Cannot book your own ride' });
    }

    // Check if enough seats available
    if (ride.availableSeats < seatsBooked) {
      return res.status(400).json({ message: 'Not enough seats available' });
    }

    // Check if user already has a booking for this ride
    const existingBooking = await Booking.findOne({ rideId, passengerId: req.user._id });
    if (existingBooking) {
      return res.status(400).json({ message: 'You already have a booking for this ride' });
    }

    const totalAmount = ride.pricePerSeat * seatsBooked;

    const booking = new Booking({
      rideId,
      passengerId: req.user._id,
      seatsBooked,
      message,
      totalAmount
    });

    await booking.save();
    await booking.populate('passengerId', 'firstName lastName avatar rating');
    await booking.populate('rideId', 'fromLocation toLocation departureDate departureTime');

    // Add booking to ride
    ride.bookings.push(booking._id);
    await ride.save();

    // Create notification for driver
    const notification = new Notification({
      userId: ride.driverId._id,
      type: 'booking_request',
      title: 'New Booking Request',
      message: `${req.user.firstName} ${req.user.lastName} wants to book ${seatsBooked} seat(s) for your ride from ${ride.fromLocation} to ${ride.toLocation}`,
      data: { bookingId: booking._id, rideId: ride._id },
      actionUrl: `/bookings/${booking._id}`
    });
    await notification.save();

    // Send real-time notification
    req.io.to(ride.driverId._id.toString()).emit('new-notification', {
      type: 'booking_request',
      notification
    });

    res.status(201).json({
      message: 'Booking request sent successfully',
      booking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ message: 'Server error during booking creation' });
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

// Accept booking
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

    // Create notification for passenger
    const notification = new Notification({
      userId: booking.passengerId._id,
      type: 'booking_accepted',
      title: 'Booking Accepted',
      message: `Your booking for the ride from ${booking.rideId.fromLocation} to ${booking.rideId.toLocation} has been accepted!`,
      data: { bookingId: booking._id, rideId: booking.rideId._id },
      actionUrl: `/bookings/${booking._id}`
    });
    await notification.save();

    // Send real-time notification
    req.io.to(booking.passengerId._id.toString()).emit('new-notification', {
      type: 'booking_accepted',
      notification
    });

    res.json({
      message: 'Booking accepted successfully',
      booking
    });
  } catch (error) {
    console.error('Accept booking error:', error);
    res.status(500).json({ message: 'Server error during booking acceptance' });
  }
});

// Decline booking
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

    // Create notification for passenger
    const notification = new Notification({
      userId: booking.passengerId._id,
      type: 'booking_declined',
      title: 'Booking Declined',
      message: `Your booking for the ride from ${booking.rideId.fromLocation} to ${booking.rideId.toLocation} has been declined.`,
      data: { bookingId: booking._id, rideId: booking.rideId._id },
      actionUrl: `/search`
    });
    await notification.save();

    // Send real-time notification
    req.io.to(booking.passengerId._id.toString()).emit('new-notification', {
      type: 'booking_declined',
      notification
    });

    res.json({
      message: 'Booking declined successfully',
      booking
    });
  } catch (error) {
    console.error('Decline booking error:', error);
    res.status(500).json({ message: 'Server error during booking decline' });
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

module.exports = router;