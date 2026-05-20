import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT!
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    console.error('Error inicializando Firebase Admin:', err);
  }
}

export const adminAuth = admin.auth();
export const adminDb   = admin.firestore();
export default admin;