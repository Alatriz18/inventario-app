import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { ConfigEmail } from '@/types';

const COL    = 'config_email';
const DOC_ID = 'config';

export async function getConfigEmail(): Promise<ConfigEmail | null> {
  const snap = await getDoc(doc(db, COL, DOC_ID));
  return snap.exists() ? (snap.data() as ConfigEmail) : null;
}

export async function saveConfigEmail(config: ConfigEmail): Promise<void> {
  await setDoc(doc(db, COL, DOC_ID), { ...config, updatedAt: new Date() });
}
