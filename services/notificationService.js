const admin = require('../firebaseAdmin');
const User = require('../models/User');
const Notification = require('../models/Notification');

exports.notify = async (userId, { title, body, type, data = {} }) => {
    try {
        await Notification.create({ user: userId, title, body, type, data });

        const user = await User.findById(userId).select('fcmTokens');
        if (!user || !user.fcmTokens || user.fcmTokens.length === 0) return;

        const stringData = {};
        Object.entries(data).forEach(([k, v]) => { stringData[k] = String(v); });
        stringData.type = type;
        stringData.title = title;
        stringData.body = body;

        const message = {
            notification: { title, body },
            data: stringData,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'nexa_default',
                    sound: 'default',
                    clickAction: 'OPEN_MAIN'
                }
            },
            tokens: user.fcmTokens
        };

        const resp = await admin.messaging().sendEachForMulticast(message);

        const invalidTokens = [];
        resp.responses.forEach((r, i) => {
            if (!r.success) {
                const code = (r.error && r.error.code) || '';
                if (
                    code.includes('registration-token-not-registered') ||
                    code.includes('invalid-argument') ||
                    code.includes('invalid-registration-token')
                ) {
                    invalidTokens.push(user.fcmTokens[i]);
                }
            }
        });

        if (invalidTokens.length) {
            await User.findByIdAndUpdate(userId, { $pull: { fcmTokens: { $in: invalidTokens } } });
        }

        console.log(`🔔 Notification sent to ${userId}: ${title}`);
    } catch (e) {
        console.error('Notification error:', e.message);
    }
};

// ═══ NEW: Notify all admins (KYC/deposit/cashout submitted) ═══
exports.notifyAllAdmins = async ({ title, body, type = 'system', data = {} }) => {
    try {
        const admins = await User.find({ role: 'admin', isBanned: false }).select('_id');
        if (!admins.length) return;
        await Promise.all(
            admins.map(a => exports.notify(a._id, { title, body, type, data }))
        );
        console.log(`🔔 Notified ${admins.length} admin(s): ${title}`);
    } catch (e) {
        console.log('notifyAllAdmins error:', e.message);
    }
};
