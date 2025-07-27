const express = require('express');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

const router = express.Router();

// Send a message
router.post('/', auth, async (req, res) => {
  try {
    const { receiverId, content, bookingId, rideId } = req.body;

    if (!receiverId || !content) {
      return res.status(400).json({ 
        success: false,
        message: 'Receiver and content are required' 
      });
    }

    // Simplified validation - just check if booking exists and user is part of it
    let booking = null;
    if (bookingId) {
      booking = await Booking.findById(bookingId)
        .populate('rideId')
        .populate('passengerId')
        .populate({
          path: 'rideId',
          populate: {
            path: 'driverId'
          }
        });

      if (!booking) {
        return res.status(404).json({ 
          success: false,
          message: 'Booking not found' 
        });
      }

      // Check if current user is either the passenger or the driver
      const isPassenger = booking.passengerId._id.toString() === req.user._id.toString();
      const isDriver = booking.rideId.driverId._id.toString() === req.user._id.toString();

      if (!isPassenger && !isDriver) {
        return res.status(403).json({ 
          success: false,
          message: 'You are not authorized to send messages for this booking' 
        });
      }

      // Check if the receiverId matches the other person in the booking
      const expectedReceiverId = isPassenger ? booking.rideId.driverId._id.toString() : booking.passengerId._id.toString();
      if (receiverId !== expectedReceiverId) {
        return res.status(403).json({ 
          success: false,
          message: 'Invalid receiver for this booking' 
        });
      }
    }

    const message = new Message({
      senderId: req.user._id,
      receiverId,
      content: content.trim(),
      bookingId,
      rideId: rideId || (booking ? booking.rideId._id : null),
      read: false
    });

    await message.save();
    await message.populate('senderId', 'firstName lastName avatar');
    await message.populate('receiverId', 'firstName lastName avatar');

    // Emit real-time message via socket
    if (req.io) {
      req.io.to(`user_${receiverId}`).emit('new-message', {
        message,
        sender: message.senderId
      });
    }

    res.status(201).json({ 
      success: true,
      message 
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
      .populate('receiverId', 'firstName lastName avatar')
      .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      { 
        senderId: userId, 
        receiverId: req.user._id, 
        read: false 
      },
      { read: true }
    );

    res.json({ 
      success: true,
      messages 
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Get all conversations for a user
router.get('/conversations', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get all messages where user is sender or receiver
    const messages = await Message.find({
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ]
    })
    .populate('senderId', 'firstName lastName avatar')
    .populate('receiverId', 'firstName lastName avatar')
    .sort({ createdAt: -1 });

    // Group by conversation
    const conversationsMap = new Map();
    
    messages.forEach(message => {
      const otherUserId = message.senderId._id.toString() === userId.toString() 
        ? message.receiverId._id.toString() 
        : message.senderId._id.toString();
      
      if (!conversationsMap.has(otherUserId)) {
        conversationsMap.set(otherUserId, {
          _id: otherUserId,
          otherUser: message.senderId._id.toString() === userId.toString() 
            ? message.receiverId 
            : message.senderId,
          lastMessage: message,
          unreadCount: 0
        });
      }
      
      // Count unread messages (only count messages sent TO the current user)
      if (message.receiverId._id.toString() === userId.toString() && !message.read) {
        const conversation = conversationsMap.get(otherUserId);
        conversation.unreadCount++;
      }
    });

    const conversations = Array.from(conversationsMap.values());
    
    res.json({
      success: true,
      conversations
    });
    
  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversations'
    });
  }
});

// Mark message as read
router.put('/:messageId/read', auth, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.user._id;

    const message = await Message.findOneAndUpdate(
      { 
        _id: messageId, 
        receiverId: userId 
      },
      { read: true },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    res.json({
      success: true,
      message
    });
    
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark message as read'
    });
  }
});

// Get messages for a specific booking
router.get('/booking/:bookingId', auth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user._id;

    // Verify user is part of this booking
    const booking = await Booking.findOne({
      _id: bookingId,
      $or: [
        { passengerId: userId },
        { 'rideId.driverId': userId }
      ]
    }).populate('rideId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or unauthorized'
      });
    }

    const messages = await Message.find({ bookingId })
      .populate('senderId', 'firstName lastName avatar')
      .populate('receiverId', 'firstName lastName avatar')
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      messages,
      booking
    });
    
  } catch (error) {
    console.error('Error getting booking messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get messages'
    });
  }
});

module.exports = router;