import {
  collection, doc, onSnapshot, query, orderBy,
  serverTimestamp, addDoc, updateDoc, getDoc, where, limit as fsLimit,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { NotaDebito } from '@/types';

const COL = 'notas_debito';

export function subscribeToNotasDebito(
  callback: (data: NotaDebito[]) => void,
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
      } as NotaDebito))
    );
  });
}

export async function getNotaDebitoById(id: string): Promise<NotaDebito | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as NotaDebito;
}

export async function createNotaDebito(
  data: Omit<NotaDebito, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateNotaDebito(
  id:   string,
  data: Partial<Omit<NotaDebito, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data as Record<string, unknown>);
}

export async function autorizarNotaDebito(
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
