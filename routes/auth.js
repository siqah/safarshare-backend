const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { registerValidator, loginValidator } = require('../middleware/validators');
const asyncHandler = require('../middleware/asyncHandler');
const { validationResult } = require('express-validator');
const { signAccessToken, signRefreshToken, setRefreshCookie, verifyRefreshToken } = require('../utils/jwt');

const router = express.Router();

const publicUser = (u) => ({
  id: u._id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  fullName: u.fullName,
  role: u.role,
  profileImageUrl: u.profileImageUrl,
  rating: u.rating,
  isDriver: u.isDriver
});

const issueTokens = (res, user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  setRefreshCookie(res, refreshToken);
  return accessToken;
};

// Register
router.post('/register', registerValidator, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, errors: errors.array() });

  const { email, password, firstName, lastName } = req.body;
  const normEmail = email.toLowerCase();

  if (await User.findOne({ email: normEmail }))
    return res.status(409).json({ success: false, message: 'Email in use' });

  const hash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await new User({ email: normEmail, firstName, lastName, password: hash }).save();
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ success: false, message: 'Email in use' });
    throw e;
  }

  const accessToken = issueTokens(res, user);
  res.status(201).json({ success: true, user: publicUser(user), accessToken });
}));

// Login
router.post('/login', loginValidator, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, errors: errors.array() });

  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ success: false, message: 'Invalid credentials' });

  user.lastLogin = new Date();
  await user.save();

  const accessToken = issueTokens(res, user);
  res.json({ success: true, user: publicUser(user), accessToken });
}));

// Refresh (rotate refresh token)
router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies?.rt;
  if (!token) return res.status(401).json({ success: false, message: 'No refresh token' });

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }

  const user = await User.findById(payload.sub);
  if (!user) return res.status(401).json({ success: false, message: 'User not found' });

  const newAccess = signAccessToken(user);
  const newRefresh = signRefreshToken(user); // rotation
  setRefreshCookie(res, newRefresh);
  res.json({ success: true, accessToken: newAccess });
}));

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('rt', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/refresh'
  });
  res.status(204).end();
});

module.exports = router;
