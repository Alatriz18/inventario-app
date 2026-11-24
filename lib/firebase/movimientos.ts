import {
  collection, query, orderBy, where, limit as fsLimit,
  QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { onSnapshot } from './compartido';
import { db } from '@/lib/firebase/config';
import { Movimiento } from '@/types';

const COL = 'movimientos';

export function subscribeToMovimientos(
  callback: (data: Movimiento[]) => void,
  opts?: { desde?: Date; hasta?: Date; limite?: number }
): () => void {
  const constraints = [];
  if (opts?.desde) constraints.push(where('fecha', '>=', opts.desde));
  if (opts?.hasta) constraints.push(where('fecha', '<=', opts.hasta));
  constraints.push(orderBy('fecha', 'desc'));
  if (opts?.limite) constraints.push(fsLimit(opts.limite));
  const q = query(collection(db, COL), ...constraints);
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
        id: d.id,
        ...d.data(),
      } as Movimiento))
    );
  });
}

/**
 * Movimientos de UN producto (para el Kardex). Se filtra solo por productoId — sin orderBy — para
 * no depender de un índice compuesto; el orden por fecha lo aplica la pantalla.
 */
export function subscribeToMovimientosProducto(
  productoId: string,
  callback: (data: Movimiento[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, COL), where('productoId', '==', productoId));
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
          id: d.id,
          ...d.data(),
        } as Movimiento))
      );
    },
    (error) => onError?.(error)
  );
}
