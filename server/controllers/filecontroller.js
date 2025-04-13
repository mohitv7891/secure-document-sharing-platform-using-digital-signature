/* === File: controllers/filecontroller.js === */
const Document = require("../models/Document"); // Use the updated Document model name

// --- New Controller for Encrypted File Uploads ---
const uploadEncryptedFile = async (req, res) => {
    console.log("Received encrypted upload request");

    try {
        // Check if the encrypted file buffer exists (from multer memory storage)
        if (!req.file || !req.file.buffer) {
            console.log("No encrypted file buffer uploaded");
            return res.status(400).json({ message: "No encrypted file data received." });
        }

        // Get metadata from the request
        // recipientId should be sent in the FormData body
        const { recipientId } = req.body;
        // senderId should ideally come from auth middleware (e.g., req.user.id)
        // Using a placeholder here - REPLACE with actual authenticated user ID
        const senderId = req.user ? req.user.id : "test_sender_id"; // !! REPLACE PLACEHOLDER !!

        // Get original filename (sent by client in FormData)
        const originalFileName = req.file.originalname;

        if (!recipientId) {
             console.log("Recipient ID missing");
             return res.status(400).json({ message: "Recipient ID is required." });
        }
         if (!originalFileName) {
             console.log("Original filename missing");
             return res.status(400).json({ message: "Original filename is required." });
        }


        console.log(`Received encrypted file: ${originalFileName}, size: ${req.file.buffer.length} bytes`);
        console.log(`Sender ID: ${senderId}, Recipient ID: ${recipientId}`);

        // Create a new document instance with the encrypted data and metadata
        const newDocument = new Document({
            originalFileName: originalFileName,
            encryptedData: req.file.buffer, // Store the buffer directly
            senderId: senderId,
            recipientId: recipientId,
        });

        // Save the document metadata and encrypted content to MongoDB
        await newDocument.save();

        console.log("✅ Encrypted document saved to database. ID:", newDocument._id);
        res.status(201).json({
            message: "Encrypted file uploaded and saved successfully.",
            documentId: newDocument._id // Send back the ID
        });

    } catch (error) {
        console.error("❌ Encrypted upload error:", error);
        res.status(500).json({ message: "Server error during encrypted file upload.", error: error.message });
    }
};


// --- Old Controller (Commented out or Removed) ---
/*
const multer = require("multer");
const path = require("path");
// const File = require("../models/File"); // Old model name?

const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage }).single("file");

const uploadFile = async (req, res) => {
  upload(req, res, async (err) => {
     // ... old logic ...
  });
};
*/

// Export the new controller function
module.exports = {
    uploadEncryptedFile,
    // uploadFile // Export old one only if still needed elsewhere
};