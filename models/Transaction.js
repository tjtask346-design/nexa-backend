const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { 
        type: String, 
        enum: ['deposit', 'transfer', 'cashout'], 
        required: true 
    },
    amount: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending' 
    },
    senderUid: { type: String }, // For transfer
    receiverUid: { type: String }, // For transfer
    trxId: { type: String }, // bKash/Nagad Transaction ID for deposit
    paymentMethodNumber: { type: String }, // bKash number for cashout
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
