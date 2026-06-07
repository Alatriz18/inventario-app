import {
  collection, doc, onSnapshot, query, orderBy, where,
  serverTimestamp, addDoc, updateDoc, deleteDoc, getDoc,
  writeBatch, QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { CuentaBancaria, MovimientoBancario } from '@/types';

const COL_CUENTAS = 'cuentas_bancarias';
const COL_MOVS    = 'movimientos_bancarios';

// ── Cuentas bancarias ──────────────────────────────────────────────────────

export function subscribeToCuentasBancarias(
  callback: (data: CuentaBancaria[]) => void
): () => void {
  const q = query(collection(db, COL_CUENTAS), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
        id: d.id,
        ...d.data(),
      } as CuentaBancaria))
    );
  });
}

export async function createCuentaBancaria(
  data: Omit<CuentaBancaria, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL_CUENTAS), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCuentaBancaria(
  id:   string,
  data: Partial<Omit<CuentaBancaria, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL_CUENTAS, id), data as Record<string, unknown>);
}

export async function deleteCuentaBancaria(id: string): Promise<void> {
  await deleteDoc(doc(db, COL_CUENTAS, id));
}

// ── Movimientos bancarios ──────────────────────────────────────────────────

export function subscribeToMovimientosBancarios(
  cuentaId: string,
  callback: (data: MovimientoBancario[]) => void
): () => void {
  const q = query(
    collection(db, COL_MOVS),
    where('cuentaBancariaId', '==', cuentaId),
    orderBy('fecha', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
        id: d.id,
        ...d.data(),
      } as MovimientoBancario))
    );
  });
}

export async function importarMovimientosBancarios(
  movimientos: Omit<MovimientoBancario, 'id' | 'createdAt'>[]
): Promise<void> {
  const batch = writeBatch(db);
  movimientos.forEach(m => {
    const ref = doc(collection(db, COL_MOVS));
    batch.set(ref, { ...m, createdAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function conciliarMovimiento(
  movId:     string,
  asientoId: string
): Promise<void> {
  await updateDoc(doc(db, COL_MOVS, movId), {
    estado:    'conciliado',
    asientoId,
  });
}

export async function ignorarMovimiento(movId: string): Promise<void> {
  await updateDoc(doc(db, COL_MOVS, movId), { estado: 'ignorado' });
}

export async function revertirConciliacion(movId: string): Promise<void> {
  await updateDoc(doc(db, COL_MOVS, movId), {
    estado:    'no_conciliado',
    asientoId: null,
  });
}
