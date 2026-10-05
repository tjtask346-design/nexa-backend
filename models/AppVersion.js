const mongoose = require('mongoose');

const appVersionSchema = new mongoose.Schema({
    app: {
        type: String,
        enum: ['user', 'admin'],
        required: true,
        unique: true
    },
    latestVersion: { type: Number, default: 1 },
    latestVersionName: { type: String, default: '1.0.0' },
    minVersion: { type: Number, default: 1 },
    forceUpdate: { type: Boolean, default: false },
    updateUrl: { type: String, default: '' },
    releaseNotes: { type: String, default: '' },
    publishedAt: { type: Date, default: Date.now },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('AppVersion', appVersionSchema);
