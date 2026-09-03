const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { getPendingTransactions, processTransaction } = require('../controllers/adminController');

router.get('/pending', auth, adminAuth, getPendingTransactions);
router.post('/process', auth, adminAuth, processTransaction);

module.exports = router;

