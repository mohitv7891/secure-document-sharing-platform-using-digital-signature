// kgs/controllers/keyController.js
const executeKeygen = require('../utils/executeKeygen');

exports.generateKey = async (req, res) => {
    console.log("--- Enter generateKey Controller (KGS) ---");
    try {
         // User identity should be attached by authenticateUserJwt middleware
         const userEmail = req.user?.email;
         const requestedEmail = req.body?.email; // Get email from body as well

         if (!userEmail) {
             console.error("KGS generateKey: Missing user email from validated JWT (req.user).");
             return res.status(500).json({ message: "Internal server error: User identity missing after auth." });
         }
         // Optional: Verify email from body matches email in JWT for consistency
         if (requestedEmail && userEmail !== requestedEmail.toLowerCase()) {
             console.warn(`KGS generateKey: Email mismatch! JWT email (<span class="math-inline">\{userEmail\}\) \!\= Request body email \(</span>{requestedEmail}). Using JWT email.`);
             // Decide whether to reject or proceed with JWT email
         }

        console.log(`KGS generateKey: Request to generate key for: ${userEmail}`);

        // Call executeKeygen (generates, reads temp file, deletes temp file, returns buffer)
        const keyBuffer = await executeKeygen(userEmail); // Assumes executeKeygen is in kgs/utils

        if (!keyBuffer || !(keyBuffer instanceof Buffer) || keyBuffer.length === 0) {
            console.error(`KGS generateKey: executeKeygen returned invalid buffer for ${userEmail}.`);
            return res.status(500).json({ message: 'Key generation failed internally.' });
        }

        // Send the generated key (Base64 encoded) back to the Main Server
        console.log(`KGS generateKey: Successfully generated key for ${userEmail}, sending Base64...`);
        res.status(200).json({
            privateKeyB64: keyBuffer.toString('base64')
        });

    } catch (error) {
        // Catch errors from executeKeygen or other issues
        console.error(`KGS generateKey: Error generating key for ${req.user?.email || req.body?.email || 'UNKNOWN'}:`, error);
        res.status(500).json({ message: "Key generation failed.", error: error.message });
    }
};