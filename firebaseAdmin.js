const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Support both JSON file path and env JSON
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin initialized from ENV');
    } catch (e) {
      console.error('❌ Firebase service account parse error', e.message);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp();
    console.log('✅ Firebase Admin initialized from GOOGLE_APPLICATION_CREDENTIALS');
  } else {
    // Fallback for local dev - expects firebase-service-account.json in root
    try {
      const serviceAccount = require('./firebase-service-account.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin initialized from file');
    } catch {
      console.warn('⚠️ Firebase Admin not initialized - missing service account');
    }
  }
}

module.exports = admin;
