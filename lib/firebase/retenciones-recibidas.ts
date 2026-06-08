import {
  collection, doc, onSnapshot, query, orderBy,
  serverTimestamp, addDoc, updateDoc, getDoc,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { RetencionRecibida } from '@/types';

const COL = 'retenciones_recibidas';

export function subscribeToRetencionesRecibidas(
  callback: (data: RetencionRecibida[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
        id: d.id,
        ...d.data(),
      } as RetencionRecibida))
    );
  });
}

export async function getRetencionRecibidaById(id: string): Promise<RetencionRecibida | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as RetencionRecibida;
}

export async function createRetencionRecibida(
  data: Omit<RetencionRecibida, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateRetencionRecibida(
  id:   string,
  data: Partial<Omit<RetencionRecibida, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data as Record<string, unknown>);
}
