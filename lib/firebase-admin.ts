import * as admin from 'firebase-admin';

function getApp(): admin.app.App {
  if (admin.apps.length) return admin.app();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT no está configurada');

  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export function getAdminAuth() {
  return getApp().auth();
}

export function getAdminDb() {
  return getApp().firestore();
}

export default { getAdminAuth, getAdminDb };
