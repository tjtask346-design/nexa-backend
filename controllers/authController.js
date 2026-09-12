const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('../firebaseAdmin');

// ১. Firebase দিয়ে ভেরিফাই করে রেজিস্ট্রেশন
exports.registerWithFirebase = async (req, res) => {
    try {
        const { idToken, fullName, pin } = req.body;

        if (!idToken || !fullName || !pin) {
            return res.status(400).json({ success: false, message: 'সবগুলো তথ্য প্রদান করুন' });
        }

        // Firebase Token ভেরিফাই করা
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { uid, email, phone_number } = decodedToken;

        // পূর্বে একাউন্ট আছে কিনা যাচাই
        let existingUser = await User.findOne({
            $or: [
                { uid: uid },
                ...(email ? [{ email: email.toLowerCase() }] : []),
                ...(phone_number ? [{ phone: phone_number }] : [])
            ]
        });

        if (existingUser) {
            return res.status(400).json({ success: false, message: 'এই অ্যাকাউন্টটি ইতিমধ্যে নিবন্ধিত' });
        }

        // 5-digit PIN এনক্রিপ্ট করা
        const hashedPin = await bcrypt.hash(pin.toString(), 10);
        const accountNumber = 'NX-' + Math.floor(100000 + Math.random() * 900000);

        const newUser = new User({
            uid: uid,
            fullName: fullName,
            email: email ? email.toLowerCase() : null,
            phone: phone_number || null,
            pin: hashedPin,
            accountNumber: accountNumber,
            balance: 0.00
        });

        await newUser.save();

        const secret = process.env.JWT_SECRET || 'nexa_secret_key_123';
        const token = jwt.sign({ id: newUser._id, uid: newUser.uid }, secret, { expiresIn: '30d' });

        return res.status(201).json({
            success: true,
            message: 'রেজিস্ট্রেশন সফল হয়েছে!',
            token,
            user: {
                id: newUser._id,
                uid: newUser.uid,
                fullName: newUser.fullName,
                email: newUser.email,
                phone: newUser.phone,
                accountNumber: newUser.accountNumber,
                balance: newUser.balance
            }
        });

    } catch (error) {
        console.error('FIREBASE REGISTRATION ERROR:', error);
        return res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + error.message });
    }
};

// ২. PIN দিয়ে লগইন
exports.loginWithPin = async (req, res) => {
    try {
        const { identifier, pin } = req.body;

        if (!identifier || !pin) {
            return res.status(400).json({ success: false, message: 'ফোন/ইমেইল এবং পিন প্রদান করুন' });
        }

        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { phone: identifier },
                { accountNumber: identifier },
                { uid: identifier }
            ]
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'অ্যাকাউন্ট পাওয়া যায়নি' });
        }

        const isMatch = await bcrypt.compare(pin.toString(), user.pin);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'ভুল পিন দিয়েছেন' });
        }

        const secret = process.env.JWT_SECRET || 'nexa_secret_key_123';
        const token = jwt.sign({ id: user._id, uid: user.uid }, secret, { expiresIn: '30d' });

        return res.json({
            success: true,
            message: 'লগইন সফল হয়েছে!',
            token,
            user: {
                id: user._id,
                uid: user.uid,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                accountNumber: user.accountNumber,
                balance: user.balance
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + error.message });
    }
};
