const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Clean endpoints for Android App
router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;
