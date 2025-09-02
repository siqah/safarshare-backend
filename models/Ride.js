import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema({
    driver: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    passenger: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    startLocation: {type: String, required: true},
    destination: {type: String, required: true},
    departureTime: {type: Date, required: true},
    availableSeats: {type: Number, required: true},
    price: {type: Number, required: true},
    status: {type: String, enum: ["active", "completed", "cancelled"], default: "active"},
    createdAt: {type: Date, default: Date.now}
})

export default mongoose.model("Ride", rideSchema);
