const express = require('express');
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

const router = express.Router();

// Simulate M-Pesa STK Push
const simulateMpesaSTKPush = async (phoneNumber, amount) => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Simulate success/failure (90% success rate)
  const isSuccess = Math.random() > 0.1;
  
  if (isSuccess) {
    return {
      success: true,
      transactionId: `MPT${Date.now()}${Math.random().toString(36).substr(2, 5)}`,
      receiptNumber: `RCP${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      checkoutRequestId: `ws_CO_${Date.now()}_${Math.random().toString(36).substr(2, 10)}`
    };
  } else {
    throw new Error('M-Pesa transaction failed. Please try again.');
  }
};

// Create payment
router.post('/', auth, [
  body('bookingId').isMongoId(),
  body('mpesaPhoneNumber').matches(/^(\+254|254|0)?[17]\d{8}$/)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { bookingId, mpesaPhoneNumber } = req.body;

    // Get booking details
    const booking = await Booking.findById(bookingId)
      .populate('rideId')
      .populate('passengerId');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if user is the passenger
    if (!booking.passengerId._id.equals(req.user._id)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (booking.status !== 'accepted') {
      return res.status(400).json({ message: 'Booking must be accepted before payment' });
    }

    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Payment already completed' });
    }

    // Calculate fees
    const amount = booking.totalAmount;
    const platformFee = Math.round(amount * 0.05 * 100) / 100; // 5% platform fee
    const driverPayout = amount - platformFee;

    // Format phone number
    let formattedPhone = mpesaPhoneNumber.replace(/\s/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('254')) {
      formattedPhone = '+' + formattedPhone;
    } else if (!formattedPhone.startsWith('+254')) {
      formattedPhone = '+254' + formattedPhone;
    }

    // Create payment record
    const payment = new Payment({
      bookingId,
      payerId: req.user._id,
      receiverId: booking.rideId.driverId,
      amount,
      platformFee,
      driverPayout,
      mpesaPhoneNumber: formattedPhone,
      status: 'processing'
    });

    await payment.save();

    try {
      // Simulate M-Pesa STK Push
      const mpesaResult = await simulateMpesaSTKPush(formattedPhone, amount);
      
      // Update payment with M-Pesa details
      payment.status = 'succeeded';
      payment.mpesaTransactionId = mpesaResult.transactionId;
      payment.mpesaReceiptNumber = mpesaResult.receiptNumber;
      payment.mpesaCheckoutRequestId = mpesaResult.checkoutRequestId;
      payment.processedAt = new Date();
      await payment.save();

      // Update booking payment status
      booking.paymentStatus = 'paid';
      booking.mpesaTransactionId = mpesaResult.transactionId;
      booking.mpesaReceiptNumber = mpesaResult.receiptNumber;
      await booking.save();

      // Create notification for driver
      const notification = new Notification({
        userId: booking.rideId.driverId,
        type: 'payment',
        title: 'Payment Received',
        message: `You received KES ${driverPayout.toFixed(2)} for your ride from ${booking.rideId.fromLocation} to ${booking.rideId.toLocation}`,
        data: { paymentId: payment._id, bookingId: booking._id },
        actionUrl: `/payments/${payment._id}`
      });
      await notification.save();

      // Send real-time notification
      req.io.to(booking.rideId.driverId.toString()).emit('new-notification', {
        type: 'payment',
        notification
      });

      res.json({
        message: 'Payment processed successfully',
        payment,
        mpesaReceiptNumber: mpesaResult.receiptNumber
      });
    } catch (mpesaError) {
      // Update payment status to failed
      payment.status = 'failed';
      payment.failureReason = mpesaError.message;
      await payment.save();

      res.status(400).json({ 
        message: 'M-Pesa payment failed',
        error: mpesaError.message
      });
    }
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ message: 'Server error during payment processing' });
  }
});

// Get user payments
router.get('/my-payments', auth, async (req, res) => {
  try {
    const payments = await Payment.find({ payerId: req.user._id })
      .populate({
        path: 'bookingId',
        populate: {
          path: 'rideId',
          select: 'fromLocation toLocation departureDate departureTime'
        }
      })
      .sort({ createdAt: -1 });

    res.json({ payments });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get driver earnings
router.get('/earnings', auth, async (req, res) => {
  try {
    const earnings = await Payment.find({ 
      receiverId: req.user._id,
      status: 'succeeded'
    })
    .populate({
      path: 'bookingId',
      populate: {
        path: 'rideId',
        select: 'fromLocation toLocation departureDate departureTime'
      }
    })
    .sort({ createdAt: -1 });

    const totalEarnings = earnings.reduce((sum, payment) => sum + payment.driverPayout, 0);
    const thisMonthEarnings = earnings
      .filter(payment => {
        const paymentDate = new Date(payment.createdAt);
        const now = new Date();
        return paymentDate.getMonth() === now.getMonth() && 
               paymentDate.getFullYear() === now.getFullYear();
      })
      .reduce((sum, payment) => sum + payment.driverPayout, 0);

    res.json({
      earnings,
      summary: {
        totalEarnings,
        thisMonthEarnings,
        totalTransactions: earnings.length
      }
    });
  } catch (error) {
    console.error('Get earnings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get payment by ID
router.get('/:paymentId', auth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate({
        path: 'bookingId',
        populate: [
          {
            path: 'rideId',
            select: 'fromLocation toLocation departureDate departureTime'
          },
          {
            path: 'passengerId',
            select: 'firstName lastName'
          }
        ]
      });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Check if user is involved in this payment
    if (!payment.payerId.equals(req.user._id) && !payment.receiverId.equals(req.user._id)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json({ payment });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;