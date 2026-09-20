const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// POST /api/admin/approve-deposit - ATOMIC
exports.approveDeposit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { transactionId, action, adminNote } = req.body; // action: approved|rejected
    if (!['approved','rejected'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid action' });

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
    res.json({ success: true, message: `Deposit ${action}`, transaction: trx });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: e.message });
  } finally { session.endSession(); }
};

// POST /api/admin/approve-cashout - ATOMIC
exports.approveCashOut = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { transactionId, action, adminNote } = req.body;
    if (!['approved','rejected'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid action' });

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
    res.json({ success: true, message: `Cashout ${action}`, transaction: trx });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: e.message });
  } finally { session.endSession(); }
};

// GET /api/admin/pending?type=deposit|cashout
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
