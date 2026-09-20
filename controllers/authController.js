const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const admin = require('../firebaseAdmin');

// Generate unique 10-digit account number using crypto.randomInt (secure)
const generateUniqueAccountNumber = async () => {
  let isUnique = false;
  let accountNumber = '';
  while (!isUnique) {
    const num = crypto.randomInt(1000000000, 10000000000);
    accountNumber = num.toString();
    const exists = await User.findOne({ accountNumber });
    if (!exists) isUnique = true;
  }
  return accountNumber;
};

const signToken = (id) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing');
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/register-firebase - Email only, no phone
exports.registerWithFirebase = async (req, res) => {
  try {
    const { idToken, fullName, pin } = req.body;

    if (!idToken) return res.status(400).json({ success: false, message: 'Firebase idToken required' });
    if (!fullName || fullName.trim().length < 2) return res.status(400).json({ success: false, message: 'Full name required' });
    if (!pin || !/^\d{5}$/.test(pin)) return res.status(400).json({ success: false, message: 'PIN must be exactly 5 digits' });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase();
    const uid = decoded.uid;

    if (!email) return res.status(400).json({ success: false, message: 'Email not found in Firebase token' });

    let user = await User.findOne({ $or: [{ email }, { uid }] });
    if (user) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const hashedPin = await bcrypt.hash(pin, 12);
    const accountNumber = await generateUniqueAccountNumber();

    user = await User.create({
      fullName: fullName.trim(),
      email,
      pin: hashedPin,
      uid,
      accountNumber,
      emailVerified: decoded.email_verified || false,
      balance: 0,
      role: 'user'
    });

    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created',
      token,
      user: { 
        id: user._id, 
        email: user.email, 
        fullName: user.fullName, 
        accountNumber: user.accountNumber, 
        role: user.role,
        balance: user.balance
      }
    });

  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/auth/login-pin - Email Only
exports.loginWithPin = async (req, res) => {
  try {
    const { email, pin } = req.body;
    if (!email || !pin) return res.status(400).json({ success: false, message: 'Email and PIN required' });
    if (!/^\d{5}$/.test(pin)) return res.status(400).json({ success: false, message: 'PIN must be 5 digits' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(pin, user.pin);
    if (!isMatch) return res.status(401).json({ success: false, message: 'ভুল PIN' });

    const token = signToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        accountNumber: user.accountNumber,
        role: user.role,
        balance: user.balance,
        uid: user.uid
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-pin');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
