const express = require('express');
const router = express.Router();
const pc = require('../controllers/priceController');

// Public — no auth (used by apps to show total balance)
router.get('/price', pc.getPrices);

module.exports = router;
