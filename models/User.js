const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    pin: { type: String, required: true }, // hashed 5-digit pin
    uid: { type: String, unique: true, sparse: true, index: true }, // firebase uid
    accountNumber: { type: String, unique: true, index: true, required: true },
    role: { type: String, enum: ['user','admin'], default: 'user' },
    balance: { type: Number, default: 0, min: 0 },
    emailVerified: { type: Boolean, default: false },
    kycStatus: { type: String, enum: ['unverified','pending','verified','rejected'], default: 'unverified' },
    // crypto wallets
    balanceUSD: { type: Number, default: 0 },
    ltcBalance: { type: Number, default: 0 },
    ltcAddress: { type: String, default: null },
}, { timestamps: true });

// Remove phone field completely - email only auth
// Indexes
userSchema.index({ email: 1 });
userSchema.index({ accountNumber: 1 });

module.exports = mongoose.model('User', userSchema);
