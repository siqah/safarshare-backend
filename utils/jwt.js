// utils/jwt.js
const jwt = require('jsonwebtoken');

const ACCESS_TTL = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_EXPIRES || '7d';

function assertSecrets() {
  if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT secrets missing (JWT_ACCESS_SECRET / JWT_REFRESH_SECRET)');
  }
}

const signAccessToken = (user) => {
  assertSecrets();
  return jwt.sign({ sub: user._id.toString(), email: user.email, role: user.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
};

const signRefreshToken = (user) => {
  assertSecrets();
  return jwt.sign({ sub: user._id.toString(), type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
};

const verifyAccessToken = (token) => {
  assertSecrets();
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

const verifyRefreshToken = (token) => {
  assertSecrets();
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

const setRefreshCookie = (res, token) =>
  res.cookie('rt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, setRefreshCookie };
