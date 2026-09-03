const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sendOTPEmail = require('../utils/sendEmail');

// 1. REGISTER
router.post('/register', async (req, res) => {
    try {
        const { fullName, phone, email, password } = req.body;
        if (!fullName || !phone || !email || !password) {
            return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে পূরণ করুন!' });
        }

        const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'ফোন নম্বর বা ইমেইল ইতিমধ্যে ব্যবহৃত হয়েছে!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const accountNumber = 'NX-' + Math.floor(100000 + Math.random() * 900000);

        const newUser = new User({
            fullName,
            phone,
            email,
            password: hashedPassword,
            accountNumber,
            otpCode: otp,
            otpExpires: Date.now() + 5 * 60 * 1000
        });

        await newUser.save();
        await sendOTPEmail(email, otp);

        res.json({ success: true, message: 'OTP ইমেইলে পাঠানো হয়েছে!', email });
    } catch (err) {
        res.status(500).json({ success: false, message: 'সার্ভার এরর!' });
    }
});

// 2. VERIFY OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি!' });
        if (user.otpCode !== otp || user.otpExpires < Date.now()) {
            return res.status(400).json({ success: false, message: 'ভুল অথবা মেয়াদোত্তীর্ণ OTP!' });
        }

        user.isVerified = true;
        user.otpCode = undefined;
        user.otpExpires = undefined;
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'nexa_secret');

        res.json({
            success: true,
            message: 'ইমেইল ভেরিফিকেশন সফল হয়েছে!',
            token,
            user: { fullName: user.fullName, phone: user.phone, accountNumber: user.accountNumber, balanceUSD: user.balanceUSD }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'সার্ভার এরর!' });
    }
});

// 3. LOGIN
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = await User.findOne({ phone });

        if (!user) return res.status(400).json({ success: false, message: 'ইউজার পাওয়া যায়নি!' });
        if (!user.isVerified) return res.status(400).json({ success: false, message: 'আপনার ইমেইল ভেরিফাইড নয়!' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: 'পাসওয়ার্ড ভুল!' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'nexa_secret');

        res.json({
            success: true,
            token,
            user: { fullName: user.fullName, phone: user.phone, accountNumber: user.accountNumber, balanceUSD: user.balanceUSD }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'সার্ভার এরর!' });
    }
});

module.exports = router;
