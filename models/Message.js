import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  isRead: { type: Boolean, default: false, index: true },
}, { timestamps: true });

messageSchema.index({ ride: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
