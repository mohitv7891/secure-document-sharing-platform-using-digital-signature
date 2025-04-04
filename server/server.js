const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const fileRoutes = require("./routes/fileRoutes");
require("dotenv").config();

const fs = require("fs");
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}


const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads")); // Serve uploaded files
app.use("/api/files", fileRoutes);
app._router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    console.log(`Registered route: ${r.route.stack[0].method.toUpperCase()} ${r.route.path}`);
  }
});
const listEndpoints = require("express-list-endpoints");
console.log(listEndpoints(app));


connectDB();

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
