const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Generate 11-digit UID
const generateUID = () => {
    return Math.floor(10000000000 + Math.random() * 90000000000).toString();
};

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

        let uid = generateUID();
        // Ensure UID is unique
        while (await User.findOne({ uid })) { uid = generateUID(); }

        user = new User({ name, email, password, uid });
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: user._id, name, email, uid, kycStatus: user.kycStatus } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, name, email, uid: user.uid, balance: user.balance, kycStatus: user.kycStatus } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.setPin = async (req, res) => {
    try {
        const { pin } = req.body; // 5-digit PIN
        if (pin.length !== 5) return res.status(400).json({ message: 'PIN must be 5 digits' });

        const salt = await bcrypt.genSalt(10);
        const hashedPin = await bcrypt.hash(pin, salt);

        await User.findByIdAndUpdate(req.user.id, { pin: hashedPin });
        res.json({ message: 'PIN set successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
