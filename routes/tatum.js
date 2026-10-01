const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const tatumService = require('../services/tatumService');
const notificationService = require('../services/notificationService');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

router.post('/create-deposit-address', auth, adminAuth, async (req, res) => {
  try {
    const { userId, chain } = req.body;
    const targetChain = chain || 'bsc';

    const user = await User.findById(userId || req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (targetChain === 'bsc' && user.wallets && user.wallets.bscAddress) {
      return res.json({ success: true, address: user.wallets.bscAddress });
    }
    if (targetChain === 'ltc' && user.ltcAddress) {
      return res.json({ success: true, address: user.ltcAddress });
    }

    const wallet = await tatumService.generateWallet(targetChain);
    const index = Math.floor(Math.random() * 100000);
    const address = await tatumService.generateAddress(targetChain, wallet.xpub, index);

    if (targetChain === 'bsc') {
      user.wallets.bscAddress = address;
      user.wallets.walletIndex = index;
      user.wallets.xpub = wallet.xpub;
    } else if (targetChain === 'ltc') {
      user.ltcAddress = address;
      user.wallets.ltcXpub = wallet.xpub;
      user.wallets.ltcWalletIndex = index;
    }
    await user.save();

    try { await tatumService.subscribeDeposit(targetChain, address); } catch (e) { console.log(e.message); }

    res.json({ success: true, address });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const { address, amount, txId } = req.body;
    console.log('Deposit webhook:', req.body);
    if (!address) return res.sendStatus(200);

    let user = await User.findOne({ 'wallets.bscAddress': address });
    if (!user) user = await User.findOne({ ltcAddress: address });
    if (!user) return res.sendStatus(200);

    const exists = await Transaction.findOne({ trxId: txId });
    if (exists) return res.sendStatus(200);

    const depositAmount = parseFloat(amount) || 0;
    if (depositAmount <= 0) return res.sendStatus(200);

    await Transaction.create({
      user: user._id, type: 'deposit', amount: depositAmount,
      trxId: txId, status: 'approved', paymentMethodNumber: address
    });

    user.balance += depositAmount;
    await user.save();

    // 🔔 Notify user
    try {
      const isLtc = !!user.ltcAddress && user.ltcAddress === address;
      await notificationService.notify(user._id, {
        title: 'Deposit Received 💰',
        body: `You received ${isLtc ? depositAmount + ' LTC' : '$' + depositAmount.toFixed(2) + ' USDT'}.`,
        type: 'deposit',
        data: { screen: 'history', txId }
      });
    } catch (e) { console.log(e.message); }

    res.sendStatus(200);
  } catch (e) {
    console.log('Webhook error:', e.message);
    res.sendStatus(200);
  }
});

router.post('/withdraw/onchain', auth, async (req, res) => {
  try {
    const { to, amount, currency } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.balance < amount) return res.status(400).json({ success: false, message: 'Insufficient balance' });

    let txId;
    if (currency === 'ltc') {
      if (!process.env.HOT_WALLET_LTC_KEY || !process.env.HOT_WALLET_LTC_ADDRESS) {
        return res.status(500).json({ success: false, message: 'LTC hot wallet not configured' });
      }
      txId = await tatumService.sendLTC(
        process.env.HOT_WALLET_LTC_KEY,
        process.env.HOT_WALLET_LTC_ADDRESS,
        to, parseFloat(amount)
      );
    } else {
      txId = await tatumService.sendBEP20(process.env.HOT_WALLET_KEY, to, amount);
    }

    user.balance -= parseFloat(amount);
    await user.save();

    // 🔔 Notify user
    try {
      await notificationService.notify(user._id, {
        title: 'Withdrawal Sent ✓',
        body: `${currency === 'ltc' ? amount + ' LTC' : '$' + amount + ' USDT'} sent to ${to.slice(0, 10)}...`,
        type: 'cashout',
        data: { screen: 'history', txId }
      });
    } catch (e) { console.log(e.message); }

    res.json({ success: true, txId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
