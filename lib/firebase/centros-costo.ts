import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { CentroCosto } from '@/types';

const COL = 'centros_costo';

export function subscribeToCentrosCosto(
  callback: (data: CentroCosto[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('codigo'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as CentroCosto)));
  });
}

export async function createCentroCosto(data: Omit<CentroCosto,'id'>): Promise<void> {
  await addDoc(collection(db, COL), data);
}

export async function updateCentroCosto(id: string, data: Partial<CentroCosto>): Promise<void> {
  await updateDoc(doc(db, COL, id), data);
}

export async function deleteCentroCosto(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}