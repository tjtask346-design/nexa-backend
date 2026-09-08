const User = require('../models/User'); // আপনার User model path অনুযায়ী মিলিয়ে নিন
const bcrypt = require('bcryptjs');

exports.register = async (req, res) => {
    try {
        // ১. সার্ভার টার্মিনালে অ্যাপ থেকে আসা ডাটা দেখার জন্য লগ
        console.log("Received Register Body:", req.body);

        // ২. অ্যাপ থেকে যে নামেই আসুক তা গ্রহণ করা (Flexibility)
        const fullName = req.body.fullName || req.body.name;
        const identifier = req.body.identifier || req.body.email || req.body.phone;
        const pin = req.body.pin || req.body.password;

        // ৩. ভ্যালিডেশন চেক
        if (!fullName || !identifier || !pin) {
            return res.status(400).json({
                success: false,
                message: "সব তথ্য প্রদান করুন"
            });
        }

        // ৪. ইউজার ইতিমধ্যে আছে কিনা চেক
        const existingUser = await User.findOne({ identifier });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "এই ইমেইল বা ফোন নম্বরটি ইতিমধ্যে ব্যবহৃত হয়েছে"
            });
        }

        // ৫. পিন হ্যাশ করা
        const salt = await bcrypt.genSalt(10);
        const hashedPin = await bcrypt.hash(pin, salt);

        // ৬. ডাটাবেজে সেভ করা
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
