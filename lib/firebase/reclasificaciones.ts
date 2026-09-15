import {
  collection, doc, addDoc, updateDoc, getDoc, onSnapshot,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { LoteReclasificacion } from '@/types';

const COL = 'reclasificaciones_lote';

/** Guarda el registro de un lote de reclasificación ya aplicado (para poder deshacerlo). */
export async function crearLoteReclasificacion(
  data: Omit<LoteReclasificacion, 'id' | 'estado' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    estado: 'aplicado',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getLoteReclasificacion(id: string): Promise<LoteReclasificacion | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as LoteReclasificacion;
}

export async function marcarLoteRevertido(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { estado: 'revertido' });
}

function toDateLote(v: any): Date {
  if (!v) return new Date(0);
  if (v?.toDate) return v.toDate();
  return new Date(v);
}

/**
 * Últimos lotes de reclasificación de una cuenta bancaria (para mostrar "Deshacer").
 * Solo filtra por cuentaBancariaId (sin orderBy) para no depender de un índice
 * compuesto en Firestore; se ordena en el cliente.
 */
export function subscribeToLotesReclasificacion(
  cuentaBancariaId: string,
  callback: (data: LoteReclasificacion[]) => void
): () => void {
  const q = query(collection(db, COL), where('cuentaBancariaId', '==', cuentaBancariaId));
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as LoteReclasificacion));
    data.sort((a, b) => toDateLote(b.createdAt).getTime() - toDateLote(a.createdAt).getTime());
    callback(data.slice(0, 20));
  });
}
