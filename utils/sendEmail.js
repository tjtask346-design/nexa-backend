const sendEmail = async (options) => {
    // আপনার তৈরি করা Google Apps Script Web App URL
    const scriptUrl = process.env.GMAIL_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbynXmVrzPvy2Rgq-1MEvY9nFNF07zOMPl7emA0Zwi9Lwu5m19hhkoNafv3PPumsu1EXiQ/exec';

    const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            to: options.email,
            subject: options.subject,
            html: options.html
        })
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error || 'ইমেইল পাঠাতে ব্যর্থ হয়েছে');
    }

    return data;
};

module.exports = sendEmail;
