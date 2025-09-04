import express from "express";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";


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

export default router;
