const express = require('express');
const router = express.Router();
const { 
    sendEmailOtp, 
    verifyOtpAndRegister, 
    login, 
    sendWhatsAppOtp, 
    verifyWhatsAppAndGenerateUID 
} = require('../controllers/authController');

// Authentication Routes
router.post('/send-email-otp', sendEmailOtp);
router.post('/verify-email-otp', verifyOtpAndRegister);
router.post('/login', login); // Logs in with Email and PIN

// KYC & UID Generation Routes
router.post('/send-wa-otp', sendWhatsAppOtp);
router.post('/verify-wa-otp', verifyWhatsAppAndGenerateUID);

module.exports = router;
