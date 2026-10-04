const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['deposit', 'transfer', 'cashout'], required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    senderUid: { type: String },
    receiverUid: { type: String },
    trxId: { type: String, unique: true, sparse: true },
    paymentMethodNumber: { type: String },

    // ═══ NEW fields (used by admin controller) ═══
    adminNote: { type: String, default: '' },
    note:      { type: String, default: '' },
}, { timestamps: true });

transactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
