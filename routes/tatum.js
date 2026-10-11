const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const tatumService = require('../services/tatumService');
const notificationService = require('../services/notificationService');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// ═══════════════════════════════════════════════════════════
// Create deposit address (admin only)
// ═══════════════════════════════════════════════════════════
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

    try {
      await tatumService.subscribeDeposit(targetChain, address);
    } catch (e) {
      console.log('Subscribe error:', e.message);
    }

    res.json({ success: true, address });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// WEBHOOK — FIXED: LTC amount goes to ltcBalance, USDT to balance
// ═══════════════════════════════════════════════════════════
router.post('/webhook', async (req, res) => {
  try {
    const { address, amount, txId } = req.body;
    console.log('🔔 Deposit webhook received:', JSON.stringify(req.body));

    if (!address) return res.sendStatus(200);

    // Find user by address
    let user = await User.findOne({ 'wallets.bscAddress': address });
    let isLtc = false;
    if (!user) {
      user = await User.findOne({ ltcAddress: address });
      isLtc = !!user;
    }
    if (!user) {
      console.log(`⚠️ Webhook: no user found for address ${address}`);
      return res.sendStatus(200);
    }

    // Duplicate check
    const exists = await Transaction.findOne({ trxId: txId });
    if (exists) {
      console.log(`⚠️ Webhook: duplicate txId ${txId}`);
      return res.sendStatus(200);
    }

    const depositAmount = parseFloat(amount) || 0;
    if (depositAmount <= 0) {
      console.log(`⚠️ Webhook: invalid amount ${amount}`);
      return res.sendStatus(200);
    }

    // Create transaction record
    await Transaction.create({
      user: user._id,
      type: 'deposit',
      amount: depositAmount,
      currency: isLtc ? 'ltc' : 'usdt',
      trxId: txId,
      status: 'approved',
      paymentMethodNumber: address
    });

    // ═══════════════════════════════════════════════════════
    // FIXED: Credit to correct balance based on currency
    // ═══════════════════════════════════════════════════════
    if (isLtc) {
      user.ltcBalance = (user.ltcBalance || 0) + depositAmount;
      console.log(`💰 LTC deposit: ${depositAmount} LTC → new balance ${user.ltcBalance}`);
    } else {
      user.balance = (user.balance || 0) + depositAmount;
      console.log(`💰 USDT deposit: $${depositAmount} → new balance ${user.balance}`);
    }
    await user.save();

    // Notify user
    try {
      await notificationService.notify(user._id, {
        title: 'Deposit Received 💰',
        body: isLtc
          ? `You received ${depositAmount} LTC.`
          : `You received $${depositAmount.toFixed(2)} USDT.`,
        type: 'deposit',
        data: { screen: 'history', txId }
      });
    } catch (e) { console.log('Notify error:', e.message); }

    res.sendStatus(200);
  } catch (e) {
    console.log('Webhook error:', e.message);
    res.sendStatus(200);
  }
});

// ═══════════════════════════════════════════════════════════
// Withdraw on-chain
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// NEW: RE-SUBSCRIBE — Fix broken Tatum subscription
// ═══════════════════════════════════════════════════════════
router.post('/resubscribe', auth, async (req, res) => {
  try {
    const { chain = 'ltc' } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const address = chain === 'ltc' ? user.ltcAddress : user.wallets?.bscAddress;
    if (!address) return res.status(400).json({ success: false, message: `No ${chain} address on file` });

    console.log(`📡 Re-subscribing ${chain} ${address}`);
    const result = await tatumService.subscribeDeposit(chain, address);

    res.json({
      success: true,
      chain,
      address,
      tatumResponse: result
    });
  } catch (e) {
    console.error('Re-subscribe error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// NEW: MANUAL SYNC — Recover missed deposits from blockchain
// ═══════════════════════════════════════════════════════════
router.post('/sync-balance', auth, async (req, res) => {
  try {
    const { chain = 'ltc' } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const address = chain === 'ltc' ? user.ltcAddress : user.wallets?.bscAddress;
    if (!address) return res.status(400).json({ success: false, message: `No ${chain} address on file` });

    console.log(`🔄 Manual sync requested: ${chain} ${address}`);

    // Fetch blockchain data
    const info = await tatumService.getAddressInfo(chain, address);
    console.log('Tatum address info:', JSON.stringify(info));

    const txs = await tatumService.getAddressTransactions(chain, address);
    console.log(`Tatum returned ${txs.length} transactions`);

    let credited = 0;
    let skipped = 0;

    for (const tx of txs) {
      if (!tx.hash) continue;

      // Sum incoming to this address
      let incomingAmount = 0;
      if (tx.outputs) {
        for (const out of tx.outputs) {
          if (out.address === address) {
            incomingAmount += parseFloat(out.value || 0);
          }
        }
      }

      if (incomingAmount <= 0) continue;

      // Skip if already recorded
      const exists = await Transaction.findOne({ trxId: tx.hash });
      if (exists) {
        skipped++;
        continue;
      }

      // Create deposit record
      await Transaction.create({
        user: user._id,
        type: 'deposit',
        amount: incomingAmount,
        currency: chain,
        trxId: tx.hash,
        status: 'approved',
        paymentMethodNumber: address
      });

      credited += incomingAmount;
    }

    // Update balance with newly credited amount
    if (credited > 0) {
      if (chain === 'ltc') {
        user.ltcBalance = (user.ltcBalance || 0) + credited;
      } else {
        user.balance = (user.balance || 0) + credited;
      }
      await user.save();

      try {
        await notificationService.notify(user._id, {
          title: 'Deposit Recovered 💰',
          body: `${credited} ${chain.toUpperCase()} added to your balance.`,
          type: 'deposit',
          data: { screen: 'history' }
        });
      } catch (e) { console.log(e.message); }
    }

    res.json({
      success: true,
      chain,
      address,
      totalTxs: txs.length,
      alreadySynced: skipped,
      newlyCredited: credited,
      newBalance: chain === 'ltc' ? user.ltcBalance : user.balance
    });
  } catch (e) {
    console.error('Sync error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
