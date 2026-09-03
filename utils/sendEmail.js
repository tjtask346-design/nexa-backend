const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        connectionTimeout: 10000, // ১০ সেকেন্ডের বেশি ঝুলে থাকবে না
        greetingTimeout: 10000,
        socketTimeout: 10000
    });

    const mailOptions = {
        from: `"NEXA Wallet" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        html: options.html
    };

    return await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
