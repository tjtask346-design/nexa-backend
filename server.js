const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(express.json());

// 1. WhatsApp Bot Number Configuration
const BOT_PHONE_NUMBER = "380778774165"; 

// 2. MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'YOUR_MONGODB_URI_HERE')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// 3. User Schema
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    identifier: { type: String, required: true, unique: true },
    pin: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const otpStore = new Map();
let sock;

// 4. WhatsApp Baileys Connection with Pairing Code
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["Nexa Wallet Bot", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const pairingCode = await sock.requestPairingCode(BOT_PHONE_NUMBER);
                
                console.log('\n=========================================');
                console.log(`🔑 আপনার WhatsApp Pairing Code: ${pairingCode}`);
                console.log('=========================================\n');
            } catch (err) {
                console.error('Pairing Code আনতে সমস্যা হয়েছে:', err);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Baileys সফলভাবে কানেক্ট হয়েছে!');
        }
    });
}

connectToWhatsApp();

// 5. Send OTP Endpoint
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

// 6. Verify OTP & Register Endpoint
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

        const hashedPin = await bcrypt.hash(pin, 10);
        let user = await User.findOne({ identifier });
        
        if (user) {
            return res.status(400).json({ success: false, message: 'ইউজার ইতিমধ্যে নিবন্ধিত' });
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
