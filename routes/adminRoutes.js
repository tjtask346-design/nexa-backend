const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth'); // Ensure you have this middleware

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/set-pin', authMiddleware, authController.setPin);

module.exports = router;
