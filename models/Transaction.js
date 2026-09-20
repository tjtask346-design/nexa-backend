const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['deposit','transfer','cashout'], required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
    senderUid: { type: String }, 
    receiverUid: { type: String },
    trxId: { type: String, sparse: true, unique: true },
    paymentMethodNumber: { type: String },
    // For audit
    note: { type: String },
    adminNote: { type: String },
}, { timestamps: true });

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
