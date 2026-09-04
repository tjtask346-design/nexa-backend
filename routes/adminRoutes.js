const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth'); // Ensure admin auth middleware is used

router.post('/approve-deposit', adminAuth, adminController.approveDeposit);
router.post('/approve-cashout', adminAuth, adminController.approveCashOut);

module.exports = router;
