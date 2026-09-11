const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// Global Error Handler
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'YOUR_ACTUAL_MONGODB_URI_HERE';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('⚠️ MongoDB Connection Error:', err.message));

// User Schema Definition
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    identifier: { type: String, required: true, unique: true }, // Email or Phone
    pin: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Base Route
app.get('/', (req, res) => {
    res.send('🚀 Nexa Wallet API is Running Cleanly!');
});

// Register User (After Firebase OTP Verification on Android App)
app.post('/register', async (req, res) => {
    try {
        const { fullName, identifier, pin } = req.body;

        if (!fullName || !identifier || !pin) {
            return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে প্রদান করুন' });
        }

        // Check existing user
        let user = await User.findOne({ identifier });
        if (user) {
            return res.status(400).json({ success: false, message: 'এই ইমেইল বা নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট রয়েছে' });
        }

        // Encrypt PIN
        const hashedPin = await bcrypt.hash(pin, 10);

        // Save User in MongoDB
        user = new User({ fullName, identifier, pin: hashedPin });
        await user.save();

        // Generate Login Token
        const token = jwt.sign(
            { userId: user._id, identifier: user.identifier },
            process.env.JWT_SECRET || 'nexa_secret_key',
            { expiresIn: '30d' }
        );

        return res.status(201).json({
            success: true,
            message: 'রেজিস্ট্রেশন সফল হয়েছে!',
            token,
            user: { id: user._id, fullName: user.fullName, identifier: user.identifier }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({ success: false, message: 'সার্ভারে সমস্যা হয়েছে' });
    }
});

// Login User
app.post('/login', async (req, res) => {
    try {
        const { identifier, pin } = req.body;

        const user = await User.findOne({ identifier });
        if (!user) {
            return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });
        }

        const isMatch = await bcrypt.compare(pin, user.pin);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'ভুল পিন দিয়েছেন' });
        }

        const token = jwt.sign(
            { userId: user._id, identifier: user.identifier },
            process.env.JWT_SECRET || 'nexa_secret_key',
            { expiresIn: '30d' }
        );

        return res.json({
            success: true,
            message: 'লগইন সফল হয়েছে!',
            token,
            user: { id: user._id, fullName: user.fullName, identifier: user.identifier }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: 'সার্ভার এরর' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
