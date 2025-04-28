// server/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const crypto = require('crypto'); // For OTP generation

const User = require('../models/User'); // Your existing User model
const PendingRegistration = require('../models/PendingRegistration'); // Import the new model
// const executeKeygen = require('../utils/executeKeygen'); // Still needed later
const sendEmail = require('../utils/sendEmail'); // Import the email utility

// Configuration (Keep JWT stuff, remove whitelist if not needed)
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '1d';
const IIITA_EMAIL_DOMAIN = '@iiita.ac.in'; // Keep for validation if needed
const OTP_EXPIRY_MINUTES = 10; // How long OTP is valid

// Initial whitelist (REMOVE or replace with domain check later)
const EMAIL_WHITELIST = [
    'test1@iiita.ac.in',
    'test2@iiita.ac.in',
    'test3@iiita.ac.in',
    'mohit@iiita.ac.in',
    'ritesh@iiita.ac.in',
    'arun@iiita.ac.in',
    'sudip@iiita.ac.in',
    'divyanshu@iiita.ac.in',
];


/**
 * @desc    Step 1: Initiate registration, store temp data, send OTP
 * @route   POST /api/auth/initiate-registration
 * @access  Public
 */
exports.initiateRegistration = async (req, res) => {
    console.log("Initiate registration request received:", req.body.email);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;
    const lowerCaseEmail = email.toLowerCase();

//     if (!EMAIL_WHITELIST.includes(email.toLowerCase())) {
//         console.log(`Registration denied for ${email}: Not in whitelist.`);
//         return res.status(400).json({ message: 'Registration is restricted.' });
//    }

    // Optional: Explicit domain check (even if regex is in route)
    if (!lowerCaseEmail.endsWith(IIITA_EMAIL_DOMAIN)) {
        return res.status(400).json({ message: `Registration only allowed for ${IIITA_EMAIL_DOMAIN} emails.` });
    }

    try {
        // 1. Check if user is already fully registered
        let existingUser = await User.findOne({ email: lowerCaseEmail });
        if (existingUser) {
            console.log(`Initiate registration failed: Email ${lowerCaseEmail} already registered.`);
            return res.status(400).json({ message: 'Email address already registered.' });
        }

        // 2. Handle potentially existing pending registration (overwrite/resend)
        // It's often simplest to just delete any old pending one and create a new one.
        await PendingRegistration.deleteOne({ email: lowerCaseEmail });
        console.log(`Cleared any previous pending registration for ${lowerCaseEmail}.`);

        // 3. Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log(`Password hashed for pending registration: ${lowerCaseEmail}.`);

        // 4. Generate OTP (e.g., 6 digits)
        const otp = crypto.randomInt(100000, 999999).toString(); // Generate 6-digit OTP
        console.log(`Generated OTP for ${lowerCaseEmail}: ${otp}`); // DO NOT log OTP in production

        // 4.5. Hash the OTP
        const hashedOtp = await bcrypt.hash(otp, 10);
        console.log(`Hashed OTP ready for DB for ${lowerCaseEmail}`);

        // 5. Calculate Expiry Time
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000); // OTP expires in 10 minutes

        // 6. Save pending registration details
        const pending = new PendingRegistration({
            email: lowerCaseEmail,
            hashedPassword,
            name, // Save name if provided
            otp:hashedOtp, // Store plaintext OTP for direct comparison
            expiresAt,
        });
        await pending.save();
        console.log(`Pending registration saved for ${lowerCaseEmail}, expires at ${expiresAt.toISOString()}`);

        // 7. Send OTP email
        const message = `Your OTP for registration is: ${otp}\n\nIt will expire in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this, please ignore this email.`;
        try {
            await sendEmail({
                email: lowerCaseEmail,
                subject: 'Your Registration OTP',
                message,
            });
            console.log(`OTP email sending initiated for ${lowerCaseEmail}.`);
            // Send success response to frontend
            res.status(200).json({ message: `OTP sent to ${lowerCaseEmail}. Please check your email.` });

        } catch (emailError) {
            console.error(`Failed to send OTP email to ${lowerCaseEmail}:`, emailError);
            // Important: If email fails, we should ideally roll back the pending registration save,
            // or at least inform the user the process failed. For simplicity now, we send an error.
            // Consider deleting the pending record if email fails:
            // await PendingRegistration.deleteOne({ email: lowerCaseEmail });
            return res.status(500).json({ message: 'Failed to send OTP email. Please try again later.' });
        }

    } catch (error) {
        console.error('Error during initiate registration:', error);
        res.status(500).json({ message: 'Server error during registration initiation.' });
    }
};

// --- Step 2 - Verify OTP and Complete Registration ---
/**
 * @desc    Verify OTP, generate key, create final user
 * @route   POST /api/auth/verify-registration
 * @access  Public
 */
exports.verifyRegistration = async (req, res) => {
    console.log("Verify registration request received for:", req.body.email);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Log validation errors for debugging
        console.log("Verification validation errors:", errors.array());
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp } = req.body;
    const lowerCaseEmail = email.toLowerCase();

    try {
        // 1. Find the pending registration document for the email
        const pendingDoc = await PendingRegistration.findOne({ email: lowerCaseEmail });

        // Check if a pending registration exists
        if (!pendingDoc) {
            console.log(`Verification failed: No pending registration found for ${lowerCaseEmail}`);
            return res.status(400).json({ message: 'Invalid request or registration attempt not found. Please initiate registration again.' });
        }
        console.log(`Pending registration found for ${lowerCaseEmail}`);

        // 2. Check if the OTP has expired
        if (Date.now() > pendingDoc.expiresAt) {
            console.log(`Verification failed: OTP expired for ${lowerCaseEmail} at ${pendingDoc.expiresAt.toISOString()}`);
            // Clean up the expired record automatically
            await PendingRegistration.findByIdAndDelete(pendingDoc._id);
            console.log(`Deleted expired pending registration for ${lowerCaseEmail}`);
            return res.status(400).json({ message: 'OTP has expired. Please initiate registration again.' });
        }
        console.log(`OTP expiry check passed for ${lowerCaseEmail}`);

        // 3. Verify the submitted OTP against the stored OTP
        // Direct comparison as we stored plaintext OTP
        // if (otp !== pendingDoc.otp) {
        //     console.log(`Verification failed: Invalid OTP submitted for ${lowerCaseEmail}. Expected: ${pendingDoc.otp}, Received: ${otp}`);
        //     // NOTE: Implement attempt limiting in production to prevent brute-force attacks
        //     return res.status(400).json({ message: 'Invalid OTP submitted.' });
        // }

        // Instead use bcrypt.compare:
            const isOtpMatch = await bcrypt.compare(otp, pendingDoc.otp);
            if (!isOtpMatch) {
            console.log(`Verification failed: Invalid OTP submitted for ${lowerCaseEmail}.`);
            return res.status(400).json({ message: 'Invalid OTP submitted.' });
}

        // --- OTP Correct and Not Expired ---
        console.log(`OTP verified successfully for ${lowerCaseEmail}`);

        // 4. Generate the user's private key

        // 5. Create the final User record in the database
        try {
             console.log(`Creating final user record for ${lowerCaseEmail}`);
             const newUser = new User({
                 name: pendingDoc.name,               // Use name from pending doc
                 email: pendingDoc.email,             // Use email from pending doc
                 password: pendingDoc.hashedPassword, // Use the HASHED password from pending doc
                //  privateKeyPath: privateKeyPath       // Use the generated path
             });
             await newUser.save();
             console.log(`User record created successfully for ${lowerCaseEmail} with ID: ${newUser._id}`);

        } catch (userSaveError) {
             console.error(`Error saving final user record for ${lowerCaseEmail}:`, userSaveError);
             // Handle potential duplicate email error - race condition where user got verified elsewhere between checks
             if (userSaveError.code === 11000) {
                  // User already exists, maybe delete pending record and inform user to log in?
                  await PendingRegistration.findByIdAndDelete(pendingDoc._id);
                  console.log(`Deleted pending registration for ${lowerCaseEmail} due to existing user.`);
                  return res.status(400).json({ message: 'This email address was already registered. Please try logging in.' });
             }
             // For other save errors, the state is inconsistent (key generated, user not saved)
             // This requires careful consideration - maybe attempt to delete the key file? Risky.
             // Informing user to contact support might be necessary in complex failures.
             return res.status(500).json({ message: 'Server error saving user registration details.' });
        }

        // 6. Clean up the pending registration document as registration is now complete
        try {
             await PendingRegistration.findByIdAndDelete(pendingDoc._id);
             console.log(`Pending registration record deleted successfully for ${lowerCaseEmail}`);
        } catch (deleteError) {
             // Log this error, but don't fail the overall registration if the user was created successfully
             console.error(`Error deleting completed pending registration record for ${lowerCaseEmail} (ID: ${pendingDoc._id}):`, deleteError);
        }

        // 7. Respond with success
        res.status(201).json({ message: 'User registered successfully.' }); // 201 Created status code

    } catch (error) {
        console.error('Unhandled error during verify registration:', error);
        res.status(500).json({ message: 'Server error during registration verification.' });
    }
};
// --- End verifyRegistration ---



// --- Existing Login Controller ---
exports.loginUser = async (req, res) => {
     console.log("Login request received:", req.body.email);
     const errors = validationResult(req);
     if (!errors.isEmpty()) { return res.status(400).json({ errors: errors.array() }); }
     const { email, password } = req.body;
     try {
         const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
         if (!user) { return res.status(400).json({ message: 'Invalid credentials' }); }
         const isMatch = await bcrypt.compare(password, user.password);
         if (!isMatch) { return res.status(400).json({ message: 'Invalid credentials' }); }
         const payload = { user: { id: user.id, email: user.email } };
         jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }, (err, token) => {
             if (err) throw err;
             console.log(`Login successful for ${email}. Token generated.`);
             res.json({ token });
         });
     } catch (error) {
         console.error('Login Error:', error);
         res.status(500).json({ message: 'Server error during login' });
     }
};
