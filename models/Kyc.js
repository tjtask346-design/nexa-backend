const mongoose = require('mongoose');

const kycSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    nidNumber: { type: String, required: true },
    frontUrl: { type: String, required: true },
    backUrl: { type: String, required: true },
    selfieUrl: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    adminNote: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Kyc', kycSchema);
