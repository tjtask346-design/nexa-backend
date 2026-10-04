const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// All routes require login + admin role
router.use(auth, adminAuth);

// ─── Dashboard ───
router.get('/stats', adminController.stats);

// ─── Existing: Deposit / Cashout ───
router.post('/approve-deposit', adminController.approveDeposit);
router.post('/approve-cashout', adminController.approveCashOut);
router.get('/pending', adminController.getPendingTransactions);

// ─── NEW: User management ───
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.post('/users/adjust', adminController.adjustBalance);
router.post('/users/ban', adminController.setBan);
router.delete('/users/:id', adminController.deleteUser);

// ─── Send arbitrary notification to a user ───
router.post('/notify', adminController.sendUserNotification);

module.exports = router;
