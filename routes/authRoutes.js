const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/register-firebase', authController.registerWithFirebase);
router.post('/login-pin', authController.loginWithPin);
router.get('/me', auth, authController.getMe);

router.post('/setup-totp', auth, authController.setupTotp);
router.post('/verify-totp-setup', auth, authController.verifyTotpSetup);
router.post('/disable-totp', auth, authController.disableTotp);
router.post('/reset-pin-with-totp', authController.resetPinWithTotp);

// ─── FCM Token ───
router.post('/save-fcm-token', auth, authController.saveFcmToken);
router.post('/remove-fcm-token', auth, authController.removeFcmToken);

// ─── Avatar (NEW) ───
router.put('/avatar', auth, authController.updateAvatar);

module.exports = router;
