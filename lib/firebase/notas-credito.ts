import {
  collection, doc, onSnapshot, query, orderBy,
  serverTimestamp, addDoc, updateDoc, getDoc, where, limit as fsLimit,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { NotaCredito } from '@/types';

const COL = 'notas_credito';

export function subscribeToNotasCredito(
  callback: (data: NotaCredito[]) => void,
  opts?: { desde?: Date; hasta?: Date; limite?: number }
): () => void {
  const constraints = [];
  if (opts?.desde) constraints.push(where('fechaEmision', '>=', opts.desde));
  if (opts?.hasta) constraints.push(where('fechaEmision', '<=', opts.hasta));
  constraints.push(orderBy('fechaEmision', 'desc'));
  if (opts?.limite) constraints.push(fsLimit(opts.limite));
  const q = query(collection(db, COL), ...constraints);
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
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );
  await updateDoc(doc(db, COL, id), clean as Record<string, unknown>);
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
