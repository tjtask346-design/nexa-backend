const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    pin: { type: String, required: true }, // hashed 5-digit PIN
    uid: { type: String, unique: true, sparse: true, index: true }, // Firebase UID
    accountNumber: { type: String, unique: true, index: true, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    balance: { type: Number, default: 0, min: 0 },
    emailVerified: { type: Boolean, default: false },
    kycStatus: { type: String, enum: ['unverified', 'pending', 'verified', 'rejected'], default: 'unverified' },
    // crypto fields optional
    balanceUSD: { type: Number, default: 0 },
    ltcBalance: { type: Number, default: 0 },
    ltcAddress: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
