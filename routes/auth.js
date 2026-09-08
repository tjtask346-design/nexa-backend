const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// 1. REGISTER ROUTE (Android App Compatible)
router.post('/register', async (req, res) => {
    try {
        const fullName = req.body.fullName;
        const identifier = req.body.identifier || req.body.email || req.body.phone;
        const password = req.body.pin || req.body.password;

        if (!fullName || !identifier || !password) {
            return res.status(400).json({ success: false, message: 'সব তথ্য প্রদান করুন' });
        }

        // Identifier ইমেইল নাকি ফোন নম্বর তা সনাক্ত করা
        const isEmail = identifier.includes('@');
        const email = isEmail ? identifier : `${identifier}@nexawallet.com`;
        const phone = isEmail ? identifier : identifier;

        // চেক করা ইউজার আগে থেকে আছে কিনা
        const existingUser = await User.findOne({ 
            $or: [{ phone: identifier }, { email: identifier }, { phone }, { email }] 
        });

        if (existingUser) {
            return res.status(400).json({ success: false, message: 'ফোন বা ইমেইল দিয়ে ইতোমধ্যে অ্যাকাউন্ট আছে' });
        }

        // Hash Password / PIN
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate Unique Account Number
        const accountNumber = 'NX-' + Math.floor(100000 + Math.random() * 900000);

        // Save User directly to DB
        const newUser = new User({
            fullName,
            phone,
            email,
            password: hashedPassword,
            accountNumber,
            balanceUSD: 0,
            balanceBDT: 0,
            phoneVerified: true,
            kycStatus: 'unverified'
        });

        await newUser.save();

        res.status(201).json({
            success: true,
            message: 'রেজিস্ট্রেশন সফল হয়েছে!',
            user: {
                id: newUser._id,
                fullName: newUser.fullName,
                phone: newUser.phone,
                email: newUser.email,
                accountNumber: newUser.accountNumber
            }
        });

    } catch (err) {
        console.error('REGISTER ERROR:', err);
        res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + err.message });
    }
});

// 2. LOGIN ROUTE (Supports Phone / Email & PIN)
router.post('/login', async (req, res) => {
    try {
        const identifier = req.body.identifier || req.body.phone || req.body.email;
        const password = req.body.pin || req.body.password;

        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: 'ইমেইল/ফোন এবং পিন প্রদান করুন' });
        }

        // Search user by email or phone
        const user = await User.findOne({
            $or: [{ phone: identifier }, { email: identifier }]
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'ভুল পিন বা পাসওয়ার্ড' });
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
        res.status(500).json({ success: false, message: 'লগইন সার্ভার এরর: ' + err.message });
    }
});

module.exports = router;
