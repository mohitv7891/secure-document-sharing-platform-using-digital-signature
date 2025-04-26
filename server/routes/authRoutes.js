// server/routes/authRoutes.js
const express = require('express');
const { check } = require('express-validator');
const authController = require('../controllers/authController'); // Adjust path if needed

const router = express.Router();

// --- NEW: Step 1 - Initiate Registration & Send OTP ---
// @route   POST api/auth/initiate-registration
// @desc    Receive user details, send OTP
// @access  Public
router.post(
    '/initiate-registration',
    [
        // Add validation as needed
        check('name', 'Name is optional').optional().isString(),
        check('email', 'Please include a valid IIITA email').isEmail().normalizeEmail().matches(/@iiita\.ac\.in$/i),
        check('password', 'Password must be 6 or more characters').isLength({ min: 6 }),
    ],
    authController.initiateRegistration // New controller function
);

// --- NEW: Step 2 - Verify OTP & Complete Registration ---
// @route   POST api/auth/verify-registration
// @desc    Verify OTP and create user if valid
// @access  Public
router.post(
    '/verify-registration',
    [
         // Add validation as needed
        check('email', 'Please include a valid email').isEmail().normalizeEmail(),
        check('otp', 'OTP is required and must be 6 digits').isLength({ min: 6, max: 6 }).isNumeric(), // Assuming 6-digit OTP
    ],
    authController.verifyRegistration // New controller function
);


// --- Keep Login Route ---
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