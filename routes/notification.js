import express from 'express';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/authMiddleware.js';
import { getIO } from '../config/socket.js';

const router = express.Router();

// Get my notifications
router.get('/', protect, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const [items, total, unread] = await Promise.all([
      Notification.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ user: req.user._id }),
      Notification.countDocuments({ user: req.user._id, isRead: false }),
    ]);
    res.json({ notifications: items, page, limit, total, unread });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unread count only
router.get('/unread-count', protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user._id, isRead: false });
    res.json({ unread: count });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark as read
router.post('/:id/read', protect, async (req, res) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!n) return res.status(404).json({ message: 'Not found' });
  const unread = await Notification.countDocuments({ user: req.user._id, isRead: false });
  const io = getIO();
  io.to(`driver:${req.user._id}`).emit('notification:count', { unread });
  io.to(`passenger:${req.user._id}`).emit('notification:count', { unread });
  res.json({ notification: n, unread });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark all as read
router.post('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, isRead: false }, { $set: { isRead: true } });
  const unread = 0;
  const io = getIO();
  io.to(`driver:${req.user._id}`).emit('notification:count', { unread });
  io.to(`passenger:${req.user._id}`).emit('notification:count', { unread });
  res.json({ success: true, unread });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a single notification
router.delete('/:id', protect, async (req, res) => {
  try {
    const n = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!n) return res.status(404).json({ message: 'Not found' });
    const unread = await Notification.countDocuments({ user: req.user._id, isRead: false });
    const io = getIO();
    io.to(`driver:${req.user._id}`).emit('notification:count', { unread });
    io.to(`passenger:${req.user._id}`).emit('notification:count', { unread });
    res.json({ success: true, unread });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Clear all read notifications
router.delete('/', protect, async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user._id, isRead: true });
    const unread = await Notification.countDocuments({ user: req.user._id, isRead: false });
    const io = getIO();
    io.to(`driver:${req.user._id}`).emit('notification:count', { unread });
    io.to(`passenger:${req.user._id}`).emit('notification:count', { unread });
    res.json({ success: true, unread });
  } catch (err) {
    console.error('Clear read notifications error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
