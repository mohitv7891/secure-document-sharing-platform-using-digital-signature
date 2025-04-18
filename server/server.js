const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const path = require('path'); // Needed for authMiddleware path potentially
require("dotenv").config(); // Load .env variables

// --- Route Imports ---
const fileRoutes = require("./routes/fileRoutes");
const authRoutes = require("./routes/authRoutes"); // Import auth routes
const userRoutes = require("./routes/userRoutes");

// --- Middleware Imports ---
const authMiddleware = require('./middleware/authMiddleware'); // Import auth middleware

const app = express();

// --- Core Middleware ---
app.use(cors()); // Enable CORS
app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded bodies

// --- API Routes ---
app.use("/api/auth", authRoutes); // Mount auth routes (public)
app.use("/api/users", userRoutes); // <-- MOUNT USER ROUTES (Protected internally by middleware)

// Mount file routes AFTER auth middleware to protect them
// Any request to /api/files/* will now require a valid token
app.use("/api/files", authMiddleware, fileRoutes);

// --- Database Connection ---
connectDB();

// --- Start Server ---
const PORT = process.env.PORT || 5006;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- Optional: Log registered routes after setup ---
// const listEndpoints = require("express-list-endpoints");
// console.log(listEndpoints(app));