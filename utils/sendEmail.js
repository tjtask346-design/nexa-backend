const sendEmail = async (options) => {
    // নতুন গুগল অ্যাপস স্ক্রিপ্ট Web App URL
    const scriptUrl = process.env.GMAIL_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwKa89wRLmE47Aos9sbOLj9FTeQL_xsuEOtyiKeG2UmIuK_j4sC7AtfSvbGepKnCz5dzQ/exec';

    try {
        const response = await fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            redirect: 'follow',
            body: JSON.stringify({
                to: options.email,
                subject: options.subject,
                html: options.html
            })
        });

        const text = await response.text();

        // গুগল থেকে লগইন পেজ বা কোনো HTML রেসপন্স আসলে
        if (text.trim().startsWith('<')) {
            throw new Error("Google Apps Script-এর Access 'Anyone' করা নেই। Deploy সেটিংস চেক করুন।");
        }

        const data = JSON.parse(text);

        if (!data.success) {
            throw new Error(data.error || 'ইমেইল পাঠাতে ব্যর্থ হয়েছে');
        }

        return data;

    } catch (err) {
        throw new Error(err.message);
    }
};

module.exports = sendEmail;

