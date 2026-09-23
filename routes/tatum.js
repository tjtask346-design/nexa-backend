const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const tatumService = require('../services/tatumService');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// POST /api/wallet/create-deposit-address - আগের important কোডটা রেখে fixed
router.post('/create-deposit-address', auth, adminAuth, async (req, res) => {
  try {
    const { userId, chain } = req.body;
    const targetChain = chain || 'bsc';

    const user = await User.findById(userId || req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.wallets && user.wallets.bscAddress) {
      return res.json({ success: true, address: user.wallets.bscAddress });
    }

    const wallet = await tatumService.generateWallet(targetChain);
    const index = Math.floor(Math.random() * 100000);
    const address = await tatumService.generateAddress(targetChain, wallet.xpub, index);

    user.wallets.bscAddress = address;
    user.wallets.walletIndex = index;
    user.wallets.xpub = wallet.xpub;
    await user.save();

    try { await tatumService.subscribeDeposit(targetChain, address); } catch(e){ console.log(e.message); }

    res.json({ success: true, address });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/tatum/webhook - Tatum এখানে hit করবে
router.post('/webhook', async (req, res) => {
  try {
    const { address, amount, txId } = req.body;
    console.log('Deposit webhook:', req.body);
    if (!address) return res.sendStatus(200);

    const user = await User.findOne({ 'wallets.bscAddress': address });
    if (!user) return res.sendStatus(200);

    const exists = await Transaction.findOne({ trxId: txId });
    if (exists) return res.sendStatus(200);

    const depositAmount = parseFloat(amount) || 0;
    if (depositAmount <= 0) return res.sendStatus(200);

    await Transaction.create({
      user: user._id,
      type: 'deposit',
      amount: depositAmount,
      trxId: txId,
      status: 'approved',
      paymentMethodNumber: address
    });

    user.balance += depositAmount;
    await user.save();

    res.sendStatus(200);
  } catch (e) {
    console.log(e.message);
    res.sendStatus(200);
  }
});

// POST /api/withdraw/onchain
router.post('/withdraw/onchain', auth, async (req, res) => {
  try {
    const { to, amount } = req.body;
    const user = await User.findById(req.user._id);
    if (user.balance < amount) return res.status(400).json({ success: false, message: 'Insufficient balance' });

    const txId = await tatumService.sendBEP20(process.env.HOT_WALLET_KEY, to, amount);

    user.balance -= parseFloat(amount);
    await user.save();

    res.json({ success: true, txId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
