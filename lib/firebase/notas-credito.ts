import {
  collection, doc, onSnapshot, query, orderBy,
  serverTimestamp, addDoc, updateDoc, getDoc,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { NotaCredito } from '@/types';

const COL = 'notas_credito';

export function subscribeToNotasCredito(
  callback: (data: NotaCredito[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
        id: d.id,
        ...d.data(),
      } as NotaCredito))
    );
  });
}

export async function getNotaCreditoById(id: string): Promise<NotaCredito | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as NotaCredito;
}

export async function createNotaCredito(
  data: Omit<NotaCredito, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateNotaCredito(
  id:   string,
  data: Partial<Omit<NotaCredito, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data as Record<string, unknown>);
}

export async function autorizarNotaCredito(
  id:                  string,
  numeroAutorizacion:  string,
  fechaAutorizacion:   Date
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    estado:             'autorizada',
    numeroAutorizacion,
    fechaAutorizacion,
  });
}
