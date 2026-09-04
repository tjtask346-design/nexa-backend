const Transaction = require('../models/Transaction');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// 1. Request Deposit (Cash-in)
exports.requestDeposit = async (req, res) => {
    try {
        const { amount, trxId } = req.body;
        
        // Check if TrxID already used
        const existingTrx = await Transaction.findOne({ trxId });
        if (existingTrx) return res.status(400).json({ message: 'Transaction ID already used' });

        const transaction = new Transaction({
            user: req.user.id,
            type: 'deposit',
            amount,
            trxId,
            status: 'pending'
        });
        await transaction.save();
        res.status(201).json({ message: 'Deposit request submitted successfully. Under review.', transaction });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. Resolve UID for Trust Factor (Show name before sending money)
exports.resolveUid = async (req, res) => {
    try {
        const { uid } = req.params;
        const user = await User.findOne({ uid }).select('name uid');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. Send Money (P2P Transfer)
exports.sendMoney = async (req, res) => {
    try {
        const { receiverUid, amount, pin } = req.body;
        const sender = await User.findById(req.user.id);
        const receiver = await User.findOne({ uid: receiverUid });

        if (!receiver) return res.status(404).json({ message: 'Receiver not found' });
        if (sender.uid === receiverUid) return res.status(400).json({ message: 'Cannot send money to yourself' });
        if (sender.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });

        // Verify PIN
        const isPinValid = await bcrypt.compare(pin, sender.pin);
        if (!isPinValid) return res.status(400).json({ message: 'Invalid PIN' });

        // Deduct from sender, add to receiver
        sender.balance -= amount;
        receiver.balance += amount;

        await sender.save();
        await receiver.save();

        // Record Transaction
        const transaction = new Transaction({
            user: sender._id,
            type: 'transfer',
            amount,
            senderUid: sender.uid,
            receiverUid: receiver.uid,
            status: 'approved' // Instant approval for P2P
        });
        await transaction.save();

        res.json({ message: 'Transfer successful', transaction, newBalance: sender.balance });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4. Request Cashout
exports.requestCashOut = async (req, res) => {
    try {
        const { amount, paymentMethodNumber, pin } = req.body;
        const user = await User.findById(req.user.id);

        if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });

        // Verify PIN
        const isPinValid = await bcrypt.compare(pin, user.pin);
        if (!isPinValid) return res.status(400).json({ message: 'Invalid PIN' });

        // Deduct balance immediately for pending request
        user.balance -= amount;
        await user.save();

        const transaction = new Transaction({
            user: user._id,
            type: 'cashout',
            amount,
            paymentMethodNumber,
            status: 'pending'
        });
        await transaction.save();

        res.status(201).json({ message: 'Cashout request submitted. Admin will process it shortly.', newBalance: user.balance });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
