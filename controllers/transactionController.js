const User = require('../models/User');
const Transaction = require('../models/Transaction');

// ১. P2P USD Transfer (Internal Transfer)
exports.transferP2P = async (req, res) => {
    try {
        const { receiverAccountNumber, amountUSD } = req.body;
        const senderId = req.user.id;

        if (amountUSD <= 0) {
            return res.status(400).json({ success: false, message: 'সঠিক পরিমাণ প্রদান করুন!' });
        }

        const sender = await User.findById(senderId);
        const receiver = await User.findOne({ accountNumber: receiverAccountNumber });

        if (!receiver) {
            return res.status(404).json({ success: false, message: 'গ্রাহকের অ্যাকাউন্ট পাওয়া যায়নি!' });
        }

        if (sender.accountNumber === receiverAccountNumber) {
            return res.status(400).json({ success: false, message: 'নিজের অ্যাকাউন্টে ট্রান্সফার সম্ভব নয়!' });
        }

        if (sender.balanceUSD < amountUSD) {
            return res.status(400).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });
        }

        // ব্যালেন্স আপডেট
        sender.balanceUSD -= Number(amountUSD);
        receiver.balanceUSD += Number(amountUSD);

        await sender.save();
        await receiver.save();

        // ট্রানজেকশন রেকর্ড
        const transaction = new Transaction({
            sender: sender._id,
            receiver: receiver._id,
            type: 'P2P_TRANSFER',
            amountUSD,
            status: 'completed'
        });

        await transaction.save();

        res.json({ success: true, message: 'ট্রান্সফার সফল হয়েছে!', transaction });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ২. bKash Deposit Request (Admin Verification Pending)
exports.depositBkash = async (req, res) => {
    try {
        const { amountBDT, amountUSD, bkashTrxId, bkashNumber } = req.body;

        const transaction = new Transaction({
            sender: req.user.id,
            type: 'BKASH_DEPOSIT',
            amountBDT,
            amountUSD,
            bkashTrxId,
            bkashNumber,
            status: 'pending' // অ্যাডমিন অ্যাপ্রুভালের জন্য ওয়েট করবে
        });

        await transaction.save();

        res.status(201).json({ 
            success: true, 
            message: 'ডিপোজিট রিকোয়েস্ট জমা হয়েছে! অ্যাডমিন ভেরিফাই করলে ব্যালেন্স যোগ হবে।', 
            transaction 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ৩. bKash Withdraw Request
exports.withdrawBkash = async (req, res) => {
    try {
        const { amountUSD, amountBDT, bkashNumber } = req.body;
        const user = await User.findById(req.user.id);

        if (user.balanceUSD < amountUSD) {
            return res.status(400).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });
        }

        const transaction = new Transaction({
            sender: req.user.id,
            type: 'BKASH_WITHDRAW',
            amountUSD,
            amountBDT,
            bkashNumber,
            status: 'pending'
        });

        await transaction.save();

        res.status(201).json({ 
            success: true, 
            message: 'উইথড্র রিকোয়েস্ট সফল হয়েছে! অ্যাডমিন প্রসেস করবে।', 
            transaction 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
