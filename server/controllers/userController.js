// server/controllers/userController.js
const axios = require('axios'); // Need axios or node-fetch for HTTP requests
// const User = require('../models/user'); // No longer needed
// const executeKeygen = require('../utils/executeKeygen'); // No longer calling local keygen

// Get KGS details from environment variables
const KGS_URL = process.env.KGS_URL; // e.g., https://your-kgs-service.onrender.com
const KGS_API_KEY = process.env.KGS_API_KEY; // The secret key shared between Main Server and KGS

/**
 * @desc    Gets user's private key by requesting it from the KGS.
 * @route   GET /api/users/my-private-key
 * @access  Private (Requires User JWT via authMiddleware)
 */
exports.getPrivateKey = async (req, res) => {
    console.log("--- Enter getPrivateKey Controller (Requesting from KGS) ---");
    try {
        // 1. Get User Info from verified JWT (attached by authMiddleware)
        const userEmail = req.user?.email;
        const userId = req.user?.id; // Maybe needed for logging
        if (!userEmail || !userId) {
            console.error('getPrivateKey Controller: User email/id not found on req.user.');
            return res.status(401).json({ message: 'Authentication error: User identity not found.' });
        }

        // Retrieve the user's JWT from the incoming request header to forward it
        const userJwt = req.header('Authorization')?.split(' ')[1];
        if (!userJwt) {
            console.error(`getPrivateKey Controller: Could not extract user JWT for user ${userEmail}`);
            return res.status(401).json({ message: 'Authentication token missing or invalid.' });
        }

        console.log(`getPrivateKey Controller: Requesting key from KGS for user: ${userEmail}`);

        // 2. Prepare request to KGS
        if (!KGS_URL || !KGS_API_KEY) {
             console.error("FATAL: KGS_URL or KGS_API_KEY environment variable not set on Main Server!");
             return res.status(500).json({ message: "Server configuration error [KGS Connect]." });
        }
        const kgsEndpoint = `${KGS_URL}/generate-key`; // Assuming KGS endpoint is /generate-key
        const kgsRequestData = {
            email: userEmail, // Send email explicitly
            userJwt: userJwt  // Forward the user's JWT for KGS to verify
        };
        const kgsRequestConfig = {
            headers: {
                'Content-Type': 'application/json',
                'X-KGS-API-Key': KGS_API_KEY // Server-to-server authentication key
            },
            timeout: 10000 // Add a timeout (e.g., 10 seconds)
        };

        // 3. Call KGS endpoint
        let kgsResponse;
        try {
             kgsResponse = await axios.post(kgsEndpoint, kgsRequestData, kgsRequestConfig);
        } catch (kgsError) {
             // Handle errors specifically from the KGS request
             console.error(`Error calling KGS endpoint (${kgsEndpoint}) for user ${userEmail}:`, kgsError.response?.status, kgsError.response?.data || kgsError.message);
             const status = kgsError.response?.status || 500;
             const message = kgsError.response?.data?.message || 'Failed to communicate with Key Generation Service.';
             return res.status(status).json({ message }); // Relay KGS error status/message
        }


        // 4. Check KGS response and extract key
        // Assuming KGS sends back { privateKeyB64: "..." } on success
        if (kgsResponse.status === 200 && kgsResponse.data?.privateKeyB64) {
            console.log(`getPrivateKey Controller: Successfully received key from KGS for ${userEmail}`);
            // Send the received Base64 key back to the user's browser
            res.status(200).send(kgsResponse.data.privateKeyB64);
        } else {
            // Handle unexpected success response format from KGS
            console.error(`getPrivateKey Controller: Unexpected response format from KGS for ${userEmail}. Status: ${kgsResponse.status}, Data:`, kgsResponse.data);
            res.status(500).json({ message: 'Received invalid response from Key Generation Service.' });
        }

    } catch (error) {
        console.error(`Unhandled error in getPrivateKey controller for user ${req.user?.email || 'UNKNOWN'}:`, error);
        res.status(500).json({ message: 'Server error retrieving private key.', error: error.message });
    }
};