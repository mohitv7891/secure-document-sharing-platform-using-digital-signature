const express = require("express");
const multer = require("multer");
const fileController = require("../controllers/filecontroller");
// Assuming authMiddleware is required in server.js before these routes are mounted
// OR you import and apply it individually here if needed:
// const authMiddleware = require('../middleware/auth');

const router = express.Router();

// --- Multer Configuration for Encrypted Files (from previous step) ---
const memoryStorage = multer.memoryStorage();
const uploadEncrypted = multer({
    storage: memoryStorage,
    limits: { fileSize: 100 * 1024 * 1024 }
});

// --- Route for Encrypted Uploads (from previous step) ---
// POST /api/files/upload-encrypted
router.post(
    '/upload-encrypted',
    // Assuming authMiddleware is applied globally in server.js for /api/files
    uploadEncrypted.single('encryptedFile'),
    fileController.uploadEncryptedFile
);

// --- NEW Route for Fetching Received Files ---
// GET /api/files/received
// This route MUST be protected by authMiddleware in server.js
router.get(
    '/received',
    fileController.getReceivedFiles // Call the new controller function
);

// --- (Future Route) Route for Downloading a specific encrypted file ---
// GET /api/files/download-encrypted/:id
// router.get(
//     '/download-encrypted/:id',
//     fileController.downloadEncryptedFile // Controller function to be created later
// );


module.exports = router;