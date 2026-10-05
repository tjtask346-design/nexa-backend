const express = require('express');
const router = express.Router();
const vc = require('../controllers/versionController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

/* PUBLIC — app version check */
router.get('/version', vc.checkVersion);

/* ADMIN — version config */
router.get('/admin/version', auth, adminAuth, vc.getVersionConfig);
router.post('/admin/version', auth, adminAuth, vc.updateVersionConfig);

module.exports = router;
