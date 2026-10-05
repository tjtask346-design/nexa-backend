const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const User = require('../models/User');
const admin = require('../firebaseAdmin');

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
    if (user) return res.status(400).json({ success: false, message: 'User already exists with this email' });

    const hashedPin = await bcrypt.hash(pin, 12);
    const accountNumber = await generateUniqueAccountNumber();

    user = await User.create({
      fullName: fullName.trim(),
      email, pin: hashedPin, uid, accountNumber,
      emailVerified: decoded.email_verified || false,
      balance: 0, role: 'user', totpEnabled: false, totpSecret: null
    });

    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created. Set up 2FA next.',
      token,
      user: {
        id: user._id, email: user.email, fullName: user.fullName,
        accountNumber: user.accountNumber, role: user.role,
        balance: user.balance, totpEnabled: false,
        avatarUrl: user.avatarUrl,
        kycStatus: user.kycStatus
      }
    });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.loginWithPin = async (req, res) => {
  try {
    const { email, pin, code } = req.body;
    if (!email || !pin) return res.status(400).json({ success: false, message: 'Email and PIN required' });
    if (!/^\d{5}$/.test(pin)) return res.status(400).json({ success: false, message: 'PIN must be 5 digits' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+totpSecret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(pin, user.pin);
    if (!isMatch) return res.status(401).json({ success: false, message: 'ভুল PIN' });

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        banned: true,
        reason: user.banReason || 'Suspicious activity detected on your account.',
        message: 'Account suspended'
      });
    }

    if (!user.totpEnabled || !user.totpSecret) {
      const token = signToken(user._id);
      return res.json({
        success: true, requiresTotpSetup: true, token, message: '2FA setup required',
        user: {
          id: user._id, email: user.email, fullName: user.fullName,
          accountNumber: user.accountNumber, role: user.role,
          balance: user.balance, totpEnabled: false,
          avatarUrl: user.avatarUrl,
          kycStatus: user.kycStatus
        }
      });
    }

    if (!code) {
      return res.json({ success: false, requiresTotp: true, message: 'Two-factor authentication code required' });
    }

    if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'Code must be 6 digits' });

    const codeOk = speakeasy.totp.verify({
      secret: user.totpSecret, encoding: 'base32', token: code, window: 1
    });
    if (!codeOk) return res.status(401).json({ success: false, message: 'Invalid or expired code' });

    const token = signToken(user._id);
    res.json({
      success: true, token,
      user: {
        id: user._id, email: user.email, fullName: user.fullName,
        accountNumber: user.accountNumber, role: user.role,
        balance: user.balance, uid: user.uid, totpEnabled: true,
        avatarUrl: user.avatarUrl,
        kycStatus: user.kycStatus
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.setupTotp = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.totpEnabled) return res.status(400).json({ success: false, message: 'TOTP already enabled' });

    const secret = speakeasy.generateSecret({
      name: `Nexa:${user.email}`, issuer: 'Nexa', length: 20
    });

    user.totpSecret = secret.base32;
    user.totpEnabled = false;
    await user.save();

    res.json({
      success: true, secret: secret.base32, otpauth: secret.otpauth_url,
      message: 'Scan QR with your authenticator app'
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.verifyTotpSetup = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: '6-digit code required' });

    const user = await User.findById(req.user._id).select('+totpSecret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.totpSecret) return res.status(400).json({ success: false, message: 'Run setup first' });
    if (user.totpEnabled) return res.status(400).json({ success: false, message: 'Already enabled' });

    const ok = speakeasy.totp.verify({
      secret: user.totpSecret, encoding: 'base32', token: code, window: 1
    });
    if (!ok) return res.status(400).json({ success: false, message: 'Invalid or expired code' });

    user.totpEnabled = true;
    await user.save();
    res.json({ success: true, message: 'Two-factor authentication enabled' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.disableTotp = async (req, res) => {
  try {
    const { pin, code } = req.body;
    if (!pin || !/^\d{5}$/.test(pin)) return res.status(400).json({ success: false, message: '5-digit PIN required' });
    if (!code || !/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: '6-digit code required' });

    const user = await User.findById(req.user._id).select('+totpSecret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.totpEnabled) return res.status(400).json({ success: false, message: 'TOTP not enabled' });

    const pinOk = await bcrypt.compare(pin, user.pin);
    if (!pinOk) return res.status(401).json({ success: false, message: 'Invalid PIN' });

    const codeOk = speakeasy.totp.verify({
      secret: user.totpSecret, encoding: 'base32', token: code, window: 1
    });
    if (!codeOk) return res.status(401).json({ success: false, message: 'Invalid code' });

    user.totpEnabled = false;
    user.totpSecret = null;
    await user.save();
    res.json({ success: true, message: 'Two-factor authentication disabled' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.resetPinWithTotp = async (req, res) => {
  try {
    const { email, code, newPin } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });
    if (!code || !/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: '6-digit code required' });
    if (!newPin || !/^\d{5}$/.test(newPin)) return res.status(400).json({ success: false, message: 'New 5-digit PIN required' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+totpSecret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.totpEnabled || !user.totpSecret) return res.status(400).json({ success: false, message: 'TOTP not enabled for this account' });

    const ok = speakeasy.totp.verify({
      secret: user.totpSecret, encoding: 'base32', token: code, window: 1
    });
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid or expired code' });

    user.pin = await bcrypt.hash(newPin, 12);
    await user.save();
    res.json({ success: true, message: 'PIN reset successful. Login with your new PIN.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-pin -fcmTokens -adminFcmTokens');

    if (user?.isBanned) {
      return res.status(403).json({
        success: false,
        banned: true,
        reason: user.banReason || 'Suspicious activity detected on your account.',
        message: 'Account suspended'
      });
    }

    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ═══════════════════════════════════════════════════════════
// FCM TOKEN — Separate for user app and admin app
// ═══════════════════════════════════════════════════════════
exports.saveFcmToken = async (req, res) => {
  try {
    const { token, app } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    const field = (app === 'admin') ? 'adminFcmTokens' : 'fcmTokens';
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { [field]: token } });
    res.json({ success: true, message: 'Token saved', app: app || 'user' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.removeFcmToken = async (req, res) => {
  try {
    const { token, app } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    const field = (app === 'admin') ? 'adminFcmTokens' : 'fcmTokens';
    await User.findByIdAndUpdate(req.user._id, { $pull: { [field]: token } });
    res.json({ success: true, message: 'Token removed' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.updateAvatar = async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'avatarUrl required' });
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatarUrl },
      { new: true }
    ).select('-pin -fcmTokens -adminFcmTokens');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'Avatar updated', user });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
