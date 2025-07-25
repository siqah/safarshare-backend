const express = require('express');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

const router = express.Router();

// Send a message
router.post('/', auth, async (req, res) => {
  try {
    const { receiverId, content, bookingId } = req.body;

    if (!receiverId || !content) {
      return res.status(400).json({ message: 'Receiver and content are required' });
    }

    // Verify the users are connected through a booking
    const booking = await Booking.findOne({
      _id: bookingId,
      $or: [
        { passengerId: req.user._id, 'rideId.driverId': receiverId },
        { passengerId: receiverId, 'rideId.driverId': req.user._id }
      ],
      paymentStatus: 'paid'
    }).populate('rideId');

    if (!booking) {
      return res.status(403).json({ message: 'You can only message users you have confirmed bookings with' });
    }

    const message = new Message({
      senderId: req.user._id,
      receiverId,
      content: content.trim(),
      bookingId
    });

    await message.save();
    await message.populate('senderId', 'firstName lastName avatar');

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get conversation between two users
router.get('/conversation/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId: req.user._id, receiverId: userId },
        { senderId: userId, receiverId: req.user._id }
      ]
    })
      .populate('senderId', 'firstName lastName avatar')
      .sort({ createdAt: 1 });

    res.json({ messages });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;