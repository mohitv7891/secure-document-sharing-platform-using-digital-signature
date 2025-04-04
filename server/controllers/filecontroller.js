const multer = require("multer");
const path = require("path");
const File = require("../models/File");

// Configure Multer for file storage
const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage }).single("file");

// Upload File Controller
const uploadFile = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(500).json({ error: "File upload failed" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      // Save file metadata to MongoDB
      const newFile = new File({
        filename: req.file.filename,
        path: req.file.path,
      });

      await newFile.save();
      res.status(201).json({ message: "File uploaded successfully", file: newFile });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ error: "Error saving file data" });
    }
  });
};

module.exports = { uploadFile };
