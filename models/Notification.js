import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['booking', 'cancellation', 'system'], default: 'system' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Notification', notificationSchema);
