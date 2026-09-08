const User = require('../models/User'); // আপনার User model path অনুযায়ী মিলিয়ে নেবেন
const bcrypt = require('bcryptjs');

// ১. রেজিস্ট্রেশন এপিআই (POST /api/auth/register)
exports.register = async (req, res) => {
    try {
        const { fullName, identifier, pin } = req.body;

        // তথ্য চেক করা
        if (!fullName || !identifier || !pin) {
            return res.status(400).json({
                success: false,
                message: "সব তথ্য প্রদান করুন"
            });
        }

        if (pin.length !== 5) {
            return res.status(400).json({
                success: false,
                message: "পিন অবশ্যই ৫ ডিজিটের হতে হবে"
            });
        }

        // ইমেইল/ফোন নম্বরটি আগে থেকে আছে কিনা দেখা
        const existingUser = await User.findOne({ identifier });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "এই ইমেইল বা ফোন নম্বরটি ইতিমধ্যে নিবন্ধিত"
            });
        }

        // পিন এনক্রিপ্ট/হ্যাশ করা (নিরাপত্তার জন্য)
        const salt = await bcrypt.genSalt(10);
        const hashedPin = await bcrypt.hash(pin, salt);

        // নতুন ইউজার ডাটাবেজে সংরক্ষণ
        const newUser = new User({
            fullName,
            identifier,
            pin: hashedPin
        });

        await newUser.save();

        return res.status(201).json({
            success: true,
            message: "রেজিস্ট্রেশন সফল হয়েছে!"
        });

    } catch (error) {
        console.error("Register Error:", error);
        return res.status(500).json({
            success: false,
            message: "সার্ভার এরর, আবার চেষ্টা করুন"
        });
    }
};

// ২. লগইন এপিআই (POST /api/auth/login)
exports.login = async (req, res) => {
    try {
        const { identifier, pin } = req.body;

        if (!identifier || !pin) {
            return res.status(400).json({
                success: false,
                message: "ইমেইল/ফোন এবং পিন প্রদান করুন"
            });
        }

        // ইউজার খোঁজা
        const user = await User.findOne({ identifier });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "অ্যাকাউন্ট খুঁজে পাওয়া যায়নি"
            });
        }

        // পিন যাচাই করা
        const isMatch = await bcrypt.compare(pin, user.pin);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "ভুল পিন দিয়েছেন"
            });
        }

        return res.status(200).json({
            success: true,
            message: "লগইন সফল হয়েছে!",
            user: {
                id: user._id,
                fullName: user.fullName,
                identifier: user.identifier
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({
            success: false,
            message: "সার্ভার এরর, আবার চেষ্টা করুন"
        });
    }
};
