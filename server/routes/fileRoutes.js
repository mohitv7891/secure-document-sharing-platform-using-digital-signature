/* === File: routes/fileRoutes.js === */
const express = require("express");
const multer = require("multer");
const fileController = require("../controllers/filecontroller");
// Assuming you have authentication middleware to get senderId
// const authMiddleware = require('../middleware/auth'); // Example

const router = express.Router();

// --- Multer Configuration for Encrypted Files ---
// Use memory storage to get the file as a buffer in req.file.buffer
// Avoids saving the encrypted blob to disk temporarily.
const memoryStorage = multer.memoryStorage();
const uploadEncrypted = multer({
    storage: memoryStorage,
    limits: { fileSize: 100 * 1024 * 1024 } // Example: Limit file size to 100MB
});

// --- New Route for Encrypted Uploads ---
// POST /api/files/upload-encrypted
// - Uses multer memory storage to handle the 'encryptedFile' field from FormData.
// - Expects 'recipientId' also in the FormData body.
// - Assumes auth middleware adds sender info to req.user
router.post(
    '/upload-encrypted',
    // authMiddleware, // Apply authentication middleware first
    uploadEncrypted.single('encryptedFile'), // Use multer memory storage
    fileController.uploadEncryptedFile // Call the new controller function
);


// --- Old Route (Commented out or Removed) ---
/*
const path = require("path");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./uploads"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });
router.post("/upload", upload.single("file"), async (req, res) => {
    // ... old logic saving unencrypted file path ...
});
*/

module.exports = router;