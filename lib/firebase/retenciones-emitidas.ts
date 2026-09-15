import {
  collection, doc, onSnapshot, query, orderBy,
  serverTimestamp, addDoc, updateDoc, getDoc, where, limit as fsLimit,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { RetencionEmitida } from '@/types';

const COL = 'retenciones_emitidas';

export function subscribeToRetencionesEmitidas(
  callback: (data: RetencionEmitida[]) => void,
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
