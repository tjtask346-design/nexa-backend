const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    accountNumber: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balanceUSD: { type: Number, default: 0.00 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    qrCodeUrl: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
