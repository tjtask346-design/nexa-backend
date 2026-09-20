const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// POST /api/transaction/deposit/request
exports.requestDeposit = async (req, res) => {
  try {
    const { amount, trxId, paymentMethodNumber } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ success: false, message: 'Min deposit $10' });
    if (!trxId) return res.status(400).json({ success: false, message: 'TrxID required' });

    const exists = await Transaction.findOne({ trxId });
    if (exists) return res.status(400).json({ success: false, message: 'Duplicate TrxID' });

    const trx = await Transaction.create({
      user: req.user._id,
      type: 'deposit',
      amount,
      trxId,
      paymentMethodNumber,
      status: 'pending'
    });

    res.json({ success: true, message: 'Deposit request submitted', transaction: trx });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /api/transaction/resolve/:uid or accountNumber
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

// POST /api/transaction/send - ATOMIC with session
exports.sendMoney = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { receiverUid, amount, pin } = req.body;
    if (!receiverUid || !amount) return res.status(400).json({ success: false, message: 'Receiver and amount required' });
    if (amount < 1) return res.status(400).json({ success: false, message: 'Min $1' });

    // Verify PIN
    const sender = await User.findById(req.user._id).session(session);
    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(pin, sender.pin);
    if (!ok) {
      await session.abortTransaction();
      return res.status(401).json({ success: false, message: 'ভুল PIN' });
    }

    if (sender.balance < amount) {
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

    // Atomic balance update
    sender.balance -= amount;
    receiver.balance += amount;

    await sender.save({ session });
    await receiver.save({ session });

    const trxId = 'TRX' + crypto.randomInt(100000, 999999) + Date.now().toString().slice(-6);

    const trx = await Transaction.create([{
      user: sender._id,
      type: 'transfer',
      amount,
      status: 'approved',
      senderUid: sender.uid,
      receiverUid: receiver.uid,
      trxId,
      note: `Send to ${receiver.email}`
    }], { session });

    await session.commitTransaction();
    res.json({ success: true, message: 'Sent successfully', transaction: trx[0], newBalance: sender.balance });

  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: e.message });
  } finally {
    session.endSession();
  }
};

// POST /api/transaction/cashout/request
exports.requestCashOut = async (req, res) => {
  try {
    const { amount, paymentMethodNumber } = req.body;
    if (!amount || amount < 20) return res.status(400).json({ success: false, message: 'Min cashout $20' });

    const user = await User.findById(req.user._id);
    if (user.balance < amount) return res.status(400).json({ success: false, message: 'Insufficient balance' });

    const trx = await Transaction.create({
      user: user._id,
      type: 'cashout',
      amount,
      paymentMethodNumber,
      status: 'pending'
    });

    res.json({ success: true, message: 'Cashout requested', transaction: trx });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /api/transaction/my
exports.myTransactions = async (req, res) => {
  try {
    const list = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, transactions: list });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
