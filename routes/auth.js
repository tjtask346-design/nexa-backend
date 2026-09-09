const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/send-otp', authController.sendEmailOtp);
router.post('/verify-otp', authController.verifyOtpAndRegister);
router.post('/login', authController.login);

module.exports = router;
