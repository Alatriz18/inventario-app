import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Categoria } from '@/types';

const COL = 'categorias';

export function subscribeToCategorias(
  callback: (data: Categoria[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Categoria)));
  });
}

export async function createCategoria(
  data: Omit<Categoria, 'id'>
): Promise<void> {
  await addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp() });
}

export async function updateCategoria(
  id: string,
  data: Partial<Omit<Categoria, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data);
}

export async function deleteCategoria(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}