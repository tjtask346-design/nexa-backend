const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(express.json());

// MongoDB Connection (আপনার আসল MongoDB URI দিয়ে পরিবর্তন করুন)
mongoose.connect(process.env.MONGO_URI || 'YOUR_MONGODB_URI_HERE')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// User Schema Definition
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    identifier: { type: String, required: true, unique: true },
    pin: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const otpStore = new Map();
let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    sock = makeWASocket({ logger: pino({ level: 'silent' }), auth: state });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Baileys Connected!');
        }
    });
}
connectToWhatsApp();

// Send OTP
app.post('/send-otp', async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier) return res.status(400).json({ success: false, message: 'ইমেইল বা নম্বর দিন' });

        let formattedPhone = identifier.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) formattedPhone = '88' + formattedPhone;

        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore.set(identifier, { otp: generatedOtp, expiresAt: Date.now() + 5 * 60 * 1000 });

        await sock.sendMessage(`${formattedPhone}@s.whatsapp.net`, {
            text: `আপনার Nexa Wallet OTP: *${generatedOtp}* (মেয়াদ ৫ মিনিট)।`
        });

        return res.json({ success: true, message: 'WhatsApp-এ OTP পাঠানো হয়েছে' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'OTP পাঠাতে ব্যর্থ হয়েছে' });
    }
});

// Verify OTP & Complete Registration
app.post('/verify-otp', async (req, res) => {
    try {
        const { fullName, identifier, otp, pin } = req.body;
        const storedData = otpStore.get(identifier);

        if (!storedData) return res.status(400).json({ success: false, message: 'OTP অনুরোধ পাওয়া যায়নি' });
        if (Date.now() > storedData.expiresAt) {
            otpStore.delete(identifier);
            return res.status(400).json({ success: false, message: 'OTP-এর মেয়াদ শেষ' });
        }
        if (storedData.otp !== otp) return res.status(400).json({ success: false, message: 'ভুল OTP' });

        otpStore.delete(identifier);

        // PIN Encrypt & Save User
        const hashedPin = await bcrypt.hash(pin, 10);
        let user = await User.findOne({ identifier });
        
        if (user) {
            return res.status(400).json({ success: false, message: 'ইউজার ইতিমধ্যে নিবন্ধিত' });
        }

        user = new User({ fullName, identifier, pin: hashedPin });
        await user.save();

        // Generate JWT Token
        const token = jwt.sign({ userId: user._id, identifier: user.identifier }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '7d' });

        return res.json({ success: true, message: 'রেজিস্ট্রেশন সম্পূর্ণ হয়েছে!', token, user: { id: user._id, fullName: user.fullName } });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'সার্ভার এরর' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
        }

        user = new User({ fullName, identifier, pin: hashedPin });
        await user.save();

        const token = jwt.sign({ userId: user._id, identifier: user.identifier }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '7d' });

        return res.json({ success: true, message: 'রেজিস্ট্রেশন সম্পূর্ণ হয়েছে!', token, user: { id: user._id, fullName: user.fullName } });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'সার্ভার এরর' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
