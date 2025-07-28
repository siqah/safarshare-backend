const Notification = require('../models/Notification');

/**
 * Create and save a notification to the database
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - User ID to send notification to
 * @param {string} params.type - Type of notification
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {Object} params.data - Additional data (optional)
 * @param {string} params.actionUrl - URL to navigate to when clicked (optional)
 * @param {Object} io - Socket.IO instance for real-time notifications
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async ({ userId, type, title, message, data = {}, actionUrl }, io = null) => {
  try {
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      data,
      actionUrl,
      read: false
    });

    await notification.save();

    // Send real-time notification if socket.io is available
    if (io) {
      io.to(`user_${userId}`).emit('new-notification', {
        notification
      });
    }

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Create notification for booking request
 */
const createBookingRequestNotification = async (driverUserId, rideId, passengerName, io) => {
  return createNotification({
    userId: driverUserId,
    type: 'booking_request',
    title: 'New Booking Request',
    message: `${passengerName} wants to book your ride`,
    data: { rideId },
    actionUrl: `/my-rides`
  }, io);
};

/**
 * Create notification for booking acceptance
 */
const createBookingAcceptedNotification = async (passengerUserId, rideId, driverName, io) => {
  return createNotification({
    userId: passengerUserId,
    type: 'booking_accepted',
    title: 'Booking Accepted',
    message: `${driverName} accepted your booking request`,
    data: { rideId },
    actionUrl: `/my-rides`
  }, io);
};

/**
 * Create notification for booking decline
 */
const createBookingDeclinedNotification = async (passengerUserId, rideId, driverName, io) => {
  return createNotification({
    userId: passengerUserId,
    type: 'booking_declined',
    title: 'Booking Declined',
    message: `${driverName} declined your booking request`,
    data: { rideId },
    actionUrl: `/search`
  }, io);
};

/**
 * Create notification for booking cancellation
 */
const createBookingCancelledNotification = async (userId, rideId, cancelledBy, io) => {
  return createNotification({
    userId,
    type: 'booking_cancelled',
    title: 'Booking Cancelled',
    message: `Your ride booking has been cancelled by ${cancelledBy}`,
    data: { rideId },
    actionUrl: `/my-rides`
  }, io);
};

/**
 * Create notification for new message
 */
const createMessageNotification = async (recipientUserId, senderName, io) => {
  return createNotification({
    userId: recipientUserId,
    type: 'message_received',
    title: 'New Message',
    message: `${senderName} sent you a message`,
    data: {},
    actionUrl: `/messages`
  }, io);
};

/**
 * Create notification for payment success
 */
const createPaymentSuccessNotification = async (userId, amount, rideId, io) => {
  return createNotification({
    userId,
    type: 'payment_success',
    title: 'Payment Received',
    message: `You received a payment of KSh ${amount}`,
    data: { rideId, amount },
    actionUrl: `/payment-settings`
  }, io);
};

/**
 * Create notification for ride reminder
 */
const createRideReminderNotification = async (userId, rideId, reminderMessage, io) => {
  return createNotification({
    userId,
    type: 'ride_reminder',
    title: 'Ride Reminder',
    message: reminderMessage,
    data: { rideId },
    actionUrl: `/my-rides`
  }, io);
};

module.exports = {
  createNotification,
  createBookingRequestNotification,
  createBookingAcceptedNotification,
  createBookingDeclinedNotification,
  createBookingCancelledNotification,
  createMessageNotification,
  createPaymentSuccessNotification,
  createRideReminderNotification
};
