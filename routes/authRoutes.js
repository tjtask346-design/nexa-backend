const express = require('express');
const router = express.Router();
const { registerWithFirebase, loginWithPin } = require('../controllers/authController');

router.post('/register', registerWithFirebase);
router.post('/login', loginWithPin);

module.exports = router;
