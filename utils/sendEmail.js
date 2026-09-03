const sendEmail = async (options) => {
    const scriptUrl = process.env.GMAIL_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbynXmVrzPvy2Rgq-1MEvY9nFNF07zOMPl7emA0Zwi9Lwu5m19hhkoNafv3PPumsu1EXiQ/exec';

    try {
        const response = await fetch(scriptUrl, {
            method: 'POST',
            // Google Apps Script-এর জন্য text/plain ব্যবহার করতে হয়
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

        // যদি গুগল থেকে কোনো HTML পেজ চলে আসে
        if (text.trim().startsWith('<')) {
            throw new Error("Google Apps Script-এর Access 'Anyone' করা নেই। সেটিংস চেক করুন।");
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
