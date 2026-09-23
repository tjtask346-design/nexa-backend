const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Email-only fixed version - আগের OTP কোডের important logic টা রেখে নতুন controller এ ম্যাপ করা
router.post('/register-firebase', authController.registerWithFirebase);
router.post('/login-pin', authController.loginWithPin);
router.get('/me', auth, authController.getMe);

// পুরানো route গুলো রাখলাম যাতে অন্য কোথাও use হলে ভাঙে না, ভেতরে নতুন logic
router.post('/send-otp', (req,res) => res.status(400).json({ success:false, message:'Use /register-firebase with Firebase idToken' }));
router.post('/verify-otp', authController.registerWithFirebase);
router.post('/login', authController.loginWithPin);

module.exports = router;
