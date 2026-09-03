module.exports = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'অ্যাক্সেস ডিনাইড! শুধুমাত্র অ্যাডমিন এটি ব্যবহার করতে পারবে।' });
    }
};
