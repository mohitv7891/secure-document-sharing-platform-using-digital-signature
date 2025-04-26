// kdc/kdc_server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors'); // Consider restrictive CORS for internal API

// Load env vars
dotenv.config({ path: './.env' }); // Assuming .env is in kgs/

// Import routes
const keyRoutes = require('./routes/keyRoutes');

const app = express();

// Middleware
app.use(express.json()); // Parse JSON bodies

// Configure CORS - VERY IMPORTANT for internal service
// Ideally, only allow requests from your main server's specific origin/IP
// Example: Restrict to a specific origin (replace with your MAIN server's domain/IP)
/*
const corsOptions = {
  origin: 'https://your-main-server-app.onrender.com', // Or specific IP
  methods: 'POST', // Only allow POST
  allowedHeaders: ['Content-Type', 'X-KGS-API-Key'], // Allow necessary headers
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
*/
// Or allow all for now during testing, but restrict later:
app.use(cors());


// Mount Routes
app.use('/', keyRoutes); // Mount key generation at root or specific path e.g., '/api'

// Basic route for testing
app.get('/health', (req, res) => res.status(200).send('KGS OK'));

const PORT = process.env.PORT || 5007;
app.listen(PORT, () => console.log(`KGS Server running on port ${PORT}`));