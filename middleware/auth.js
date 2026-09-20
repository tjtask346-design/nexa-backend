const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
    try {
        const header = req.header('Authorization') || '';
        const token = header.startsWith('Bearer ') ? header.replace('Bearer ', '').trim() : null;

        if (!token) {
            return res.status(401).json({ success: false, message: 'টোকেন দেওয়া হয়নি' });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('JWT_SECRET missing');
            return res.status(500).json({ success: false, message: 'Server config error' });
        }

        const decoded = jwt.verify(token, secret);
        const user = await User.findById(decoded.id).select('-pin');
        if (!user) {
            return res.status(401).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });
        }

        req.user = user; // full user with role
        req.tokenData = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'অকার্যকর বা মেয়াদোত্তীর্ণ টোকেন!' });
    }
};
