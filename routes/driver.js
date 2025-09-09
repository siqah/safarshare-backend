import express from "express";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";
import mongoose from "mongoose";


const router = express.Router();

//Upgrade user to driver
router.post('/upgrade', protect, async (req,res) =>{
    try{
        const{carModel, carPlate, seatsAvailable, licenseNumber} = req.body;
        const userId = req.user.id;
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                role: "driver",
                driverProfile:{
                    carModel,
                    carPlate,
                    seatsAvailable,
                    licenseNumber,
                }
            },
            {new:true}
        )
        res.json({message: "user upgraded to driver", user: updatedUser})
    }catch(err){
        res.status(500).json({message: "Server error", error: err});
    }
})

router.post('/complete', protect, async (req, res) => {
    try{
        const userId = req.user.id;
        const user = await User.findById(userId);
        if(user.role !== "driver"){
            return res.status(403).json({message: "Only drivers can complete rides"});
        }
        user.driverProfile.ridesCompleted += 1;
        await user.save();
        res.json({message: "Ride completed", ridesCompleted: user.driverProfile.ridesCompleted});
        

    }catch(error){
        console("Error completing ride:", error);
        res.status(500).json({message: "Server error", error});

    }
})

router.delete('/rides/:id', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user || user.role !== "driver") {
            return res.status(403).json({ message: "Only drivers can delete rides" });
        }

        const rideId = req.params.id;
        if (!rideId) {
            return res.status(400).json({ message: "Ride id is required" });
        }

        if (!mongoose.Types.ObjectId.isValid(rideId)) {
            return res.status(400).json({ message: "Invalid ride id" });
        }

        const { default: Ride } = await import("../models/Ride.js");
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: "Ride not found" });
        }

        if (ride.driver.toString() !== userId) {
            return res.status(403).json({ message: "Not authorized to delete this ride" });
        }

        await ride.deleteOne();
        res.json({ message: "Ride deleted successfully", id: rideId });
    } catch (error) {
        console.error("Error deleting ride:", error);
        res.status(500).json({ message: "Server error" });
    }
})


export default router;
