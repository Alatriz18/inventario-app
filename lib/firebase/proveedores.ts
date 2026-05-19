import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Proveedor } from '@/types';

const COL = 'proveedores';

export function subscribeToProveedores(
  callback: (data: Proveedor[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Proveedor)));
  });
}

export async function createProveedor(
  data: Omit<Proveedor, 'id'>
): Promise<void> {
  await addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp() });
}

export async function updateProveedor(
  id: string,
  data: Partial<Omit<Proveedor, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data);
}

export async function deleteProveedor(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}