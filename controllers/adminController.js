const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Kyc = require('../models/Kyc');
const Notification = require('../models/Notification');
const admin = require('../firebaseAdmin');
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

exports.stats = async (req, res) => {
  try {
    const [totalUsers, bannedUsers, pendingKyc, pendingTx, totalBalanceAgg] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isBanned: true }),
      Kyc.countDocuments({ status: 'pending' }),
      Transaction.countDocuments({ status: 'pending' }),
      User.aggregate([{ $group: { _id: null, sum: { $sum: '$balance' } } }])
    ]);
    res.json({
      success: true,
      totalUsers, bannedUsers, pendingKyc, pendingTx,
      totalBalance: totalBalanceAgg[0]?.sum || 0
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.listUsers = async (req, res) => {
  try {
    const { q = '', page = 1, limit = 20, banned } = req.query;
    const filter = {};
    if (q) {
      const rx = new RegExp(q, 'i');
      filter.$or = [
        { email: rx }, { fullName: rx },
        { accountNumber: rx }, { uid: rx }
      ];
    }
    if (banned === 'true')  filter.isBanned = true;
    if (banned === 'false') filter.isBanned = false;

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-pin -totpSecret -fcmTokens')
        .sort({ createdAt: -1 })
        .skip(skip).limit(Number(limit)),
      User.countDocuments(filter)
    ]);
    res.json({ success: true, total, page: Number(page), users });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-pin -totpSecret -fcmTokens');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const kyc = await Kyc.findOne({ user: user._id }).populate('user', 'email fullName accountNumber');
    const txs = await Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('user', 'email fullName accountNumber');
    res.json({ success: true, user, kyc, transactions: txs });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.adjustBalance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, currency, amount, note = '' } = req.body;
    const amt = Number(amount);
    if (!userId || !currency || !amt) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'userId, currency, amount required' });
    }
    if (!['usdt', 'ltc', 'nexa'].includes(currency)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid currency' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) { await session.abortTransaction(); return res.status(404).json({ success: false, message: 'Not found' }); }

    const before = currency === 'ltc' ? user.ltcBalance : user.balance;

    let newVal;
    if (currency === 'ltc') {
      newVal = (user.ltcBalance || 0) + amt;
      if (newVal < 0) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'LTC balance cannot go negative' });
      }
      user.ltcBalance = newVal;
    } else {
      newVal = (user.balance || 0) + amt;
      if (newVal < 0) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: 'Balance cannot go negative' });
      }
      user.balance = newVal;
    }
    await user.save({ session });

    await Transaction.create([{
      user: user._id,
      type: amt >= 0 ? 'deposit' : 'cashout',
      amount: Math.abs(amt),
      status: 'approved',
      trxId: 'ADMIN' + Date.now() + Math.floor(Math.random() * 9999),
      note: `Admin ${req.user.email} adjusted ${currency.toUpperCase()} by ${amt > 0 ? '+' : ''}${amt}${note ? ' — ' + note : ''}`,
      paymentMethodNumber: 'ADMIN'
    }], { session });

    await session.commitTransaction();

    try {
      await notificationService.notify(user._id, {
        title: amt >= 0 ? 'Balance Credited ✓' : 'Balance Debited',
        body: `${currency.toUpperCase()} ${amt >= 0 ? '+' : ''}${amt}${note ? ' — ' + note : ''}`,
        type: 'system',
        data: { screen: 'history' }
      });
    } catch (e) { console.log(e.message); }

    res.json({ success: true, message: 'Balance adjusted', before, after: newVal });
  } catch (e) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: e.message });
  } finally { session.endSession(); }
};

exports.setBan = async (req, res) => {
  try {
    const { userId, ban, reason } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isBanned = !!ban;
    user.banReason = ban ? (reason || 'Suspicious activity detected on your account.') : '';
    user.bannedAt = ban ? new Date() : null;
    user.bannedBy = ban ? req.user._id : null;
    await user.save();

    if (!ban) {
      try {
        await notificationService.notify(user._id, {
          title: 'Account Restored ✓',
          body: 'Your Nexa account has been restored. You can use it normally now.',
          type: 'system',
          data: { screen: 'home' }
        });
      } catch (e) { console.log(e.message); }
    }

    res.json({ success: true, message: ban ? 'User banned' : 'User unbanned', isBanned: user.isBanned });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.uid) {
      try { await admin.auth().deleteUser(user.uid); }
      catch (e) { console.log('Firebase delete note:', e.message); }
    }

    await Promise.all([
      Kyc.deleteMany({ user: user._id }),
      Transaction.deleteMany({ user: user._id }),
      Notification.deleteMany({ user: user._id }),
    ]);

    await User.findByIdAndDelete(user._id);

    res.json({ success: true, message: 'User deleted from Firebase & MongoDB' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.sendUserNotification = async (req, res) => {
  try {
    const { userId, title, body, type = 'system' } = req.body;
    if (!userId || !title || !body) {
      return res.status(400).json({ success: false, message: 'userId, title, body required' });
    }
    await notificationService.notify(userId, { title, body, type, data: { screen: 'home' } });
    res.json({ success: true, message: 'Notification sent' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
