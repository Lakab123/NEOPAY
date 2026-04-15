const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  otp: {
    type: String,
  },
  otpExpires: {
    type: Date,
  },
  phoneNo: {
    type: String,
    unique: true,
    sparse: true,
  },
  psid: {
    type: String,
    unique: true,
    sparse: true,
  },
  biometricKey: {
    type: String,
    unique: true,
    sparse: true,
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
