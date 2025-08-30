// middleware/validators.js
const { body } = require('express-validator');

exports.registerValidator = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Invalid email'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password too short (min 8)')
    .matches(/[A-Z]/).withMessage('Password needs an uppercase letter')
    .matches(/[a-z]/).withMessage('Password needs a lowercase letter')
    .matches(/[0-9]/).withMessage('Password needs a number')
    .matches(/[^A-Za-z0-9]/).withMessage('Password needs a symbol'),
  body('firstName').trim().isLength({ min: 2 }).withMessage('First name too short'),
  body('lastName').trim().isLength({ min: 2 }).withMessage('Last name too short')
];

exports.loginValidator = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password required')
];
