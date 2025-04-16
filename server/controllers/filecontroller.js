const Document = require("../models/Document");


// --- uploadEncryptedFile function (from previous step - ensure senderId uses req.user.id or req.user.email consistently) ---
const uploadEncryptedFile = async (req, res) => {
    console.log("Received encrypted upload request");
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: "No encrypted file data received." });
        }
        const { recipientId } = req.body;
        // *** Ensure senderId format matches how recipientId is stored (e.g., email) ***
        // *** Or update Document model to use ObjectId for both ***
        const senderId = req.user ? (req.user.email || req.user.id) : "test_sender_id_NEEDS_FIXING"; // Example: prefer email if available
        const originalFileName = req.file.originalname;

        if (!recipientId || !originalFileName) {
             return res.status(400).json({ message: "Recipient ID and filename are required." });
        }
        console.log(`Sender ID being saved: ${senderId} (Type: ${typeof senderId})`); // Log what's saved

        const newDocument = new Document({
            originalFileName: originalFileName,
            encryptedData: req.file.buffer,
            senderId: senderId, // Make sure this matches recipientId format
            recipientId: recipientId, // This is an email string from form
        });
        await newDocument.save();

        console.log("✅ Encrypted document saved to database. ID:", newDocument._id);
        res.status(201).json({ message: "Encrypted file uploaded and saved successfully.", documentId: newDocument._id });
    } catch (error) {
        console.error("❌ Encrypted upload error:", error);
        res.status(500).json({ message: "Server error during encrypted file upload.", error: error.message });
    }
};


// --- Controller for Fetching Received Files (UPDATED QUERY) ---
const getReceivedFiles = async (req, res) => {
    console.log("Received request for received files");
    try {
        // Ensure user info (esp. email) is attached by authMiddleware
        if (!req.user || !req.user.email) { // <<< CHECK FOR EMAIL
             console.log("User not authenticated or email missing in getReceivedFiles");
             return res.status(401).json({ message: 'User not authenticated or email missing.' });
        }
        const userEmail = req.user.email; // <<< GET EMAIL FROM req.user

        console.log(`DEBUG: Querying documents where recipientId matches req.user.email = ${userEmail}`);

        // Find documents where the recipientId (string) matches the logged-in user's email (string)
        const documents = await Document.find({ recipientId: userEmail }) // <<< USE EMAIL IN QUERY
                                        .select('-encryptedData')
                                        .sort({ createdAt: -1 });

        console.log(`DEBUG: Found ${documents.length} documents matching query for ${userEmail}.`);
        res.json(documents);

    } catch (error) {
        console.error("Error fetching received files:", error);
        res.status(500).json({ message: "Failed to fetch received documents." });
    }
};




// Export functions
module.exports = {
    uploadEncryptedFile,
    getReceivedFiles,
};
