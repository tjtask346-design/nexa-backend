// Firebase now handles emails, dummy file to prevent crash
const sendEmail = async (options) => {
    console.log(`[Email Disabled] To: ${options?.email}`);
    return { success: true };
};
module.exports = sendEmail;
