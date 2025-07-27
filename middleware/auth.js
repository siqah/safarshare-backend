const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Auth middleware - No token provided or invalid format');
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      console.log('Auth middleware - Empty token');
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Auth middleware - Token decoded successfully for user:', decoded.userId);
      
      // Get user from database
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        console.log('Auth middleware - User not found for ID:', decoded.userId);
        return res.status(401).json({ message: 'Token is not valid. User not found.' });
      }

      req.user = user;
      next();
    } catch (jwtError) {
      console.error('Auth middleware - JWT verification failed:', jwtError.message);
      return res.status(401).json({ message: 'Token is not valid.' });
    }
  } catch (error) {
    console.error('Auth middleware - Unexpected error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = auth;