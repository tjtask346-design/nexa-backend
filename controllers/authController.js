const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ১. Send Email OTP (Sign Up Step 1)
exports.sendEmailOtp = async (req, res) => {
    try {
        const { email } = req.body;
        let user = await User.findOne({ email });

        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
        const expires = Date.now() + 10 * 60 * 1000; // 10 minutes validity

        if (!user) {
            // Temporary dummy pin, will be updated in next step
            user = new User({ email, pin: '00000', emailOtp: otp, emailOtpExpires: expires });
        } else {
            user.emailOtp = otp;
            user.emailOtpExpires = expires;
        }
        
        await user.save();

        // TODO: In production, integrate Nodemailer here to send 'otp' to 'email'
        console.log(`[DEMO] Email OTP for ${email}: ${otp}`);

        res.status(200).json({ message: 'OTP sent to email successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ২. Verify Email OTP & Set PIN (Sign Up Step 2)
exports.verifyOtpAndRegister = async (req, res) => {
    try {
        const { email, otp, pin, firstName, lastName } = req.body;
        const user = await User.findOne({ email });

        if (!user || user.emailOtp !== otp || user.emailOtpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }
        if (pin.length !== 5) {
            return res.status(400).json({ message: 'PIN must be exactly 5 digits' });
        }

        user.firstName = firstName;
        user.lastName = lastName;
        user.pin = pin; // PIN will be hashed automatically by User.js pre-save hook
        user.emailOtp = undefined;
        user.emailOtpExpires = undefined;
        
        // Generate a mock LTC Address for the user
        user.ltcAddress = "ltc1qxl" + Date.now().toString() + "dummy";

        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: user._id, firstName, lastName, email, kycStatus: user.kycStatus } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ৩. Login with 5-Digit PIN
exports.login = async (req, res) => {
    try {
        const { email, pin } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(pin, user.pin);
        if (!isMatch) return res.status(400).json({ message: 'Invalid PIN' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { 
            id: user._id, 
            firstName: user.firstName, 
            lastName: user.lastName, 
            email, 
            uid: user.uid, 
            phone: user.phone, 
            balance: user.balance, 
            ltcBalance: user.ltcBalance, 
            kycStatus: user.kycStatus 
        }});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 8. Send WhatsApp OTP (For KYC & UID Generation)
exports.sendWhatsAppOtp = async (req, res) => {
    try {
        const { userId, phone } = req.body; // In real app, get userId from auth middleware
        const user = await User.findById(userId);
        
        if (!user) return res.status(404).json({ message: 'User not found' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.waOtp = otp;
        user.waOtpExpires = Date.now() + 10 * 60 * 1000;
        await user.save();

        // TODO: In production, integrate WhatsApp API (Twilio/MessageBird) here
        console.log(`[DEMO] WhatsApp OTP for ${phone}: ${otp}`);

        res.status(200).json({ message: 'OTP sent to WhatsApp' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 5. Verify WhatsApp OTP & Generate Custom UID
exports.verifyWhatsAppAndGenerateUID = async (req, res) => {
    try {
        const { userId, phone, otp } = req.body;
        const user = await User.findById(userId);

        if (!user || user.waOtp !== otp || user.waOtpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired WhatsApp OTP' });
        }

        // Logic: Strip the first 3 digits of the phone number (e.g., 017 72277956 -> 72277956)
        const newUid = phone.substring(3);
        
        // Ensure no one else already has this UID
        const existingUser = await User.findOne({ uid: newUid });
        if (existingUser) return res.status(400).json({ message: 'This number is already registered for another UID' });

        user.phone = phone;
        user.uid = newUid;
        user.kycStatus = 'verified';
        user.waOtp = undefined;
        user.waOtpExpires = undefined;
        await user.save();

        res.status(200).json({ message: 'Phone verified and UID generated successfully', uid: newUid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
