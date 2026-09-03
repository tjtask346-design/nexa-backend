const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

const generateAccountNumber = () => `NX-${Math.floor(100000 + Math.random() * 900000)}`;

exports.register = async (req, res) => {
    try {
        const { fullName, phone, password } = req.body;
        let user = await User.findOne({ phone });
        if (user) return res.status(400).json({ success: false, message: 'এই নম্বরে অ্যাকাউন্ট রয়েছে!' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const accountNumber = generateAccountNumber();
        const qrCodeUrl = await QRCode.toDataURL(accountNumber);

        user = new User({ fullName, phone, password: hashedPassword, accountNumber, qrCodeUrl });
        await user.save();

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ success: true, message: 'অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!', token, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = await User.findOne({ phone });
        if (!user) return res.status(400).json({ success: false, message: 'ফোন নম্বর বা পাসওয়ার্ড ভুল!' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: 'ফোন নম্বর বা পাসওয়ার্ড ভুল!' });

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'লগইন সফল!', token, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

