const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, unique: true, sparse: true, default: null },
    phone: { type: String, unique: true, sparse: true, default: null },
    pin: { type: String, required: true }, // 5-digit PIN (Hashed)
    uid: { type: String, unique: true, sparse: true },
    accountNumber: { type: String, unique: true },
    balance: { type: Number, default: 0.00 },
    balanceUSD: { type: Number, default: 0.00 },
    ltcBalance: { type: Number, default: 0.00000000 },
    ltcAddress: { type: String, default: null },
    kycStatus: { 
        type: String, 
        enum: ['unverified', 'pending', 'verified', 'rejected'], 
        default: 'unverified' 
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
