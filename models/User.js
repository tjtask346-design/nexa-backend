const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    pin: { type: String, required: true },
    uid: { type: String, unique: true, sparse: true, index: true },
    accountNumber: { type: String, unique: true, index: true, required: true },
    role: { type: String, enum: ['user','admin'], default: 'user' },
    balance: { type: Number, default: 0, min: 0 },
    emailVerified: { type: Boolean, default: false },
    kycStatus: { type: String, enum: ['unverified','pending','verified','rejected'], default: 'unverified' },
}, { timestamps: true });
module.exports = mongoose.model('User', userSchema);
