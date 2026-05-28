import {
  collection, doc, addDoc, updateDoc, getDocs,
  onSnapshot, query, orderBy, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { CuentaContable } from '@/types';
import { PLAN_CUENTAS_ECUADOR } from '@/lib/data/plan-cuentas-ecuador';

const COL = 'cuentas_contables';

export function subscribeToCuentas(
  callback: (data: CuentaContable[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('codigo'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as CuentaContable)));
  });
}

export async function getCuentas(): Promise<CuentaContable[]> {
  const q    = query(collection(db, COL), orderBy('codigo'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CuentaContable));
}

export async function createCuenta(data: Omit<CuentaContable,'id'>): Promise<string> {
  const ref = await addDoc(collection(db, COL), data);
  return ref.id;
}

export async function updateCuenta(id: string, data: Partial<CuentaContable>): Promise<void> {
  await updateDoc(doc(db, COL, id), data);
}

// Carga inicial del plan de cuentas ecuatoriano
export async function seedPlanCuentas(): Promise<void> {
  const snap = await getDocs(collection(db, COL));
  if (!snap.empty) return; // Ya tiene datos

  const batch = writeBatch(db);
  for (const cuenta of PLAN_CUENTAS_ECUADOR) {
    const ref = doc(collection(db, COL));
    batch.set(ref, { ...cuenta, activa: true });
  }
  await batch.commit();
}

// Buscar cuenta por código
export function findCuentaByCodigo(
  cuentas: CuentaContable[],
  codigo: string
): CuentaContable | undefined {
  return cuentas.find(c => c.codigo === codigo);
}