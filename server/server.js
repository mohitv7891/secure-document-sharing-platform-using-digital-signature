/* === File: server.js === */

const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const fileRoutes = require("./routes/fileRoutes"); // Routes now handle encrypted uploads
require("dotenv").config();

// const fs = require("fs"); // No longer needed for uploads dir creation
// if (!fs.existsSync("./uploads")) {
//   fs.mkdirSync("./uploads");
// }


const app = express();

// --- Middleware ---
app.use(cors()); // Enable CORS
app.use(express.json()); // Middleware to parse JSON bodies (useful if sending metadata as JSON)
// express.urlencoded might be needed if sending standard form data along with file
app.use(express.urlencoded({ extended: false }));

// --- Routes ---
// TODO: Add authentication middleware here before file routes if needed
// Example: app.use('/api/files', authMiddleware);
app.use("/api/files", fileRoutes);

// --- Remove static serving of './uploads' if no longer needed ---
// app.use("/uploads", express.static("uploads"));

// --- Optional: Log registered routes (for debugging) ---
// const listEndpoints = require("express-list-endpoints");
// console.log(listEndpoints(app));


// --- Database Connection ---
connectDB();

// --- Start Server ---
const PORT = process.env.PORT || 5006; // Use the port from your original code
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

