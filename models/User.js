import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: {type:String, required:true},
    name: { type: String, required: true },
    role: {type:String, enum: ["passenger", "driver"], default: "passenger"},
    driverProfile: {
        carModel: String,
        carPlate: String,
        seatsAvailable: Number,
        licenseNumber: String,
    }
    
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', userSchema);