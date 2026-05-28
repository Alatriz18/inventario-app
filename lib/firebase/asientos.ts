import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, orderBy, where, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { AsientoContable } from '@/types';

const COL = 'asientos';

export function subscribeToAsientos(
  callback: (data: AsientoContable[]) => void,
  limite = 200
): () => void {
  const q = query(collection(db, COL), orderBy('fecha', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.slice(0, limite).map(d => ({ id: d.id, ...d.data() } as AsientoContable)));
  });
}

export async function getAsientos(
  desde?: Date, hasta?: Date
): Promise<AsientoContable[]> {
  let q = query(collection(db, COL), orderBy('fecha', 'desc'));
  const snap = await getDocs(q);
  let items  = snap.docs.map(d => ({ id: d.id, ...d.data() } as AsientoContable));
  if (desde) items = items.filter(a => {
    const f = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
    return f >= desde;
  });
  if (hasta) items = items.filter(a => {
    const f = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
    return f <= hasta;
  });
  return items;
}

export async function createAsiento(
  data: Omit<AsientoContable, 'id'>
): Promise<string> {
  // Generar número correlativo
  const snap  = await getDocs(collection(db, COL));
  const num   = String(snap.size + 1).padStart(6, '0');
  const anio  = new Date().getFullYear();
  const numero = `AJ-${anio}-${num}`;

  const ref = await addDoc(collection(db, COL), {
    ...data,
    numero,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function confirmarAsiento(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { estado: 'confirmado' });
}