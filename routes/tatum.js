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
// WEBHOOK
// ═══════════════════════════════════════════════════════════
router.post('/webhook', async (req, res) => {
  try {
    const { address, amount, txId } = req.body;
    console.log('🔔 Deposit webhook received:', JSON.stringify(req.body));

    if (!address) return res.sendStatus(200);

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

    await Transaction.create({
      user: user._id,
      type: 'deposit',
      amount: depositAmount,
      currency: isLtc ? 'ltc' : 'usdt',
      trxId: txId,
      status: 'approved',
      paymentMethodNumber: address
    });

    if (isLtc) {
      user.ltcBalance = (user.ltcBalance || 0) + depositAmount;
      console.log(`💰 LTC deposit: ${depositAmount} LTC → new balance ${user.ltcBalance}`);
    } else {
      user.balance = (user.balance || 0) + depositAmount;
      console.log(`💰 USDT deposit: $${depositAmount} → new balance ${user.balance}`);
    }
    await user.save();

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
// Withdraw on-chain — currency-aware + min check
// ═══════════════════════════════════════════════════════════
router.post('/withdraw/onchain', auth, async (req, res) => {
  try {
    const { to, amount, currency = 'usdt' } = req.body;
    const amt = parseFloat(amount);

    console.log(`💸 Withdraw request: ${currency} ${amt} → ${to}`);

    if (!to || !amt || amt <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid address or amount' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // ═══ NEW: Min withdrawal check ═══
    const MIN_WITHDRAW = { usdt: 3.0, ltc: 0.002 };
    if (MIN_WITHDRAW[currency] && amt < MIN_WITHDRAW[currency]) {
      return res.status(400).json({
        success: false,
        message: `Minimum ${currency.toUpperCase()} withdrawal is ${MIN_WITHDRAW[currency]}`
      });
    }

    // ═══ Currency-aware balance check ═══
    const balance = currency === 'ltc' ? (user.ltcBalance || 0) : user.balance;
    console.log(`💰 User balance: ${balance} ${currency.toUpperCase()}`);

    if (balance < amt) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${currency.toUpperCase()} balance. Available: ${balance}`
      });
    }

    let txId;
    if (currency === 'ltc') {
      if (!process.env.HOT_WALLET_LTC_KEY || !process.env.HOT_WALLET_LTC_ADDRESS) {
        console.log('❌ LTC hot wallet env vars missing');
        return res.status(500).json({
          success: false,
          message: 'LTC hot wallet not configured. Contact admin.'
        });
      }

      console.log(`🔐 Hot wallet: ${process.env.HOT_WALLET_LTC_ADDRESS}`);

      try {
        txId = await tatumService.sendLTC(
          process.env.HOT_WALLET_LTC_KEY,
          process.env.HOT_WALLET_LTC_ADDRESS,
          to, amt
        );
        console.log(`✅ LTC sent. txId: ${txId}`);
      } catch (tatumErr) {
        console.error('❌ Tatum sendLTC failed:', tatumErr.message);
        if (tatumErr.response) {
          console.error('Tatum response:', JSON.stringify(tatumErr.response.data));
        }
        return res.status(400).json({
          success: false,
          message: `Tatum error: ${tatumErr.response?.data?.message || tatumErr.message}`
        });
      }

      user.ltcBalance = (user.ltcBalance || 0) - amt;
    } else {
      if (!process.env.HOT_WALLET_KEY) {
        return res.status(500).json({ success: false, message: 'BSC hot wallet not configured' });
      }

      try {
        txId = await tatumService.sendBEP20(process.env.HOT_WALLET_KEY, to, amt);
        console.log(`✅ USDT sent. txId: ${txId}`);
      } catch (tatumErr) {
        console.error('❌ Tatum sendBEP20 failed:', tatumErr.message);
        if (tatumErr.response) {
          console.error('Tatum response:', JSON.stringify(tatumErr.response.data));
        }
        return res.status(400).json({
          success: false,
          message: `Tatum error: ${tatumErr.response?.data?.message || tatumErr.message}`
        });
      }

      user.balance -= amt;
    }
    await user.save();

    await Transaction.create({
      user: user._id,
      type: 'cashout',
      amount: amt,
      currency,
      status: 'approved',
      trxId: txId,
      paymentMethodNumber: to,
      note: `Withdraw ${currency.toUpperCase()} to ${to.slice(0, 12)}...`
    });

    try {
      await notificationService.notify(user._id, {
        title: 'Withdrawal Sent ✓',
        body: `${currency === 'ltc' ? amt + ' LTC' : '$' + amt + ' USDT'} sent to ${to.slice(0, 10)}...`,
        type: 'cashout',
        data: { screen: 'history', txId }
      });
    } catch (e) { console.log(e.message); }

    res.json({ success: true, txId });
  } catch (e) {
    console.error('❌ Withdraw error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// RE-SUBSCRIBE
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
// MANUAL SYNC
// ═══════════════════════════════════════════════════════════
router.post('/sync-balance', auth, async (req, res) => {
  try {
    const { chain = 'ltc' } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const address = chain === 'ltc' ? user.ltcAddress : user.wallets?.bscAddress;
    if (!address) return res.status(400).json({ success: false, message: `No ${chain} address on file` });

    console.log(`🔄 Manual sync requested: ${chain} ${address}`);

    const info = await tatumService.getAddressInfo(chain, address);
    console.log('Tatum address info:', JSON.stringify(info));

    const txs = await tatumService.getAddressTransactions(chain, address);
    console.log(`Tatum returned ${txs.length} transactions`);

    let credited = 0;
    let skipped = 0;

    for (const tx of txs) {
      if (!tx.hash) continue;

      let incomingAmount = 0;
      if (tx.outputs) {
        for (const out of tx.outputs) {
          if (out.address === address) {
            incomingAmount += parseFloat(out.value || 0);
          }
        }
      }

      if (incomingAmount <= 0) continue;

      const exists = await Transaction.findOne({ trxId: tx.hash });
      if (exists) {
        skipped++;
        continue;
      }

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
