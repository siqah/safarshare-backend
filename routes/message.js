import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import Message from '../models/Message.js';
import Ride from '../models/Ride.js';
import Booking from '../models/Booking.js';
import { getIO } from '../config/socket.js';

const router = express.Router();
// GET conversations for current user (optionally filter by ride)
router.get('/conversations', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { rideId } = req.query;

    const match = rideId ? { ride: rideId } : {};
    // Find peers we have messages with, grouped by ride+peer
    const pipeline = [
      { $match: match },
      { $match: { $or: [ { sender: req.user._id }, { recipient: req.user._id } ] } },
      {
        $addFields: {
          peer: {
            $cond: [ { $eq: ['$sender', req.user._id] }, '$recipient', '$sender' ]
          }
        }
      },
      {
        $group: {
          _id: { ride: '$ride', peer: '$peer' },
          lastMessage: { $last: '$$ROOT' },
          unread: {
            $sum: {
              $cond: [ { $and: [ { $eq: ['$recipient', req.user._id] }, { $eq: ['$isRead', false] } ] }, 1, 0 ]
            }
          }
        }
      },
      {
        $lookup: { from: 'users', localField: '_id.peer', foreignField: '_id', as: 'peerDoc' }
      },
      {
        $lookup: { from: 'rides', localField: '_id.ride', foreignField: '_id', as: 'rideDoc' }
      },
      { $unwind: { path: '$peerDoc', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$rideDoc', preserveNullAndEmptyArrays: true } },
      { $sort: { 'lastMessage.createdAt': -1 } },
      { $limit: 100 },
      {
        $project: {
          _id: 0,
          rideId: '$_id.ride',
          peer: { id: '$peerDoc._id', name: '$peerDoc.name', email: '$peerDoc.email' },
          lastMessage: {
            id: '$lastMessage._id',
            sender: '$lastMessage.sender',
            body: '$lastMessage.body',
            createdAt: '$lastMessage.createdAt'
          },
          ride: {
            id: '$rideDoc._id',
            startLocation: '$rideDoc.startLocation',
            destination: '$rideDoc.destination',
            departureTime: '$rideDoc.departureTime'
          },
          unread: 1
        }
      }
    ];

    const list = await Message.aggregate(pipeline);
    res.json({ conversations: list });
  } catch (e) {
    console.error('List conversations error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

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
    const me = req.user._id.toString();
    const peer = (req.query.peer || '').toString();

    // Base filter: messages in this ride
    let filter = { ride: rideId };
    if (peer) {
      // Filter conversation between me and peer
      filter = {
        ride: rideId,
        $or: [
          { sender: me, recipient: peer },
          { sender: peer, recipient: me },
        ],
      };
    }

    const [messages, total, unreadFromOther] = await Promise.all([
      Message.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments(filter),
      Message.countDocuments(peer
        ? { ride: rideId, recipient: me, sender: peer, isRead: false }
        : { ride: rideId, recipient: me, isRead: false }
      ),
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

    const me = req.user._id.toString();
    const peer = (req.body?.peer || '').toString();
    const readFilter = peer
      ? { ride: rideId, recipient: me, sender: peer, isRead: false }
      : { ride: rideId, recipient: me, isRead: false };

    await Message.updateMany(readFilter, { $set: { isRead: true } });
    res.json({ success: true });
  } catch (e) {
    console.error('Mark read error', e);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
