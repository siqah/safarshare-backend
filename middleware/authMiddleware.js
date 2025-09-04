import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Strict auth: requires a valid Bearer token, loads user, attaches:
 *  req.userId  (ObjectId as string)
 *  req.user    (User document sans password)
 */
const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer '))
      return res.status(401).json({ message: 'Token required' });

    const token = auth.slice(7).trim();
    if (!token)
      return res.status(401).json({ message: 'Token required' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      const msg = e.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
      return res.status(401).json({ message: msg });
    }

    const userId = decoded.id || decoded.sub;
    if (!userId)
      return res.status(401).json({ message: 'Invalid token payload' });

    const user = await User.findById(userId).select('-password');
    if (!user)
      return res.status(401).json({ message: 'User not found' });

    req.userId = user._id.toString();
    req.user = user;
    next();
  } catch (err) {
    console.error('protect middleware error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Optional auth: attaches user if token valid; otherwise continues without error.
 */
const optionalAuth = async (req, _res, next) => {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id || decoded.sub;
      if (userId) {
        const user = await User.findById(userId).select('-password');
        if (user) {
          req.userId = user._id.toString();
            req.user = user;
        }
      }
    } catch {
      // ignore invalid token
    }
  }
  next();
};

export { protect, optionalAuth };