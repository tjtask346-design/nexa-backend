const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String, required: true, unique: true },
    pin: { type: String, required: true }, // 5-digit PIN instead of password
    
    phone: { type: String }, // WhatsApp Number
    uid: { 
        type: String, 
        unique: true,
        sparse: true // sparse allows the field to be null until KYC is completed
    },
    kycStatus: { 
        type: String, 
        enum: ['unverified', 'pending', 'verified', 'rejected'], 
        default: 'unverified' 
    },
    
    // Balances & Wallets
    balance: { type: Number, default: 0.00 }, // Fiat/BDT Balance
    ltcBalance: { type: Number, default: 0.00000000 }, // Crypto/LTC Balance
    ltcAddress: { type: String }, // Unique LTC deposit address for user
    
    fcmToken: { type: String }, // For push notifications
    
    // OTP storage
    emailOtp: { type: String },
    emailOtpExpires: { type: Date },
    waOtp: { type: String },
    waOtpExpires: { type: Date }
}, { timestamps: true });

// Hash PIN before saving (Replaces the old password hashing)
userSchema.pre('save', async function(next) {
    if (!this.isModified('pin')) return next();
    const salt = await bcrypt.genSalt(10);
    this.pin = await bcrypt.hash(this.pin, salt);
    next();
});

module.exports = mongoose.model('User', userSchema);
