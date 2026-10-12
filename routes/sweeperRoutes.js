// routes/sweeperRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const sweeperService = require('../services/sweeperService');
const tatumService = require('../services/tatumService');
const config = require('../config/wallets');
const User = require('../models/User');

router.use(auth, adminAuth);

// Trigger full sweep
router.post('/run', async (req, res) => {
  try {
    const result = await sweeperService.sweepAll();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Preview (no tx)
router.get('/preview', async (req, res) => {
  try {
    const preview = await sweeperService.previewAll();
    res.json({ success: true, preview });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Sweep single user
router.post('/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const ltc = user.ltcAddress ? await sweeperService.sweepLTC(user) : null;
    const usdt = user.wallets?.bscAddress ? await sweeperService.sweepBSC_USDT(user) : null;

    res.json({ success: true, ltc, usdt });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Hot wallet balance monitor
router.get('/hot-balance', async (req, res) => {
  try {
    const [ltcInfo, bnbInfo, usdtBal] = await Promise.all([
      tatumService.getAddressInfo('ltc', config.LTC.hotWallet.address),
      tatumService.getAddressInfo('bsc', config.BSC.hotWallet.address),
      tatumService.getBEP20Balance(config.BSC.hotWallet.address, config.BSC.usdtContract),
    ]);

    res.json({
      success: true,
      ltc: {
        address: config.LTC.hotWallet.address,
        balance: parseFloat(ltcInfo?.balance || 0),
      },
      bnb: {
        address: config.BSC.hotWallet.address,
        balance: parseFloat(bnbInfo?.balance || 0),
      },
      usdt: {
        address: config.BSC.hotWallet.address,
        balance: usdtBal,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
