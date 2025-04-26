const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: false, // Optional based on your signup form
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [/.+@iiita\.ac\.in$/, 'Please provide a valid IIITA email address'], // Adjust domain if needed
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6, // Example minimum length
    select: false, // Do not send password hash back by default
  },
  // Store the path where the server saved the user's private key
  // This allows retrieval later if needed (e.g., for server-side crypto ops or secure download)
  // as kdc
  // privateKeyPath: {
  //   type: String,
  //   required: true, // Key should be generated on registration
  //   select: false, // Do not send path back by default
  // },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// You might add pre-save middleware for password hashing here if preferred,
// but we will do it in the controller for this example.

module.exports = mongoose.model('User', userSchema);