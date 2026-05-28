import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, writeBatch, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { ConfigRetencion, ConfigICE } from '@/types';
import {
  RETENCIONES_IR_INICIAL, RETENCIONES_IVA_INICIAL, ICE_INICIAL,
} from '@/lib/data/plan-cuentas-ecuador';

// ─── RETENCIONES ──────────────────────────────────────────────────────────
export function subscribeToRetenciones(
  callback: (data: ConfigRetencion[]) => void
): () => void {
  const q = query(collection(db, 'retenciones_config'), orderBy('codigo'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ConfigRetencion)));
  });
}

export async function seedRetenciones(): Promise<void> {
  const snap = await getDocs(collection(db, 'retenciones_config'));
  if (!snap.empty) return;
  const batch = writeBatch(db);
  [...RETENCIONES_IR_INICIAL.map(r => ({ ...r, tipo: 'fuente_ir', activo: true })),
   ...RETENCIONES_IVA_INICIAL.map(r => ({ ...r, tipo: 'iva', activo: true })),
  ].forEach(r => {
    batch.set(doc(collection(db, 'retenciones_config')), r);
  });
  await batch.commit();
}

export async function createRetencion(data: Omit<ConfigRetencion,'id'>): Promise<void> {
  await addDoc(collection(db, 'retenciones_config'), data);
}

export async function updateRetencion(id: string, data: Partial<ConfigRetencion>): Promise<void> {
  await updateDoc(doc(db, 'retenciones_config', id), data);
}

export async function deleteRetencion(id: string): Promise<void> {
  await deleteDoc(doc(db, 'retenciones_config', id));
}

// ─── ICE ──────────────────────────────────────────────────────────────────
export function subscribeToICE(
  callback: (data: ConfigICE[]) => void
): () => void {
  const q = query(collection(db, 'ice_config'), orderBy('codigo'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ConfigICE)));
  });
}

export async function seedICE(): Promise<void> {
  const snap = await getDocs(collection(db, 'ice_config'));
  if (!snap.empty) return;
  const batch = writeBatch(db);
  ICE_INICIAL.forEach(ice => {
    batch.set(doc(collection(db, 'ice_config')), { ...ice, activo: true });
  });
  await batch.commit();
}

export async function createICE(data: Omit<ConfigICE,'id'>): Promise<void> {
  await addDoc(collection(db, 'ice_config'), data);
}

export async function updateICE(id: string, data: Partial<ConfigICE>): Promise<void> {
  await updateDoc(doc(db, 'ice_config', id), data);
}

export async function deleteICE(id: string): Promise<void> {
  await deleteDoc(doc(db, 'ice_config', id));
}