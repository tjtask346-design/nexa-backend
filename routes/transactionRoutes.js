const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { transferP2P, depositBkash, withdrawBkash } = require('../controllers/transactionController');

router.post('/transfer', auth, transferP2P);
router.post('/deposit', auth, depositBkash);
router.post('/withdraw', auth, withdrawBkash);

module.exports = router;
