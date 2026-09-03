const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/', async (req, res) => {
    try {
        const { senderPhone, receiverAccount, amount } = req.body;
        const transferAmount = parseFloat(amount);

        if (!senderPhone || !receiverAccount || isNaN(transferAmount) || transferAmount <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ ও গ্রহীতার তথ্য দিন!' });
        }

        const sender = await User.findOne({ phone: senderPhone });
        const receiver = await User.findOne({ $or: [{ accountNumber: receiverAccount }, { phone: receiverAccount }] });

        if (!sender) return res.status(404).json({ success: false, message: 'প্রেরক পাওয়া যায়নি!' });
        if (!receiver) return res.status(404).json({ success: false, message: 'প্রাপক অ্যাকাউন্ট পাওয়া যায়নি!' });
        if (sender.phone === receiver.phone) return res.status(400).json({ success: false, message: 'নিজের অ্যাকাউন্টে ট্রান্সফার সম্ভব নয়!' });
        if (sender.balanceUSD < transferAmount) return res.status(400).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });

        sender.balanceUSD -= transferAmount;
        receiver.balanceUSD += transferAmount;

        await sender.save();
        await receiver.save();

        res.json({ success: true, message: 'ট্রান্সফার সফল হয়েছে!', senderBalance: sender.balanceUSD });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ট্রান্সফার ব্যর্থ হয়েছে!' });
    }
});

module.exports = router;

