import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Bodega } from '@/types';

const COL = 'bodegas';

export function subscribeToBodegas(
  callback: (data: Bodega[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Bodega)));
  });
}

export async function createBodega(data: Omit<Bodega, 'id' | 'createdAt'>): Promise<void> {
  await addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp() });
}

export async function updateBodega(
  id: string, data: Partial<Omit<Bodega, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data);
}

export async function deleteBodega(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}