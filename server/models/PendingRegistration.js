// server/models/PendingRegistration.js
const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true, // Only one pending registration per email
        lowercase: true,
    },
    hashedPassword: {
        type: String,
        required: true,
    },
    name: { // Store name if provided
        type: String,
        required: false,
    },
    otp: { // Store the plaintext OTP
        type: String,
        required: true,
    },
    // It's generally better to store expiry than creation time for TTL
    expiresAt: {
        type: Date,
        required: true,
        // Create a TTL index: MongoDB automatically deletes documents
        // 'expiresAfterSeconds' seconds after the 'expiresAt' time.
        // Set to 0 so it deletes right at the specified time.
        index: { expires: '10m' } // Example: Expire after 10 minutes (can adjust)
    },
});

// Optional: Create index on email for faster lookups
pendingRegistrationSchema.index({ email: 1 });

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
