const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

router.use(auth, adminAuth);

router.get('/stats', adminController.stats);

router.post('/approve-deposit', adminController.approveDeposit);
router.post('/approve-cashout', adminController.approveCashOut);
router.get('/pending', adminController.getPendingTransactions);

router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.post('/users/adjust', adminController.adjustBalance);
router.post('/users/ban', adminController.setBan);
router.delete('/users/:id', adminController.deleteUser);

router.post('/notify', adminController.sendUserNotification);

module.exports = router;
