import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, orderBy, where, getDocs, serverTimestamp, limit as fsLimit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { DocumentoRecibido } from '@/types';

const COL = 'documentos_recibidos';

export function subscribeToDocsRecibidos(
  callback: (data: DocumentoRecibido[]) => void,
  opts?: { desde?: Date; hasta?: Date; limite?: number }
): () => void {
  const constraints = [];
  if (opts?.desde) constraints.push(where('fechaEmision', '>=', opts.desde));
  if (opts?.hasta) constraints.push(where('fechaEmision', '<=', opts.hasta));
  constraints.push(orderBy('fechaEmision', 'desc'));
  if (opts?.limite) constraints.push(fsLimit(opts.limite));
  const q = query(collection(db, COL), ...constraints);
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DocumentoRecibido)));
  });
}

export async function existeDocRecibido(claveAcceso?: string): Promise<boolean> {
  if (!claveAcceso) return false;
  const s = await getDocs(query(collection(db, COL), where('claveAcceso', '==', claveAcceso)));
  return !s.empty;
}

export async function createDocRecibido(
  data: Omit<DocumentoRecibido, 'id' | 'createdAt'>
): Promise<string> {
  if (await existeDocRecibido(data.claveAcceso)) {
    throw new Error(`El documento ${data.numero} ya está registrado.`);
  }
  const ref = await addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateDocRecibido(
  id: string,
  data: Partial<Omit<DocumentoRecibido, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data as Record<string, unknown>);
}
