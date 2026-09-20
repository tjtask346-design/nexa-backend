const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) {
    console.warn('⚠️ SMTP not configured - emails disabled');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
};

/**
 * @param {{to:string, subject:string, text:string, html?:string}} opts
 */
const sendEmail = async (opts) => {
  const t = getTransporter();
  if (!t) return { skipped: true };
  
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const info = await t.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html || `<p>${opts.text}</p>`
  });
  console.log('📧 Email sent:', info.messageId);
  return info;
};

module.exports = sendEmail;
