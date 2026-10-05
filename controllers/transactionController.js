const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const notificationService = require('../services/notificationService');

exports.requestDeposit = async (req, res) => {
  try {
    const { amount, trxId, paymentMethodNumber } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ success: false, message: 'Min deposit $10' });
    if (!trxId) return res.status(400).json({ success: false, message: 'TrxID required' });

    const exists = await Transaction.findOne({ trxId });
    if (exists) return res.status(400).json({ success: false, message: 'Duplicate TrxID' });

    const trx = await Transaction.create({
      user: req.user._id, type: 'deposit', amount, trxId,
      paymentMethodNumber, status: 'pending', currency: 'usdt'
    });

    try {
      const u = await User.findById(req.user._id).select('email');
      await notificationService.notifyAllAdmins({
        title: '🆕 New Deposit Request',
        body: `${u?.email || 'A user'} requested a deposit of $${Number(amount).toFixed(2)}.`,
        type: 'deposit',
        data: { screen: 'admin_tx', txId: String(trx._id) }
      });
    } catch (e) { console.log(e.message); }

    res.json({ success: true, message: 'Deposit request submitted', transaction: trx });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.resolveUid = async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await User.findOne({
      $or: [{ uid }, { accountNumber: uid }, { email: uid.toLowerCase() }]
    }).select('fullName email accountNumber uid');

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ═══════════════════════════════════════════════════════════
// SEND MONEY — Internal Nexa transfer (USDT / LTC selectable)
// Min values: USDT $0.02 · LTC 0.0001
// ═══════════════════════════════════════════════════════════
exports.sendMoney = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { receiverUid, amount, pin, currency = 'usdt' } = req.body;
    const amt = Number(amount);

    if (!receiverUid || !amt) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Receiver and amount required' });
    }

    if (!['usdt', 'ltc'].includes(currency)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid currency' });
    }

    // ═══ Very low min for internal transfers ═══
    const MIN_AMOUNT = { usdt: 0.02, ltc: 0.0001 };
    if (amt < MIN_AMOUNT[currency]) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: currency === 'ltc' ? 'Min 0.0001 LTC' : 'Min $0.02'
      });
    }

    const sender = await User.findById(req.user._id).session(session);
    const ok = await bcrypt.compare(pin, sender.pin);
    if (!ok) {
      await session.abortTransaction();
      return res.status(401).json({ success: false, message: 'ভুল PIN' });
    }

    const senderBalance = currency === 'ltc'
      ? (sender.ltcBalance || 0)
      : sender.balance;

    if (senderBalance < amt) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const receiver = await User.findOne({
      $or: [{ uid: receiverUid }, { accountNumber: receiverUid }, { email: receiverUid.toLowerCase() }]
    }).session(session);

    if (!receiver) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Receiver not found' });
    }
    if (receiver._id.toString() === sender._id.toString()) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Cannot send to yourself' });
    }

    // ═══ Update correct balance based on currency ═══
    if (currency === 'ltc') {
      sender.ltcBalance = (sender.ltcBalance || 0) - amt;
      receiver.ltcBalance = (receiver.ltcBalance || 0) + amt;
    } else {
      sender.balance -= amt;
      receiver.balance += amt;
    }
    await sender.save({ session });
    await receiver.save({ session });

    const trxId = 'TRX' + crypto.randomInt(100000, 999999) + Date.now().toString().slice(-6);

    const trx = await Transaction.create([{
      user: sender._id,
      type: 'transfer',
      amount: amt,
      currency,
      status: 'approved',
      senderUid: sender.uid,
      receiverUid: receiver.uid,
      trxId,
      note: `Send ${currency.toUpperCase()} to ${receiver.email}`
    }], { session });

    await session.commitTransaction();

    try {
      const currencyLabel = currency === 'ltc' ? 'LTC' : 'USDT';
      const amountLabel = currency === 'ltc'
        ? `${amt} LTC`
        : `$${amt.toFixed(2)} USDT`;

      await notificationService.notify(receiver._id, {
        title: 'Money Received 💸',
        body: `You received ${amountLabel} from ${sender.fullName || sender.email}.`,
        type: 'transfer',
        data: { screen: 'history', txId: String(trx[0]._id), currency }
      });
    } catch (e) { console.log(e.message); }

    res.json({
      success: true,
      message: 'Sent successfully',
      transaction: trx[0],
      newBalance: currency === 'ltc' ? sender.ltcBalance : sender.balance
    });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: e.message });
  } finally {
    session.endSession();
  }
};

exports.requestCashOut = async (req, res) => {
  try {
    const { amount, paymentMethodNumber } = req.body;
    if (!amount || amount < 20) return res.status(400).json({ success: false, message: 'Min cashout $20' });

    const user = await User.findById(req.user._id);
    if (user.balance < amount) return res.status(400).json({ success: false, message: 'Insufficient balance' });

    const trx = await Transaction.create({
      user: user._id, type: 'cashout', amount, currency: 'usdt',
      paymentMethodNumber, status: 'pending'
    });

    try {
      await notificationService.notifyAllAdmins({
        title: '🆕 New Withdrawal Request',
        body: `${user.email} requested a withdrawal of $${Number(amount).toFixed(2)}.`,
        type: 'cashout',
        data: { screen: 'admin_tx', txId: String(trx._id) }
      });
    } catch (e) { console.log(e.message); }

    res.json({ success: true, message: 'Cashout requested', transaction: trx });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.myTransactions = async (req, res) => {
  try {
    const list = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, transactions: list });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
