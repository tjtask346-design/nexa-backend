const admin = require('../firebaseAdmin');
const User = require('../models/User');
const Notification = require('../models/Notification');

/**
 * Send a notification to a user.
 * Saves in-app notification + sends FCM push to all devices.
 */
exports.notify = async (userId, { title, body, type, data = {} }) => {
    try {
        // 1. Save in-app notification
        await Notification.create({ user: userId, title, body, type, data });

        // 2. Get user's FCM tokens
        const user = await User.findById(userId).select('fcmTokens');
        if (!user || !user.fcmTokens || user.fcmTokens.length === 0) return;

        // 3. Prepare FCM payload
        // FCM data values must be strings
        const stringData = {};
        Object.entries(data).forEach(([k, v]) => {
            stringData[k] = String(v);
        });
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

        // 4. Send
        const resp = await admin.messaging().sendEachForMulticast(message);

        // 5. Clean invalid tokens
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
            await User.findByIdAndUpdate(userId, {
                $pull: { fcmTokens: { $in: invalidTokens } }
            });
            console.log(`🧹 Cleaned ${invalidTokens.length} invalid FCM tokens`);
        }

        console.log(`🔔 Notification sent to ${userId}: ${title}`);
    } catch (e) {
        console.error('Notification error:', e.message);
    }
};
