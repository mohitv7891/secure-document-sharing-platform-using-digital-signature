// server/controllers/userController.js
const fs = require('fs').promises;
const path = require('path');
const User = require('../models/user'); // Adjust path if needed

// Read path from environment variables - MUST match where keys are saved
const USER_KEYS_DIR = process.env.USER_KEYS_DIR;
if (!USER_KEYS_DIR) {
    console.error("FATAL ERROR: USER_KEYS_DIR environment variable is not set.");
    // Optionally exit or handle appropriately, as key retrieval will fail
}

/**
 * @desc    Get the logged-in user's private key
 * @route   GET /api/users/my-private-key
 * @access  Private (Requires JWT via authMiddleware)
 */
exports.getPrivateKey = async (req, res) => {
    try {
        // 1. Get user ID from the authenticated request (added by authMiddleware)
        const userId = req.user?.id;
        if (!userId) {
            console.error('getPrivateKey Controller: No user ID found on req.user. Ensure authMiddleware runs first.');
            return res.status(401).json({ message: 'Authentication error: User ID not found.' });
        }

        // 2. Find the user and explicitly select the privateKeyPath
        const user = await User.findById(userId).select('+privateKeyPath'); // Select needed field
        if (!user) {
            console.warn(`getPrivateKey Controller: User not found for ID: ${userId}`);
            return res.status(404).json({ message: 'User not found.' });
        }

        // 3. Get the stored path to the private key
        const keyPath = user.privateKeyPath;
        if (!keyPath || typeof keyPath !== 'string') {
            console.error(`getPrivateKey Controller: privateKeyPath field is missing or invalid for user ID: ${userId}`);
            return res.status(500).json({ message: 'Server error: Key path information missing or invalid for user.' });
        }
        // Basic check: Ensure the path seems to be within the expected directory for safety
        // This is a simple check, more robust checks might be needed depending on security requirements
        if (!keyPath.startsWith(USER_KEYS_DIR)) {
             console.error(`getPrivateKey Controller: User key path "<span class="math-inline">\{keyPath\}" is outside configured USER\_KEYS\_DIR "</span>{USER_KEYS_DIR}". Access denied.`);
             return res.status(403).json({ message: 'Access to key path denied.' });
        }

        console.log(`getPrivateKey Controller: Attempting to access key at path: ${keyPath}`);

        // 4. Verify the key file exists and read it securely
        try {
            await fs.access(keyPath, fs.constants.R_OK); // Check existence and read permission
        } catch (accessError) {
            console.error(`getPrivateKey Controller: Private key file not found or inaccessible (permissions?) for user ${userId} at path ${keyPath}:`, accessError);
            return res.status(404).json({ message: 'Private key file not found or inaccessible.' });
        }

        // Read the key file content
        const privateKeyData = await fs.readFile(keyPath);
        console.log(`getPrivateKey Controller: Successfully read key file for user ${userId}`);

        // 5. Send the key back as a Base64 encoded string (common for web transport)
        res.status(200).send(privateKeyData.toString('base64'));

    } catch (error) {
        console.error('getPrivateKey Controller: Server error fetching private key:', error);
        res.status(500).json({ message: 'Server error retrieving private key.' });
    }
};