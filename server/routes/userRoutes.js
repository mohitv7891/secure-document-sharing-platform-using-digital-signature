// server/routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController'); // Adjust path if needed
const authMiddleware = require('../middleware/authMiddleware'); // Adjust path if needed

const router = express.Router();

// Define the route to get the private key
// This route is protected by authMiddleware
router.get(
    '/my-private-key',    // Endpoint path: /api/users/my-private-key
    authMiddleware,       // Run auth middleware first
    userController.getPrivateKey // Then run the controller function
);

// Add other user-related routes here if needed

module.exports = router;