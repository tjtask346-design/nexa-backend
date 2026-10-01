const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const notificationService = require('../services/notificationService');

exports.approveDeposit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { transactionId, action, adminNote } = req.body;
    if (!['approved','rejected'].includes(action)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const trx = await Transaction.findById(transactionId).session(session);
    if (!trx) { await session.abortTransaction(); return res.status(404).json({ success: false, message: 'Transaction not found' }); }
    if (trx.status !== 'pending') { await session.abortTransaction(); return res.status(400).json({ success: false, message: 'Already processed' }); }

    if (action === 'approved' && trx.type === 'deposit') {
      const user = await User.findById(trx.user).session(session);
      user.balance += trx.amount;
      await user.save({ session });
    }

    trx.status = action;
    trx.adminNote = adminNote || '';
    await trx.save({ session });

    await session.commitTransaction();

    // 🔔 Notify user
    try {
      const title = action === 'approved' ? 'Deposit Approved 💰' : 'Deposit Rejected';
      const body = action === 'approved'
        ? `$${Number(trx.amount).toFixed(2)} has been added to your balance.`
        : (adminNote || `Your deposit of $${Number(trx.amount).toFixed(2)} was rejected.`);
      await notificationService.notify(trx.user, {
        title, body, type: 'deposit',
        data: { screen: 'history', txId: String(trx._id) }
      });
    } catch (e) { console.log(e.message); }

    res.json({ success: true, message: `Deposit ${action}`, transaction: trx });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: e.message });
  } finally { session.endSession(); }
};

exports.approveCashOut = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { transactionId, action, adminNote } = req.body;
    if (!['approved','rejected'].includes(action)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const trx = await Transaction.findById(transactionId).session(session);
    if (!trx) { await session.abortTransaction(); return res.status(404).json({ success: false, message: 'Not found' }); }
    if (trx.status !== 'pending') { await session.abortTransaction(); return res.status(400).json({ success: false, message: 'Already processed' }); }

    if (action === 'approved' && trx.type === 'cashout') {
      const user = await User.findById(trx.user).session(session);
      if (user.balance < trx.amount) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'User balance insufficient now' });
      }
      user.balance -= trx.amount;
      await user.save({ session });
    }

    trx.status = action;
    trx.adminNote = adminNote || '';
    await trx.save({ session });

    await session.commitTransaction();

    // 🔔 Notify user
    try {
      const title = action === 'approved' ? 'Withdrawal Approved ✓' : 'Withdrawal Rejected';
      const body = action === 'approved'
        ? `Your withdrawal of $${Number(trx.amount).toFixed(2)} has been processed.`
        : (adminNote || `Your withdrawal of $${Number(trx.amount).toFixed(2)} was rejected.`);
      await notificationService.notify(trx.user, {
        title, body, type: 'cashout',
        data: { screen: 'history', txId: String(trx._id) }
      });
    } catch (e) { console.log(e.message); }

    res.json({ success: true, message: `Cashout ${action}`, transaction: trx });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: e.message });
  } finally { session.endSession(); }
};

exports.getPendingTransactions = async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { status: 'pending' };
    if (type) filter.type = type;

    const list = await Transaction.find(filter)
      .populate('user', 'email fullName accountNumber balance')
      .sort({ createdAt: 1 });

    res.json({ success: true, count: list.length, transactions: list });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
