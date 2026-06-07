import {
  collection, doc, onSnapshot, query, orderBy,
  serverTimestamp, addDoc, updateDoc, getDoc,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { RetencionEmitida } from '@/types';

const COL = 'retenciones_emitidas';

export function subscribeToRetencionesEmitidas(
  callback: (data: RetencionEmitida[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
        id: d.id,
        ...d.data(),
      } as RetencionEmitida))
    );
  });
}

export async function getRetencionById(id: string): Promise<RetencionEmitida | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as RetencionEmitida;
}

export async function createRetencionEmitida(
  data: Omit<RetencionEmitida, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateRetencionEmitida(
  id:   string,
  data: Partial<Omit<RetencionEmitida, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data as Record<string, unknown>);
}

export async function autorizarRetencion(
  id:                 string,
  numeroAutorizacion: string,
  fechaAutorizacion:  Date
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    estado:             'autorizado',
    numeroAutorizacion,
    fechaAutorizacion,
  });
}
