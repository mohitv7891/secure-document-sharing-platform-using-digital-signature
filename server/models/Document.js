const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  filename: String,
  path: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Document", documentSchema);
