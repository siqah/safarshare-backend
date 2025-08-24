const express = require('express');
const { Webhook } = require('svix');
const User = require('../models/User');
const router = express.Router();

// Webhook to sync user data from Clerk
router.post('/webhooks/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('❌ CLERK_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Verify webhook signature
    const wh = new Webhook(webhookSecret);
    const evt = wh.verify(req.body, {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });

    console.log('🔔 Clerk webhook received:', evt.type);

    const { id, email_addresses, first_name, last_name, image_url, phone_numbers } = evt.data;

    switch (evt.type) {
      case 'user.created':
        // Create new user in our database
        const newUser = new User({
          clerkId: id,
          email: email_addresses[0]?.email_address || `${id}@guest.local`,
          firstName: first_name || 'Unknown',
          lastName: last_name || 'User',
          profileImageUrl: image_url || '',
          phone: phone_numbers?.[0]?.phone_number || '',
          emailVerified: email_addresses[0]?.verification?.status === 'verified',
          role: 'rider', // default role
          isDriver: false
        });
        
        await newUser.save();
        console.log('✅ New user created:', newUser.email);
        break;

      case 'user.updated':
        // Update existing user
        await User.findOneAndUpdate(
          { clerkId: id },
          {
            email: email_addresses[0]?.email_address || `${id}@guest.local`,
            firstName: first_name || 'Unknown',
            lastName: last_name || 'User',
            profileImageUrl: image_url || '',
            phone: phone_numbers?.[0]?.phone_number || '',
            emailVerified: email_addresses[0]?.verification?.status === 'verified',
            lastLogin: new Date()
          },
          { upsert: true, new: true }
        );
        console.log('✅ User updated:', email_addresses[0]?.email_address);
        break;

      case 'user.deleted':
        // Handle user deletion
        await User.findOneAndUpdate(
          { clerkId: id },
          { isActive: false },
          { new: true }
        );
        console.log('✅ User deactivated:', id);
        break;

      default:
        console.log('ℹ️ Unhandled webhook type:', evt.type);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(400).json({ error: 'Webhook failed' });
  }
});

module.exports = router;
