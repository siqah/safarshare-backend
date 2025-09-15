import express from 'express';
import Ride from '../models/Ride.js';
import Booking from '../models/Booking.js';
import { protect, } from '../middleware/authMiddleware.js';
import {getIO} from '../config/socket.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// Get a ride by id (use a specific path to avoid conflicts with other routes like /myRides)
router.get('/details/:id', protect, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).populate('driver', 'name email');
    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    // Authorization: driver or any passenger who booked can view; for simplicity allow authenticated users to fetch basic route info
    res.json({ ride });
  } catch (err) {
    console.error('Get ride by id error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Driver rides
router.get('/driver/rides', protect, async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ message: "Only drivers can access this route" });
        }
        const rides = await Ride.find({ driver: req.user._id }).populate('passenger', 'name email');
        res.json({ rides });
    } catch (err) {
        console.error("Driver rides error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Create a new ride (Driver only)
router.post('/createRide', protect, async (req, res) => {
    try{
        const { startLocation, destination, departureTime, availableSeats, price } = req.body;
        if(req.user.role !== 'driver'){
            return res.status(403).json({message : "Only driver can create rides"});
        }
        const ride = await Ride.create({
            driver: req.user._id,
            startLocation,
            destination,
            departureTime,
            availableSeats,
            price
        })
        await ride.populate('driver', 'name email');
        await ride.populate('passenger', 'name email');
        await ride.save();
        res.status(201).json({message: 'ride created', ride});

    }catch(err){
        console.error("Create ride error:", err);
        res.status(500).json({message: "Server error"});
    }
})

// Get all active rides
router.get('/myRides', protect, async (req, res) => {
    try{
        const rides = await Ride.find({status: 'active'}).populate('driver', 'name email').populate('passenger', 'name email');
        res.json({rides});
        
    }catch(err){
        console.error("Get rides error:", err);
        res.status(500).json({message: "Server error"});
    }
})

router.put(":id/cancel", protect, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Make sure only the assigned driver can cancel their ride
    if (ride.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    ride.status = "canceled";
    ride.canceledAt = new Date();

    await ride.save();

    // 🔔 Notify driver
    const driverNote = await Notification.create({
      user: ride.driver,
      type: 'cancellation',
      title: 'Ride cancelled',
      message: `You cancelled the ride to ${ride.destination}.`,
      ride: ride._id,
    });
    const io = getIO();
    io.to(`driver:${ride.driver}`).emit("notification", {
      id: driverNote._id,
      type: driverNote.type,
      title: driverNote.title,
      message: driverNote.message,
      rideId: ride._id,
      createdAt: driverNote.createdAt,
    });
    const driverUnread = await Notification.countDocuments({ user: ride.driver, isRead: false });
    io.to(`driver:${ride.driver}`).emit('notification:count', { unread: driverUnread });

    // Cancel all active bookings for this ride and notify each passenger
    const activeBookings = await Booking.find({ ride: req.params.id, status: "booked" });
    for (const b of activeBookings) {
      b.status = 'cancelled';
      await b.save();
      const pNote = await Notification.create({
        user: b.passenger,
        type: 'cancellation',
        title: 'Ride cancelled',
        message: `The ride to ${ride.destination} has been cancelled by the driver.`,
        ride: ride._id,
        booking: b._id,
      });
      io.to(`passenger:${b.passenger}`).emit("notification", {
        id: pNote._id,
        type: pNote.type,
        title: pNote.title,
        message: pNote.message,
        rideId: ride._id,
        bookingId: b._id,
        createdAt: pNote.createdAt,
      });
      const pUnread = await Notification.countDocuments({ user: b.passenger, isRead: false });
      io.to(`passenger:${b.passenger}`).emit('notification:count', { unread: pUnread });
    }

    res.json({ message: "Ride canceled successfully", ride });
  } catch (err) {
    console.error("Cancel ride error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


//Passsenger route
router.get('/available-rides', protect, async (req, res) => {
    try{
  
        const { startLocation, destination, date, minSeats } = req.query;
        const query = { status: 'active', availableSeats: { $gt: 0 } };
        if(startLocation) query.startLocation = { $regex: new RegExp(startLocation, 'i') };
        if(destination) query.destination = { $regex: new RegExp(destination, 'i') };
        if(minSeats) query.availableSeats = { $gte: Number(minSeats) };
        if(date){
            // date expected as YYYY-MM-DD; filter rides on that calendar day
            const d = new Date(date);
            if(!isNaN(d.getTime())){
                const next = new Date(d);
                next.setDate(d.getDate() + 1);
                query.departureTime = { $gte: d, $lt: next };
            }
        }
        const rides = await Ride.find(query)
            .sort({ departureTime: 1 })
            .populate('driver', 'name email');
        res.json({rides});
    }catch(err){
        console.error("Get rides error:", err);
        res.status(500).json({message: "Server error"});
    }
})
router.post("/book/:rideId", protect, async (req, res) => {
  try {
    const seatsRequested = Math.max(1, parseInt(req.body.seats) || 1);

    // Prevent duplicate booking by same passenger for same ride
    const existingBooking = await Booking.findOne({
      ride: req.params.rideId,
      passenger: req.user._id,
      status: "booked",
    });

    if (existingBooking) {
      return res.status(400).json({ message: "You already have a booking for this ride" });
    }

    // Check ride status first; cannot book if driver cancelled or ride inactive
    const rideDoc = await Ride.findById(req.params.rideId);
    if (!rideDoc) {
      return res.status(404).json({ message: "Ride not found" });
    }
    if (rideDoc.status !== "active") {
      return res.status(400).json({ message: "Ride is not active (may be cancelled by driver or completed)" });
    }

    // Atomically decrement seats if available
    const ride = await Ride.findOneAndUpdate(
      {
        _id: req.params.rideId,
        status: "active",
        availableSeats: { $gte: seatsRequested },
      },
      { $inc: { availableSeats: -seatsRequested } },
      { new: true }
    ).populate("driver", "name email");

    if (!ride) {
      return res.status(404).json({ message: "Ride not found, not active, or insufficient seats" });
    }

    // Create booking
    const booking = await Booking.create({
      ride: ride._id,
      passenger: req.user._id,
      seatsBooked: seatsRequested,
      status: "booked",
    });

    // Populate ride+driver for response
    await booking.populate({
      path: "ride",
      populate: { path: "driver", select: "name email" },
    });

    // 🔔 Persist + notify driver
  const note = await Notification.create({
      user: ride.driver._id,
      type: 'booking',
      title: 'New booking',
      message: `${req.user.name || 'A passenger'} booked ${seatsRequested} seat(s).`,
      ride: ride._id,
      booking: booking._id,
    });
    const io = getIO();
  io.to(`driver:${ride.driver._id}`).emit("notification", {
      id: note._id,
      type: note.type,
      title: note.title,
      message: note.message,
      rideId: ride._id,
      bookingId: booking._id,
      seatsDelta: -seatsRequested,
      createdAt: note.createdAt,
    });
  console.log('Emitted notification to driver:', `driver:${ride.driver._id}`);
  // driver unread count
  const driverUnread = await Notification.countDocuments({ user: ride.driver._id, isRead: false });
  io.to(`driver:${ride.driver._id}`).emit('notification:count', { unread: driverUnread });

    // Notify passenger
    const pNote = await Notification.create({
      user: req.user._id,
      type: 'booking',
      title: 'Booking confirmed',
      message: `You booked ${seatsRequested} seat(s) to ${ride.destination}.`,
      ride: ride._id,
      booking: booking._id,
    });
  io.to(`passenger:${req.user._id}`).emit("notification", {
      id: pNote._id,
      type: pNote.type,
      title: pNote.title,
      message: pNote.message,
      rideId: ride._id,
      bookingId: booking._id,
      createdAt: pNote.createdAt,
    });
  console.log('Emitted notification to passenger:', `passenger:${req.user._id}`);
  const passengerUnread = await Notification.countDocuments({ user: req.user._id, isRead: false });
  io.to(`passenger:${req.user._id}`).emit('notification:count', { unread: passengerUnread });

    res.status(201).json({ message: "Ride booked", ride, booking });
  } catch (err) {
    console.error("Book ride error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * 📌 Passenger bookings list
 */
router.get("/bookings", protect, async (req, res) => {
  try {
    const bookings = await Booking.find({
      passenger: req.user._id,
      status: { $in: ["booked", "cancelled"] },
    })
      .sort({ createdAt: -1 })
      .populate({ path: "ride", populate: { path: "driver", select: "name email" } });

    res.json({ bookings });
  } catch (err) {
    console.error("List bookings error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * 📌 Cancel a booking (Passenger only)
 */
router.post("/cancel/:bookingId", protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate("ride");

    if (!booking || booking.status !== "booked") {
      return res.status(404).json({ message: "Booking not found or already cancelled" });
    }

    if (booking.passenger.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to cancel this booking" });
    }

    // Update booking & restore seats
    booking.status = "cancelled";
    await Ride.findByIdAndUpdate(booking.ride._id, {
      $inc: { availableSeats: booking.seatsBooked },
    });
    await booking.save();

    // 🔔 Persist + notify driver
    const note = await Notification.create({
      user: booking.ride.driver,
      type: 'cancellation',
      title: 'Booking cancelled',
      message: `${req.user.name || 'A passenger'} cancelled ${booking.seatsBooked} seat(s).`,
      ride: booking.ride._id,
      booking: booking._id,
    });
    const io = getIO();
  io.to(`driver:${booking.ride.driver}`).emit("notification", {
      id: note._id,
      type: note.type,
      title: note.title,
      message: note.message,
      rideId: booking.ride._id,
      bookingId: booking._id,
      seatsDelta: booking.seatsBooked,
      createdAt: note.createdAt,
    });
  console.log('Emitted notification to driver:', `driver:${booking.ride.driver}`);
  const driverUnread2 = await Notification.countDocuments({ user: booking.ride.driver, isRead: false });
  io.to(`driver:${booking.ride.driver}`).emit('notification:count', { unread: driverUnread2 });

    // Notify passenger
    const pNote = await Notification.create({
      user: req.user._id,
      type: 'cancellation',
      title: 'Booking cancelled',
      message: `You cancelled ${booking.seatsBooked} seat(s) for this ride.`,
      ride: booking.ride._id,
      booking: booking._id,
    });
  io.to(`passenger:${req.user._id}`).emit("notification", {
      id: pNote._id,
      type: pNote.type,
      title: pNote.title,
      message: pNote.message,
      rideId: booking.ride._id,
      bookingId: booking._id,
      createdAt: pNote.createdAt,
    });
  console.log('Emitted notification to passenger:', `passenger:${req.user._id}`);
  const passengerUnread2 = await Notification.countDocuments({ user: req.user._id, isRead: false });
  io.to(`passenger:${req.user._id}`).emit('notification:count', { unread: passengerUnread2 });

    res.json({ message: "Booking cancelled. You can rebook later if the ride remains active and seats are available.", booking });
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
