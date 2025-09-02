import express from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';

const router = express.Router();

// REGISTER
router.post('/register', 
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Password too short'),
    body('name').notEmpty().withMessage('Name required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { email, password, name } = req.body;

      // Check if user exists
      const existing = await User.findOne({ email });
      if (existing)
        return res.status(400).json({ message: "Email already exists" });

      // Hash password
      const hashed = await bcrypt.hash(password, 10);

      const user = await User.create({ email, password: hashed, name });

      res.status(201).json({
        message: "User registered",
        token: generateToken(user._id),
        user: { id: user._id, email: user.email, name: user.name }
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// LOGIN
router.post('/login',
  [
    body('email').isEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user) return res.status(400).json({ message: "Invalid credentials" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

      res.json({
        message: "Logged in",
        token: generateToken(user._id),
        user: { id: user._id, email: user.email, name: user.name }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ message: "Server error" });
    }
  }
);



export default router;