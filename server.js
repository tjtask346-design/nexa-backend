require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://admin:admin123@cluster0.mongodb.net/nexa_db?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully!'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    accountNumber: { type: String, unique: true },
    balanceUSD: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    otpCode: String,
    otpExpires: Date
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Transporter Helper Function
const sendOTPEmail = async (email, otp) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[DEV OTP LOG] Verification OTP for ${email} is: ${otp}`);
        return;
    }
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    await transporter.sendMail({
        from: '"NEXA Wallet" <no-reply@nexa.com>',
        to: email,
        subject: 'NEXA — OTP Verification Code',
        html: `<div style="background:#030806;color:#f2fff7;padding:20px;border-radius:12px;font-family:sans-serif;">
                <h2 style="color:#39ff88;">NEXA Wallet OTP</h2>
                <p>আপনার ভেরিফিকেশন কোডটি নিচে দেওয়া হলো:</p>
                <h1 style="color:#39ff88;letter-spacing:6px;background:#0b1911;padding:10px;text-align:center;border-radius:8px;">${otp}</h1>
               </div>`
    });
};

// Health Check
app.get('/', (req, res) => {
    res.json({ success: true, message: "🚀 Nexa Backend Server is Active & Running!" });
});

// REGISTER API
app.post('/api/auth/register', async (req, res) => {
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
            fullName, phone, email,
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

// VERIFY OTP API
app.post('/api/auth/verify-otp', async (req, res) => {
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

// LOGIN API
app.post('/api/auth/login', async (req, res) => {
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

// P2P TRANSFER API
app.post('/api/transfer', async (req, res) => {
    try {
        const { senderPhone, receiverAccount, amount } = req.body;
        const transferAmount = parseFloat(amount);

        if (!senderPhone || !receiverAccount || isNaN(transferAmount) || transferAmount <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ ও গ্রহীতার তথ্য দিন!' });
        }

        const sender = await User.findOne({ phone: senderPhone });
        const receiver = await User.findOne({ $or: [{ accountNumber: receiverAccount }, { phone: receiverAccount }] });

        if (!sender) return res.status(404).json({ success: false, message: 'প্রেরক পাওয়া যায়নি!' });
        if (!receiver) return res.status(404).json({ success: false, message: 'প্রাপক অ্যাকাউন্ট পাওয়া যায়নি!' });
        if (sender.phone === receiver.phone) return res.status(400).json({ success: false, message: 'নিজের অ্যাকাউন্টে ট্রান্সফার সম্ভব নয়!' });
        if (sender.balanceUSD < transferAmount) return res.status(400).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });

        sender.balanceUSD -= transferAmount;
        receiver.balanceUSD += transferAmount;

        await sender.save();
        await receiver.save();

        res.json({ success: true, message: 'ট্রান্সফার সফল হয়েছে!', senderBalance: sender.balanceUSD });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ট্রান্সফার ব্যর্থ হয়েছে!' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
