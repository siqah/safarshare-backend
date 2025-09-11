import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import Message from '../models/Message.js';
import Ride from '../models/Ride.js';
import Booking from '../models/Booking.js';
import { getIO } from '../config/socket.js';

const router = express.Router();

// Helper: verify user participates in ride (driver or booked passenger)
async function authorizeParticipant(rideId, userId) {
  const ride = await Ride.findById(rideId).select('driver');
  if (!ride) return null;
  if (ride.driver.toString() === userId.toString()) return { ride, role: 'driver' };
  const booking = await Booking.findOne({ ride: rideId, passenger: userId, status: 'booked' }).select('_id');
  if (booking) return { ride, role: 'passenger' };
  return null;
}

// GET messages for a ride (pagination)
router.get('/ride/:rideId', protect, async (req, res) => {
  try {
    const { rideId } = req.params;
    const auth = await authorizeParticipant(rideId, req.user._id);
    if (!auth) return res.status(403).json({ message: 'No access to this conversation' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 30));
    const skip = (page - 1) * limit;

    const [messages, total, unreadFromOther] = await Promise.all([
      Message.find({ ride: rideId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments({ ride: rideId }),
      Message.countDocuments({ ride: rideId, recipient: req.user._id, isRead: false }),
    ]);

    res.json({
      messages: messages.reverse(),
      page,
      limit,
      total,
      unreadFromOther,
    });
  } catch (e) {
    console.error('Get messages error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET participants (booked passengers) for a ride (driver only)
router.get('/ride/:rideId/participants', protect, async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await Ride.findById(rideId).select('driver');
    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (ride.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only driver can view participants' });
    }
    const bookings = await Booking.find({ ride: rideId, status: 'booked' })
      .populate({ path: 'passenger', select: 'name email' })
      .select('passenger');
    const participants = bookings.map(b => ({
      id: b.passenger?._id,
      name: b.passenger?.name,
      email: b.passenger?.email,
    })).filter(p => p.id);
    res.json({ participants });
  } catch (e) {
    console.error('Get participants error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST send message
router.post('/ride/:rideId', protect, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { body, passengerId } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ message: 'Empty message' });

    const auth = await authorizeParticipant(rideId, req.user._id);
    if (!auth) return res.status(403).json({ message: 'No access' });

    let recipientId;
    if (auth.role === 'driver') {
      if (!passengerId) return res.status(400).json({ message: 'passengerId required' });
      const booked = await Booking.findOne({ ride: rideId, passenger: passengerId, status: 'booked' }).select('_id');
      if (!booked) return res.status(400).json({ message: 'Passenger not booked' });
      recipientId = passengerId;
    } else {
      recipientId = auth.ride.driver;
    }

    const message = await Message.create({
      ride: rideId,
      sender: req.user._id,
      recipient: recipientId,
      body: body.trim(),
    });

    const io = getIO();
    // Emit to role rooms
    io.to(`driver:${auth.ride.driver.toString()}`).emit('message:new', {
      id: message._id,
      rideId,
      sender: message.sender.toString(),
      recipient: message.recipient.toString(),
      body: message.body,
      createdAt: message.createdAt,
    });
    io.to(`passenger:${recipientId.toString()}`).emit('message:new', {
      id: message._id,
      rideId,
      sender: message.sender.toString(),
      recipient: message.recipient.toString(),
      body: message.body,
      createdAt: message.createdAt,
    });

    res.status(201).json({ message });
  } catch (e) {
    console.error('Send message error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark messages addressed TO me in a ride as read
router.post('/ride/:rideId/read', protect, async (req, res) => {
  try {
    const { rideId } = req.params;
    const auth = await authorizeParticipant(rideId, req.user._id);
    if (!auth) return res.status(403).json({ message: 'No access' });

    await Message.updateMany({ ride: rideId, recipient: req.user._id, isRead: false }, { $set: { isRead: true } });
    res.json({ success: true });
  } catch (e) {
    console.error('Mark read error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
