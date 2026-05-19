import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Cliente } from '@/types';

const COL = 'clientes';

export function subscribeToClientes(
  callback: (data: Cliente[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cliente)));
  });
}

export async function createCliente(data: Omit<Cliente, 'id'>): Promise<void> {
  await addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp() });
}

export async function updateCliente(
  id: string, data: Partial<Omit<Cliente, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data);
}

export async function deleteCliente(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}