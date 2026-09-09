const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(express.json());

// OTP অস্থায়ীভাবে জমা রাখার মেমোরি (৫ মিনিটের জন্য)
const otpStore = new Map();

let sock;

// WhatsApp সকেট কানেকশন ফাংশন
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n--- Render Logs-এ নিচে আসা QR Code-টি আপনার WhatsApp দিয়ে স্ক্যান করুন ---\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('WhatsApp কানেকশন বিচ্ছিন্ন হয়েছে। পুনারায় কানেক্ট করা হচ্ছে...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp-এর সাথে ব্যাকএন্ড সফলভাবে কানেক্ট হয়েছে!');
        }
    });
}

connectToWhatsApp();

// ১. Send OTP Endpoint (Retrofit Client-এর সাথে ১০০% ম্যাচ করা)
app.post('/send-otp', async (req, res) => {
    try {
        const { identifier } = req.body;

        if (!identifier) {
            return res.status(400).json({ success: false, message: 'ইমেইল বা ফোন নম্বর দিন' });
        }

        // ফোন নম্বর থেকে চিহ্ন বাদ দিয়ে বাংলাদেশ কোড (880) নিশ্চিত করা
        let formattedPhone = identifier.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '88' + formattedPhone;
        }

        // ৬ ডিজিটের র‍্যান্ডম OTP জেনারেট
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

        // ৫ মিনিটের মেয়াদ দিয়ে OTP সেভ রাখা
        otpStore.set(identifier, {
            otp: generatedOtp,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        // WhatsApp এ মেসেজ পাঠানো
        const jid = `${formattedPhone}@s.whatsapp.net`;
        await sock.sendMessage(jid, {
            text: `আপনার Nexa Wallet ভেরিফিকেশন কোড (OTP): *${generatedOtp}*\nএটি ৩ মিনিটের মধ্যে ব্যবহার করুন। কারো সাথে শেয়ার করবেন না।`
        });

        return res.json({ success: true, message: 'WhatsApp-এ OTP পাঠানো হয়েছে' });
    } catch (error) {
        console.error('Send OTP Error:', error);
        return res.status(500).json({ success: false, message: 'WhatsApp-এ OTP পাঠাতে ব্যর্থ হয়েছে। নম্বর সঠিক কিনা তা পরীক্ষা করুন।' });
    }
});

// ২. Verify OTP & Register Endpoint
app.post('/verify-otp', async (req, res) => {
    try {
        const { fullName, identifier, otp, pin } = req.body;

        const storedData = otpStore.get(identifier);

        if (!storedData) {
            return res.status(400).json({ success: false, message: 'কোনো OTP অনুরোধ পাওয়া যায়নি' });
        }

        if (Date.now() > storedData.expiresAt) {
            otpStore.delete(identifier);
            return res.status(400).json({ success: false, message: 'OTP-এর মেয়াদ শেষ হয়ে গেছে' });
        }

        if (storedData.otp !== otp) {
            return res.status(400).json({ success: false, message: 'ভুল OTP প্রদান করেছেন' });
        }

        // ভেরিফিকেশন সফল হলে OTP মেমোরি থেকে মুছে দেওয়া
        otpStore.delete(identifier);

        // এখানে আপনার ডাটাবেজে (MongoDB / PostgreSQL) ইউজার সেভ করার লজিক বসবে

        return res.json({ success: true, message: 'রেজিস্ট্রেশন সম্পূর্ণ হয়েছে!' });
    } catch (error) {
        console.error('Verify OTP Error:', error);
        return res.status(500).json({ success: false, message: 'ভেরিফিকেশন ব্যর্থ হয়েছে' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
