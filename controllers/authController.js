const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
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

/* ═══════════════════════════════════════
   REGISTER (Firebase) — unchanged behavior
   TOTP setup happens via /setup-totp afterwards
   ═══════════════════════════════════════ */
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
      role: 'user',
      totpEnabled: false,
      totpSecret: null
    });

    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created. Set up 2FA next.',
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        accountNumber: user.accountNumber,
        role: user.role,
        balance: user.balance,
        totpEnabled: false
      }
    });

  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════
   LOGIN with PIN — TOTP aware
   ═══════════════════════════════════════ */
exports.loginWithPin = async (req, res) => {
  try {
    const { email, pin, code } = req.body;

    if (!email || !pin) {
      return res.status(400).json({ success: false, message: 'Email and PIN required' });
    }
    if (!/^\d{5}$/.test(pin)) {
      return res.status(400).json({ success: false, message: 'PIN must be 5 digits' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+totpSecret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(pin, user.pin);
    if (!isMatch) return res.status(401).json({ success: false, message: 'ভুল PIN' });

    // ─── Case 1: TOTP not set up yet ───
    if (!user.totpEnabled || !user.totpSecret) {
      const token = signToken(user._id);
      return res.json({
        success: true,
        requiresTotpSetup: true,
        token,
        message: '2FA setup required',
        user: {
          id: user._id, email: user.email, fullName: user.fullName,
          accountNumber: user.accountNumber, role: user.role,
          balance: user.balance, totpEnabled: false
        }
      });
    }

    // ─── Case 2: TOTP enabled but code not provided ───
    if (!code) {
      return res.json({
        success: false,
        requiresTotp: true,
        message: 'Two-factor authentication code required'
      });
    }

    // ─── Case 3: code provided — verify ───
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Code must be 6 digits' });
    }

    const codeOk = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!codeOk) {
      return res.status(401).json({ success: false, message: 'Invalid or expired code' });
    }

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
        uid: user.uid,
        totpEnabled: true
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════
   SETUP TOTP — generate secret + otpauth URL
   ═══════════════════════════════════════ */
exports.setupTotp = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.totpEnabled) {
      return res.status(400).json({ success: false, message: 'TOTP already enabled' });
    }

    const secret = speakeasy.generateSecret({
      name: `Nexa:${user.email}`,
      issuer: 'Nexa',
      length: 20
    });

    user.totpSecret = secret.base32;
    user.totpEnabled = false;
    await user.save();

    res.json({
      success: true,
      secret: secret.base32,
      otpauth: secret.otpauth_url,
      message: 'Scan QR with your authenticator app'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════
   VERIFY TOTP SETUP — enables 2FA
   ═══════════════════════════════════════ */
exports.verifyTotpSetup = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: '6-digit code required' });
    }

    const user = await User.findById(req.user._id).select('+totpSecret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.totpSecret) return res.status(400).json({ success: false, message: 'Run setup first' });
    if (user.totpEnabled) return res.status(400).json({ success: false, message: 'Already enabled' });

    const ok = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!ok) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }

    user.totpEnabled = true;
    await user.save();

    res.json({ success: true, message: 'Two-factor authentication enabled' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════
   DISABLE TOTP — requires PIN + TOTP code
   ═══════════════════════════════════════ */
exports.disableTotp = async (req, res) => {
  try {
    const { pin, code } = req.body;

    if (!pin || !/^\d{5}$/.test(pin)) {
      return res.status(400).json({ success: false, message: '5-digit PIN required' });
    }
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: '6-digit code required' });
    }

    const user = await User.findById(req.user._id).select('+totpSecret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.totpEnabled) return res.status(400).json({ success: false, message: 'TOTP not enabled' });

    const pinOk = await bcrypt.compare(pin, user.pin);
    if (!pinOk) return res.status(401).json({ success: false, message: 'Invalid PIN' });

    const codeOk = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });
    if (!codeOk) return res.status(401).json({ success: false, message: 'Invalid code' });

    user.totpEnabled = false;
    user.totpSecret = null;
    await user.save();

    res.json({ success: true, message: 'Two-factor authentication disabled' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════
   RESET PIN USING TOTP (no old PIN needed)
   ═══════════════════════════════════════ */
exports.resetPinWithTotp = async (req, res) => {
  try {
    const { email, code, newPin } = req.body;

    if (!email) return res.status(400).json({ success: false, message: 'Email required' });
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: '6-digit code required' });
    }
    if (!newPin || !/^\d{5}$/.test(newPin)) {
      return res.status(400).json({ success: false, message: 'New 5-digit PIN required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+totpSecret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.totpEnabled || !user.totpSecret) {
      return res.status(400).json({ success: false, message: 'TOTP not enabled for this account' });
    }

    const ok = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!ok) return res.status(401).json({ success: false, message: 'Invalid or expired code' });

    user.pin = await bcrypt.hash(newPin, 12);
    await user.save();

    res.json({ success: true, message: 'PIN reset successful. Login with your new PIN.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════
   GET ME
   ═══════════════════════════════════════ */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-pin');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
