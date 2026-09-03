const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    accountNumber: { type: String, unique: true },
    balanceUSD: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    otpCode: { type: String },
    otpExpires: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
