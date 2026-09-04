const Transaction = require('../models/Transaction');
const User = require('../models/User');

exports.approveDeposit = async (req, res) => {
    try {
        const { transactionId } = req.body;
        const transaction = await Transaction.findById(transactionId).populate('user');
        
        if (!transaction || transaction.type !== 'deposit') return res.status(404).json({ message: 'Deposit transaction not found' });
        if (transaction.status === 'approved') return res.status(400).json({ message: 'Already approved' });

        transaction.status = 'approved';
        await transaction.save();

        // Add money to user balance
        const user = await User.findById(transaction.user._id);
        user.balance += transaction.amount;
        await user.save();

        res.json({ message: 'Deposit approved successfully', userBalance: user.balance });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.approveCashOut = async (req, res) => {
    try {
        const { transactionId, status } = req.body; // status can be 'approved' or 'rejected'
        const transaction = await Transaction.findById(transactionId).populate('user');

        if (!transaction || transaction.type !== 'cashout') return res.status(404).json({ message: 'Cashout transaction not found' });
        if (transaction.status !== 'pending') return res.status(400).json({ message: 'Transaction already processed' });

        transaction.status = status;
        await transaction.save();

        if (status === 'rejected') {
            // Refund the deducted amount if admin rejects
            const user = await User.findById(transaction.user._id);
            user.balance += transaction.amount;
            await user.save();
        }

        res.json({ message: `Cashout request ${status}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
