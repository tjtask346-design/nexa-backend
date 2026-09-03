const Transaction = require('../models/Transaction');
const User = require('../models/User');

// প্যান্ডিং ডিপোজিট/উইথড্র রিকোয়েস্ট দেখার জন্য
exports.getPendingTransactions = async (req, res) => {
    try {
        const pending = await Transaction.find({ status: 'pending' }).populate('sender', 'fullName phone accountNumber');
        res.json({ success: true, pending });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ডিপোজিট বা উইথড্র রিকোয়েস্ট অ্যাপ্রুভ/রিজেক্ট করা
exports.processTransaction = async (req, res) => {
    try {
        const { transactionId, status } = req.body; // status: 'completed' or 'rejected'
        const trx = await Transaction.findById(transactionId);

        if (!trx || trx.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'রিকোয়েস্টটি পাওয়া যায়নি বা প্রসেস করা হয়ে গেছে!' });
        }

        if (status === 'completed') {
            const user = await User.findById(trx.sender);

            if (trx.type === 'BKASH_DEPOSIT') {
                user.balanceUSD += Number(trx.amountUSD);
            } else if (trx.type === 'BKASH_WITHDRAW') {
                if (user.balanceUSD < trx.amountUSD) {
                    return res.status(400).json({ success: false, message: 'ইউজারের পর্যাপ্ত ব্যালেন্স নেই!' });
                }
                user.balanceUSD -= Number(trx.amountUSD);
            }

            await user.save();
            trx.status = 'completed';
        } else if (status === 'rejected') {
            trx.status = 'rejected';
        } else {
            return res.status(400).json({ success: false, message: 'অকার্যকর স্ট্যাটাস!' });
        }

        await trx.save();
        res.json({ success: true, message: `ট্রানজেকশনটি ${status === 'completed' ? 'অনুমোদিত (Approved)' : 'বাতিল (Rejected)'} করা হয়েছে।` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
