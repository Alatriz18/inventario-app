import {
  collection, onSnapshot, query, orderBy,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Movimiento } from '@/types';

const COL = 'movimientos';

export function subscribeToMovimientos(
  callback: (data: Movimiento[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('fecha', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
        id: d.id,
        ...d.data(),
      } as Movimiento))
    );
  });
}
