const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// Temporary memory for OTPs
const tempOTPs = {};

// REGISTER ROUTE
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

// VERIFY OTP ROUTE
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const record = tempOTPs[email];

        if (!record || record.otp !== otp) {
            return res.status(400).json({ success: false, message: 'ভুল বা মেয়াদোত্তীর্ণ OTP!' });
        }

        // Create Account Number (e.g. NX-123456)
        const accountNumber = 'NX-' + Math.floor(100000 + Math.random() * 900000);

        const newUser = new User({
            fullName: record.fullName,
            phone: record.phone,
            email: record.email,
            password: record.password,
            accountNumber,
            balanceUSD: 0,
            balanceBDT: 0
        });

        await newUser.save();
        delete tempOTPs[email]; // Clear OTP from memory

        res.json({
            success: true,
            message: 'অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে',
            user: {
                id: newUser._id,
                fullName: newUser.fullName,
                phone: newUser.phone,
                email: newUser.email,
                accountNumber: newUser.accountNumber,
                balanceUSD: newUser.balanceUSD
            }
        });

    } catch (err) {
        console.error('VERIFY ERROR:', err);
        res.status(500).json({ success: false, message: 'ভেরিফিকেশন ব্যর্থ হয়েছে' });
    }
});

// LOGIN ROUTE
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
                balanceUSD: user.balanceUSD
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: 'লগইন সার্ভার এরর' });
    }
});

module.exports = router;
