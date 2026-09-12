const admin = require('firebase-admin');

try {
    // Render-এর Environment Variable থেকে JSON পার্স করা
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin System Connected');
} catch (error) {
    console.error('⚠️ Firebase Admin Initialization Error:', error.message);
}

module.exports = admin;

