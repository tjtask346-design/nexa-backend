const AppVersion = require('../models/AppVersion');

/* ═══════════════════════════════════════════════════════════
   PUBLIC — App checks version on startup
   ═══════════════════════════════════════════════════════════ */
exports.checkVersion = async (req, res) => {
    try {
        const app = req.query.app === 'admin' ? 'admin' : 'user';

        let config = await AppVersion.findOne({ app });
        if (!config) {
            config = await AppVersion.create({
                app,
                latestVersion: 1,
                latestVersionName: '1.0.0',
                minVersion: 1,
                forceUpdate: false,
                updateUrl: '',
                releaseNotes: 'Welcome to Nexa'
            });
        }

        res.json({
            success: true,
            latestVersion: config.latestVersion,
            latestVersionName: config.latestVersionName,
            minVersion: config.minVersion,
            forceUpdate: config.forceUpdate,
            updateUrl: config.updateUrl,
            releaseNotes: config.releaseNotes,
            publishedAt: config.publishedAt
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

/* ═══════════════════════════════════════════════════════════
   ADMIN — Get current config
   ═══════════════════════════════════════════════════════════ */
exports.getVersionConfig = async (req, res) => {
    try {
        const app = req.query.app === 'admin' ? 'admin' : 'user';
        let config = await AppVersion.findOne({ app });
        if (!config) {
            config = await AppVersion.create({ app });
        }
        res.json({ success: true, config });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

/* ═══════════════════════════════════════════════════════════
   ADMIN — Update version config
   ═══════════════════════════════════════════════════════════ */
exports.updateVersionConfig = async (req, res) => {
    try {
        const {
            app = 'user',
            latestVersion,
            latestVersionName,
            minVersion,
            forceUpdate,
            updateUrl,
            releaseNotes
        } = req.body;

        if (!['user', 'admin'].includes(app)) {
            return res.status(400).json({ success: false, message: 'Invalid app' });
        }

        const updates = {};
        if (latestVersion !== undefined) updates.latestVersion = Number(latestVersion);
        if (latestVersionName !== undefined) updates.latestVersionName = String(latestVersionName);
        if (minVersion !== undefined) updates.minVersion = Number(minVersion);
        if (forceUpdate !== undefined) updates.forceUpdate = !!forceUpdate;
        if (updateUrl !== undefined) updates.updateUrl = String(updateUrl);
        if (releaseNotes !== undefined) updates.releaseNotes = String(releaseNotes);

        updates.publishedAt = new Date();
        updates.publishedBy = req.user._id;

        const config = await AppVersion.findOneAndUpdate(
            { app },
            { $set: updates },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json({ success: true, message: 'Version config updated', config });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};
