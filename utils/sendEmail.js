const nodemailer = require('nodemailer');

const sendOTPEmail = async (email, otp) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[DEV OTP LOG] Code for ${email} is: ${otp}`);
        return;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    await transporter.sendMail({
        from: '"NEXA Wallet" <no-reply@nexa.com>',
        to: email,
        subject: 'NEXA — Verification Code',
        html: `
            <div style="background:#030806; color:#f2fff7; padding:25px; font-family:sans-serif; border-radius:16px; border:1px solid rgba(57,255,136,0.2);">
                <h2 style="color:#39ff88; margin-bottom:8px;">NEXA Wallet</h2>
                <p style="color:#7f9889;">আপনার অ্যাকাউন্ট ভেরিফিকেশনের জন্য নিচের ৬ ডিজিটের OTP কোডটি ব্যবহার করুন:</p>
                <div style="background:#0a1810; border:1px solid rgba(57,255,136,0.4); color:#39ff88; font-size:32px; font-weight:bold; letter-spacing:8px; padding:15px; text-align:center; border-radius:12px; margin:20px 0;">
                    ${otp}
                </div>
                <p style="color:#7f9889; font-size:12px;">এই কোডের মেয়াদ ৫ মিনিট। এটি কাউকে দেখাবেন না।</p>
            </div>
        `
    });
};

module.exports = sendOTPEmail;
