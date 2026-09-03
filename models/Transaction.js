const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { 
        type: String, 
        enum: ['P2P_TRANSFER', 'BKASH_DEPOSIT', 'BKASH_WITHDRAW'], 
        required: true 
    },
    amountUSD: { type: Number, required: true },
    amountBDT: { type: Number, default: 0 },
    bkashTrxId: { type: String }, // bKash ডিপোজিটের ট্রানজেকশন আইডি
    bkashNumber: { type: String }, // উইথড্র বা ডিপোজিট নম্বর
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'rejected'], 
        default: 'completed' 
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);
