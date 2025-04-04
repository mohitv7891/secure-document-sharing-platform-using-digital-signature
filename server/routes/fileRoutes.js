const express = require("express");
const multer = require("multer");
const path = require("path");
const File = require("../models/Document");

const router = express.Router();

// Multer setup for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("📂 Saving file to uploads/");
    cb(null, "./uploads");
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + path.extname(file.originalname);
    console.log(`📄 Saving file as: ${filename}`);
    cb(null, filename);
  },
});

const upload = multer({ storage });

// POST /api/files/upload
router.post("/upload", upload.single("file"), async (req, res) => {
  console.log("✅ Received upload request");
  
  if (!req.file) {
    console.log("❌ No file uploaded");
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    console.log("📂 File uploaded:", req.file);
    // Save file details to MongoDB
    const file = new File({ filename: req.file.filename, path: req.file.path });
    await file.save();

    console.log("✅ File saved to database");
    res.json({ message: "File uploaded successfully", file });
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({ error: "Error saving file" });
  }
});

module.exports = router;
