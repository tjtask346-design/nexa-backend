const Notification = require('../models/Notification');

exports.getMyNotifications = async (req, res) => {
    try {
        const list = await Notification.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(100);
        const unread = await Notification.countDocuments({ user: req.user._id, read: false });
        res.json({ success: true, notifications: list, unread });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.markOneRead = async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.updateOne({ _id: id, user: req.user._id }, { read: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.markAllRead = async (req, res) => {
    try {
        await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.deleteOne = async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.deleteOne({ _id: id, user: req.user._id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.deleteAll = async (req, res) => {
    try {
        await Notification.deleteMany({ user: req.user._id });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
