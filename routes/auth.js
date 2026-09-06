const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// Temporary memory for OTPs
const tempOTPs = {};

// 1. REGISTER ROUTE
router.post('/register', async (req, res) => {
    try {
        const { fullName, phone, email, password } = req.body;

        if (!fullName || !phone || !email || !password) {
            return res.status(400).json({ success: false, message: 'সব তথ্য প্রদান করুন' });
        }

        const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'ফোন বা ইমেইল দিয়ে ইতোমধ্যে অ্যাকাউন্ট আছে' });
        }

        // Generate 6 Digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Store temporary data
        tempOTPs[email] = {
            fullName,
            phone,
            email,
            password: hashedPassword,
            otp,
            createdAt: Date.now()
        };

        // Send Email with OTP
        await sendEmail({
            email,
            subject: 'NEXA Wallet - OTP Verification',
            html: `
                <div style="padding:20px;background:#06100b;color:#fff;font-family:sans-serif;border-radius:10px;">
                    <h2 style="color:#39ff88;">NEXA Wallet OTP</h2>
                    <p>আপনার অ্যাকাউন্ট ভেরিফিকেশনের জন্য নিচের OTP কোডটি ব্যবহার করুন:</p>
                    <h1 style="color:#39ff88;letter-spacing:5px;">${otp}</h1>
                    <p style="color:#888;">এই কোডটি ৩ মিনিটের জন্য কার্যকর থাকবে।</p>
                </div>
            `
        });

        res.json({ success: true, message: 'OTP ইমেইলে পাঠানো হয়েছে' });

    } catch (err) {
        console.error('REGISTER ERROR:', err);
        res.status(500).json({ success: false, message: 'ইমেইল পাঠাতে ব্যর্থ: ' + err.message });
    }
});

// 2. VERIFY OTP ROUTE (Updated for Auto-Login)
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const record = tempOTPs[email];

        if (!record || record.otp !== otp) {
            return res.status(400).json({ success: false, message: 'ভুল বা মেয়াদোত্তীর্ণ OTP!' });
        }

        const accountNumber = 'NX-' + Math.floor(100000 + Math.random() * 900000);

        const newUser = new User({
            fullName: record.fullName,
            phone: record.phone,
            email: record.email,
            password: record.password,
            accountNumber,
            balanceUSD: 0,
            balanceBDT: 0,
            phoneVerified: false,
            kycStatus: 'unverified'
        });

        await newUser.save();
        delete tempOTPs[email]; 

        res.json({
            success: true,
            message: 'অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে',
            user: {
                id: newUser._id,
                fullName: newUser.fullName,
                phone: newUser.phone,
                email: newUser.email,
                accountNumber: newUser.accountNumber,
                phoneVerified: newUser.phoneVerified,
                kycStatus: newUser.kycStatus,
                balanceUSD: newUser.balanceUSD
            }
        });

    } catch (err) {
        console.error('VERIFY ERROR:', err);
        res.status(500).json({ success: false, message: 'ভেরিফিকেশন ব্যর্থ হয়েছে: ' + err.message });
    }
});

// 3. LOGIN ROUTE
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = await User.findOne({ phone });

        if (!user) {
            return res.status(400).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'ভুল পাসওয়ার্ড' });
        }

        res.json({
            success: true,
            message: 'লগইন সফল হয়েছে',
            user: {
                id: user._id,
                fullName: user.fullName,
                phone: user.phone,
                email: user.email,
                accountNumber: user.accountNumber,
                phoneVerified: user.phoneVerified || false,
                kycStatus: user.kycStatus || 'unverified',
                balanceUSD: user.balanceUSD
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: 'লগইন সার্ভার এরর' });
    }
});

// 4. FORGOT PASSWORD - Request OTP (Email)
router.post('/forgot-password/email', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: 'এই ইমেইলের কোনো অ্যাকাউন্ট নেই' });

        const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
        tempOTPs[email] = { otp: resetOtp, identifier: email, type: 'reset' };

        await sendEmail({
            email,
            subject: 'NEXA Wallet - Password Reset OTP',
            html: `<h2>Your Password Reset OTP is: ${resetOtp}</h2>`
        });

        res.json({ success: true, message: 'OTP ইমেইলে পাঠানো হয়েছে' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'এরর: ' + err.message });
    }
});

// 5. FORGOT PASSWORD - Request OTP (Phone/WhatsApp)
router.post('/forgot-password/phone', async (req, res) => {
    try {
        const { phone } = req.body;
        const user = await User.findOne({ phone });
        if (!user) return res.status(404).json({ success: false, message: 'এই নাম্বারের কোনো অ্যাকাউন্ট নেই' });

        const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
        tempOTPs[phone] = { otp: resetOtp, identifier: phone, type: 'reset' };

        console.log(`[WhatsApp OTP] for ${phone}: ${resetOtp}`); 

        res.json({ success: true, message: 'OTP হোয়াটসঅ্যাপে পাঠানো হয়েছে' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'এরর: ' + err.message });
    }
});

// 6. RESET PASSWORD - Submit New Password
router.post('/reset-password', async (req, res) => {
    try {
        const { identifier, otp, newPassword } = req.body;
        const record = tempOTPs[identifier];

        if (!record || record.otp !== otp || record.type !== 'reset') {
            return res.status(400).json({ success: false, message: 'ভুল বা মেয়াদোত্তীর্ণ OTP!' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        if (identifier.includes('@')) {
            await User.findOneAndUpdate({ email: identifier }, { password: hashedPassword });
        } else {
            await User.findOneAndUpdate({ phone: identifier }, { password: hashedPassword });
        }

        delete tempOTPs[identifier];
        res.json({ success: true, message: 'পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে' });

    } catch (err) {
        res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + err.message });
    }
});

module.exports = router;
