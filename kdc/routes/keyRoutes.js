// kgs/routes/keyRoutes.js
const express = require('express');
const keyController = require('../controllers/keyController');
const { authenticateServer, authenticateUserJwt } = require('../middleware/kgsAuthMiddleware');

const router = express.Router();

// POST /generate-key
// Requires server API key AND valid user JWT in body
router.post(
    '/generate-key',
    // authenticateServer,    // First, verify the calling server
    authenticateUserJwt,   // Second, verify the user's forwarded JWT
    keyController.generateKey // Finally, generate the key
);

module.exports = router;