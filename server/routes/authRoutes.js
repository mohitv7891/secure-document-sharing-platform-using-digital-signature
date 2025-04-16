const express = require('express');
const { check } = require('express-validator');
const authController = require('../controllers/authController');

const router = express.Router();

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post(
    '/register',
    [
        // Input validation using express-validator
        check('name', 'Name is optional').optional().isString(),
        check('email', 'Please include a valid IIITA email').isEmail().normalizeEmail(),
        check('password', 'Password must be 6 or more characters').isLength({ min: 6 }),
    ],
    authController.registerUser
);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
    '/login',
    [
        check('email', 'Please include a valid email').isEmail().normalizeEmail(),
        check('password', 'Password is required').exists(),
    ],
    authController.loginUser
);

module.exports = router;