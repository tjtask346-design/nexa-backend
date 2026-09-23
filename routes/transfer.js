const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');

router.post('/', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { receiverAccount, amount, pin } = req.body;
    const transferAmount = parseFloat(amount);

    if (!receiverAccount || isNaN(transferAmount) || transferAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ ও গ্রহীতার তথ্য দিন!' });
    }

    const sender = await User.findById(req.user._id).session(session);
    const ok = await bcrypt.compare(pin, sender.pin);
    if (!ok) {
      await session.abortTransaction();
      return res.status(401).json({ success: false, message: 'ভুল PIN' });
    }

    if (sender.balance < transferAmount) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });
    }

    const receiver = await User.findOne({
      $or: [{ accountNumber: receiverAccount }, { email: receiverAccount.toLowerCase() }, { uid: receiverAccount }]
    }).session(session);

    if (!receiver) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'প্রাপক অ্যাকাউন্ট পাওয়া যায়নি!' });
    }
    if (receiver._id.toString() === sender._id.toString()) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'নিজের অ্যাকাউন্টে ট্রান্সফার সম্ভব নয়!' });
    }

    sender.balance -= transferAmount;
    receiver.balance += transferAmount;

    await sender.save({ session });
    await receiver.save({ session });

    const trx = await Transaction.create([{
      user: sender._id,
      type: 'transfer',
      amount: transferAmount,
      status: 'approved',
      senderUid: sender.uid,
      receiverUid: receiver.uid,
      trxId: 'TRX' + Date.now()
    }], { session });

    await session.commitTransaction();
    res.json({ success: true, message: 'ট্রান্সফার সফল হয়েছে!', transaction: trx[0], newBalance: sender.balance });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
});

module.exports = router;
