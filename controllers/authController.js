const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');

// 1. Send Email OTP
exports.sendEmailOtp = async (req, res) => {
    try {
        const identifier = req.body.identifier || req.body.email;
        if (!identifier) {
            return res.status(400).json({ success: false, message: 'ইমেইল বা ফোন নম্বর দিন' });
        }

        const isEmail = identifier.includes('@');
        const emailVal = isEmail ? identifier.toLowerCase() : `${identifier}@nexawallet.com`;

        const existingVerifiedUser = await User.findOne({ email: emailVal, pin: { $ne: '00000' } });
        if (existingVerifiedUser) {
            return res.status(400).json({ success: false, message: 'এই অ্যাকাউন্টটি ইতিমধ্যে নিবন্ধিত' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

        let user = await User.findOne({ email: emailVal });
        if (!user) {
            user = new User({ fullName: 'Pending User', email: emailVal, pin: '00000', emailOtp: otp, emailOtpExpires: expires });
        } else {
            user.emailOtp = otp;
            user.emailOtpExpires = expires;
        }
        await user.save();

        if (isEmail) {
            await sendEmail({
                email: emailVal,
                subject: 'Nexa Wallet - Verification Code',
                html: `<div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                        <h2>Nexa Wallet Verification</h2>
                        <p>Your 6-digit OTP code is:</p>
                        <h1 style="color: #15d86a; letter-spacing: 5px;">${otp}</h1>
                        <p>This code will expire in 10 minutes.</p>
                       </div>`
            });
        }

        return res.status(200).json({ success: true, message: 'ওটিপি সফলভাবে পাঠানো হয়েছে' });
    } catch (error) {
        console.error('SEND OTP ERROR:', error);
        return res.status(500).json({ success: false, message: 'ওটিপি পাঠাতে ব্যর্থ হয়েছে: ' + error.message });
    }
};

// 2. Verify OTP & Complete Registration
exports.verifyOtpAndRegister = async (req, res) => {
    try {
        const { fullName, identifier, otp, pin } = req.body;

        if (!fullName || !identifier || !otp || !pin) {
            return res.status(400).json({ success: false, message: 'সব তথ্য প্রদান করুন' });
        }

        const isEmail = identifier.includes('@');
        const emailVal = isEmail ? identifier.toLowerCase() : `${identifier}@nexawallet.com`;

        const user = await User.findOne({ email: emailVal });

        if (!user || user.emailOtp !== otp || user.emailOtpExpires < Date.now()) {
            return res.status(400).json({ success: false, message: 'ভুল অথবা মেয়াদোত্তীর্ণ ওটিপি' });
        }

        const accountNumber = 'NX-' + Math.floor(100000 + Math.random() * 900000);

        user.fullName = fullName;
        user.pin = pin.toString();
        user.accountNumber = accountNumber;
        user.emailOtp = undefined;
        user.emailOtpExpires = undefined;
        user.ltcAddress = "ltc1qxl" + Date.now().toString() + "dummy";

        await user.save();

        const secret = process.env.JWT_SECRET || 'nexa_secret_key_123';
        const token = jwt.sign({ id: user._id }, secret, { expiresIn: '30d' });

        return res.status(201).json({
            success: true,
            message: 'রেজিস্ট্রেশন সফল হয়েছে!',
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                accountNumber: user.accountNumber,
                balance: user.balance
            }
        });
    } catch (error) {
        console.error('VERIFY OTP ERROR:', error);
        return res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + error.message });
    }
};

// 3. Login
exports.login = async (req, res) => {
    try {
        const identifier = req.body.identifier || req.body.email || req.body.phone;
        const pin = req.body.pin || req.body.password;

        if (!identifier || !pin) {
            return res.status(400).json({ success: false, message: 'তথ্য প্রদান করুন' });
        }

        const user = await User.findOne({
            $or: [{ email: identifier.toLowerCase() }, { phone: identifier }, { uid: identifier }]
        });

        if (!user) return res.status(404).json({ success: false, message: 'অ্যাকাউন্ট পাওয়া যায়নি' });

        const isMatch = await bcrypt.compare(pin.toString(), user.pin);
        if (!isMatch) return res.status(400).json({ success: false, message: 'ভুল পিন দিয়েছেন' });

        const secret = process.env.JWT_SECRET || 'nexa_secret_key_123';
        const token = jwt.sign({ id: user._id }, secret, { expiresIn: '30d' });

        return res.json({
            success: true,
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                accountNumber: user.accountNumber,
                balance: user.balance
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'সার্ভার এরর: ' + error.message });
    }
};
