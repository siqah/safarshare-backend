import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
    ride:{type: mongoose.Schema.Types.ObjectId, ref:'Ride', required: true},
    passenger:{type: mongoose.Schema.Types.ObjectId, ref:'User', required: true},
    seatsBooked:{type: Number, required: true},
    status:{type: String, enum: ["booked", "cancelled"], default: "booked"},
    createdAt: {type: Date, default: Date.now}
})

export default mongoose.model("Booking", bookingSchema)