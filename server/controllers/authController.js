const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/user');
const executeKeygen = require('../utils/executeKeygen');

console.log("authController: Imported executeKeygen:", typeof executeKeygen, executeKeygen);


// Configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '1d'; // Example: Token expires in 1 day
const IIITA_EMAIL_DOMAIN = '@iiita.ac.in'; // Adjust if needed
// Initial whitelist (REMOVE or replace with domain check later)
const EMAIL_WHITELIST = [
    'test1@iiita.ac.in',
    'test2@iiita.ac.in',
    // Add the 8-10 emails here for initial testing
    'mohit@iiita.ac.in',
    'ritesh@iiita.ac.in',
    'arun@iiita.ac.in',
    'sudip@iiita.ac.in',
    'divyanshu@iiita.ac.in',
];

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.registerUser = async (req, res) => {
    console.log("Register request received:", req.body.email);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;

    // --- Email Validation ---
    // Option 1: Whitelist check (for initial testing)
    if (!EMAIL_WHITELIST.includes(email.toLowerCase())) {
         console.log(`Registration denied for ${email}: Not in whitelist.`);
         return res.status(400).json({ message: 'Registration is restricted.' });
    }
    // Option 2: Domain check (use this or whitelist, not both usually)
    // if (!email.toLowerCase().endsWith(IIITA_EMAIL_DOMAIN)) {
    //     console.log(`Registration denied for ${email}: Invalid domain.`);
    //     return res.status(400).json({ message: `Please use a valid ${IIITA_EMAIL_DOMAIN} email.` });
    // }
    // --- End Email Validation ---

    try {
        // Check if user already exists
        let user = await User.findOne({ email: email.toLowerCase() });
        if (user) {
            console.log(`Registration failed for ${email}: User already exists.`);
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10); // 10 rounds is generally secure
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log(`Password hashed for ${email}.`);

        // --- Generate Private Key using Native C Executable ---
        console.log(`Attempting key generation for ${email}...`);
        let generatedKeyPath;
        try {
            // Ensure email is safe before passing as argument (basic check)
            if (!/^[a-zA-Z0-9@._-]+$/.test(email)) {
                 throw new Error("Invalid characters in email for key generation.");
            }
            generatedKeyPath = await executeKeygen(email.toLowerCase());
            console.log(`Key generated successfully for ${email} at ${generatedKeyPath}`);
        } catch (keygenError) {
            console.error(`Key generation failed for ${email}:`, keygenError);
            // Don't expose internal errors to the client
            return res.status(500).json({ message: 'Registration failed during key generation.' });
        }
        // --- End Key Generation ---

        // Create new user
        user = new User({
            name, // Name might be optional
            email: email.toLowerCase(),
            password: hashedPassword,
            privateKeyPath: generatedKeyPath, // Store the path
        });

        await user.save();
        console.log(`User ${email} registered successfully.`);

        // Don't send password hash or key path back
        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.loginUser = async (req, res) => {
     console.log("Login request received:", req.body.email);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        // Check for user & fetch password hash and user ID
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password'); // Include password for comparison

        if (!user) {
             console.log(`Login failed for ${email}: User not found.`);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
             console.log(`Login failed for ${email}: Password mismatch.`);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Passwords match, create JWT payload
        const payload = {
            user: {
                id: user.id, // Include user ID in the token
               email:user.email // You could add email or roles here if needed
            },
        };

        // Sign the token
        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN },
            (err, token) => {
                if (err) throw err;
                 console.log(`Login successful for ${email}. Token generated.`);
                res.json({ token }); // Send token to client
            }
        );
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};