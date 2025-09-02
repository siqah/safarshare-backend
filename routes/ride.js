import express from 'express';
import Ride from '../models/Ride.js';
import Booking from '../models/Booking.js';
import { protect, } from '../middleware/authMiddleware.js';

const router = express.Router();

// Driver rides
router.post('/driver/rides', protect, async (req, res) => {
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

//Passsenger route
router.get('/available-rides', protect, async (req, res) => {
    try{
        if(req.user.role !== 'passenger'){
            return res.status(403).json({message : "Only passenger can view available rides"});
        }
        const rides = await Ride.find({status: 'active', availableSeats: {$gt: 0}}).populate('driver', 'name email').populate('passenger', 'name email');
        res.json({rides});
    }catch(err){
        console.error("Get rides error:", err);
        res.status(500).json({message: "Server error"});
    }
})
// Book a ride (Passenger only)
router.post('/book/:rideId', protect, async (req, res) => {
    try{
        if(req.user.role !== 'passenger'){
            return res.status(403).json({message : "Only passenger can book rides"});
        }
        const ride = await Ride.findById(req.params.rideId);
        if(!ride || ride.status !== 'active'){
            return res.status(404).json({message: "Ride not found or not active"});
        }
        res.json({ride});
    }catch(err){
        console.error("Get ride error:", err);
        res.status(500).json({message: "Server error"});
    }
});

// Cancel a booking (Passenger only)
router.post('/cancel/:bookingId', protect, async (req, res) => {
    try{
        if(req.user.role !== 'passenger'){
            return res.status(403).json({message : "Only passenger can cancel bookings"});
        }
        const booking = await Booking.findById(req.params.bookingId).populate('ride');
        if(!booking || booking.status !== 'booked'){
            return res.status(404).json({message: "Booking not found or already cancelled"});
        }
        if(booking.passenger.toString() !== req.user._id.toString()){
            return res.status(403).json({message: "Not authorized to cancel this booking"});
        }
        booking.status = 'cancelled';
        await booking.ride.updateOne({$inc: {availableSeats: booking.seatsBooked}});
        await booking.save();
        res.json({message: "Booking cancelled", booking});
    }catch(err){
        console.error("Cancel booking error:", err);
        res.status(500).json({message: "Server error"});
    }
});

export default router;