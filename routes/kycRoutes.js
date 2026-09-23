const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

router.post('/submit', auth, kycController.submitKyc);
router.get('/my', auth, kycController.getMyKyc);
router.get('/pending', auth, adminAuth, kycController.getPendingKyc);
router.post('/approve', auth, adminAuth, kycController.approveKyc);
router.post('/reject', auth, adminAuth, kycController.rejectKyc);

module.exports = router;
