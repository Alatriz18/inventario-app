import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { AppUser } from '@/types';

export function subscribeToUsers(
  callback: (data: AppUser[]) => void
): () => void {
  const q = query(collection(db, 'users'), orderBy('nombre'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));
  });
}

export async function getUserById(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? ({ uid: snap.id, ...snap.data() } as AppUser) : null;
}