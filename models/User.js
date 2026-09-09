const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true },
    pin: { type: String, required: true }, // 5-digit PIN
    
    uid: { type: String, unique: true, sparse: true },
    accountNumber: { type: String, unique: true },
    kycStatus: { 
        type: String, 
        enum: ['unverified', 'pending', 'verified', 'rejected'], 
        default: 'unverified' 
    },
    
    balance: { type: Number, default: 0.00 },
    balanceUSD: { type: Number, default: 0.00 },
    ltcBalance: { type: Number, default: 0.00000000 },
    ltcAddress: { type: String },
    
    fcmToken: { type: String },
    emailOtp: { type: String },
    emailOtpExpires: { type: Date },
    waOtp: { type: String },
    waOtpExpires: { type: Date }
}, { timestamps: true });

// Hash PIN before saving (Prevents double hashing)
userSchema.pre('save', async function(next) {
    if (!this.isModified('pin')) return next();
    if (!this.pin.startsWith('$2a$') && !this.pin.startsWith('$2b$')) {
        const salt = await bcrypt.genSalt(10);
        this.pin = await bcrypt.hash(this.pin, salt);
    }
    next();
});

module.exports = mongoose.model('User', userSchema);
