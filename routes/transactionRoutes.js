const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const authMiddleware = require('../middleware/auth');

// Trust factor endpoint
router.get('/resolve-uid/:uid', authMiddleware, transactionController.resolveUid);

// Core transactional endpoints
router.post('/deposit', authMiddleware, transactionController.requestDeposit);
router.post('/transfer', authMiddleware, transactionController.sendMoney);
router.post('/cashout', authMiddleware, transactionController.requestCashOut);

module.exports = router;
