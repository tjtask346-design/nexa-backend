const admin = require('../firebaseAdmin');
const User = require('../models/User');
const Notification = require('../models/Notification');

/* ═══════════════════════════════════════════════════════════
   SEND NOTIFICATION TO A REGULAR USER (Nexa user app)
   ═══════════════════════════════════════════════════════════ */
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
            await User.findByIdAndUpdate(userId, {
                $pull: { fcmTokens: { $in: invalidTokens } }
            });
        }

        console.log(`🔔 User notification → ${userId}: ${title}`);
    } catch (e) {
        console.error('notify error:', e.message);
    }
};

/* ═══════════════════════════════════════════════════════════
   SEND NOTIFICATION TO ALL ADMINS (Nexa Admin app ONLY)
   Uses adminFcmTokens — user app will NOT receive these.
   ═══════════════════════════════════════════════════════════ */
exports.notifyAllAdmins = async ({ title, body, type = 'system', data = {} }) => {
    try {
        const admins = await User.find({ role: 'admin', isBanned: false })
            .select('_id adminFcmTokens');

        if (!admins.length) return;

        for (const adminUser of admins) {
            // Save in-app notification for admin
            try {
                await Notification.create({
                    user: adminUser._id,
                    title, body, type, data
                });
            } catch (_) { /* ignore */ }

            // Send FCM only to admin app tokens
            if (!adminUser.adminFcmTokens || adminUser.adminFcmTokens.length === 0) {
                continue;
            }

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
                        channelId: 'nexa_admin_alerts',
                        sound: 'default',
                        clickAction: 'OPEN_MAIN'
                    }
                },
                tokens: adminUser.adminFcmTokens
            };

            try {
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
                            invalidTokens.push(adminUser.adminFcmTokens[i]);
                        }
                    }
                });

                if (invalidTokens.length) {
                    await User.findByIdAndUpdate(adminUser._id, {
                        $pull: { adminFcmTokens: { $in: invalidTokens } }
                    });
                }
            } catch (e) {
                console.log('Admin FCM error:', e.message);
            }
        }

        console.log(`🔔 Notified ${admins.length} admin(s): ${title}`);
    } catch (e) {
        console.log('notifyAllAdmins error:', e.message);
    }
};
