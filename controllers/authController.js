const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 1. REGISTER
exports.register = async (req, res) => {
    try {
        const fullName = req.body.fullName || (req.body.firstName ? `${req.body.firstName} ${req.body.lastName || ''}`.trim() : null);
        const identifier = req.body.identifier || req.body.email || req.body.phone;
        const pin = req.body.pin || req.body.password;

        if (!fullName || !identifier || !pin) {
            return res.status(400).json({ success: false, message: 'সব তথ্য প্রদান করুন' });
        }

        if (pin.toString().length !== 5) {
            return res.status(400).json({ success: false, message: 'পিন অবশ্যই ৫ ডিজিটের হতে হবে' });
        }

        const isEmail = identifier.includes('@');
        const emailVal = isEmail ? identifier.toLowerCase() : `${identifier}@nexawallet.com`;
        const phoneVal = !isEmail ? identifier : identifier;

        const existingUser = await User.findOne({
            $or: [{ email: emailVal }, { phone: phoneVal }]
        });

        if (existingUser) {
            return res.status(400).json({ success: false, message: 'এই ইমেইল বা ফোন নম্বরটি ইতিমধ্যে নিবন্ধিত' });
        }

        const accountNumber = 'NX-' + Math.floor(100000 + Math.random() * 900000);

        const newUser = new User({
            fullName,
            email: emailVal,
            phone: phoneVal,
            pin: pin.toString(), // pre-save hook in User.js will hash this
            accountNumber,
            balance: 0,
            balanceUSD: 0
        });

        await newUser.save();

        const secret = process.env.JWT_SECRET || 'nexa_secret_key_123';
        const token = jwt.sign({ id: newUser._id }, secret, { expiresIn: '30d' });

        return res.status(201).json({
            success: true,
            message: 'রেজিস্ট্রেশন সফল হয়েছে!',
            token,
            user: {
                id: newUser._id,
                fullName: newUser.fullName,
                email: newUser.email,
                phone: newUser.phone,
                accountNumber: newUser.accountNumber,
                balance: newUser.balance
            }
        });

    } catch (error) {
        console.error('REGISTER ERROR:', error);
        return res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + error.message });
    }
};

// 2. LOGIN
exports.login = async (req, res) => {
    try {
        const identifier = req.body.identifier || req.body.email || req.body.phone;
        const pin = req.body.pin || req.body.password;

        if (!identifier || !pin) {
            return res.status(400).json({ success: false, message: 'ইমেইল/ফোন এবং পিন প্রদান করুন' });
        }

        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { phone: identifier },
                { uid: identifier }
            ]
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'অ্যাকাউন্ট খুঁজে পাওয়া যায়নি' });
        }

        const isMatch = await bcrypt.compare(pin.toString(), user.pin);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'ভুল পিন দিয়েছেন' });
        }

        const secret = process.env.JWT_SECRET || 'nexa_secret_key_123';
        const token = jwt.sign({ id: user._id }, secret, { expiresIn: '30d' });

        return res.json({
            success: true,
            message: 'লগইন সফল হয়েছে',
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                accountNumber: user.accountNumber,
                uid: user.uid,
                balance: user.balance,
                kycStatus: user.kycStatus
            }
        });

    } catch (error) {
        console.error('LOGIN ERROR:', error);
        return res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + error.message });
    }
};
