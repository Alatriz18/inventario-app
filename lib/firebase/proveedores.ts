import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, where, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Proveedor } from '@/types';

const COL = 'proveedores';

/**
 * Busca un proveedor por RUC; si no existe lo crea automáticamente con los
 * datos mínimos del comprobante. Devuelve { id, nombre, ruc }.
 */
export async function getOrCreateProveedorPorRuc(
  ruc: string,
  nombre: string
): Promise<{ id: string; nombre: string; ruc: string }> {
  const snap = await getDocs(query(collection(db, COL), where('ruc', '==', ruc)));
  if (!snap.empty) {
    const d = snap.docs[0];
    const data = d.data() as Proveedor;
    return { id: d.id, nombre: data.nombre, ruc: data.ruc };
  }
  const tipoIdentificacion =
    ruc.length === 13 ? 'ruc' : ruc.length === 10 ? 'cedula' : 'pasaporte';
  const ref = await addDoc(collection(db, COL), {
    tipoIdentificacion,
    ruc,
    nombre,
    tipoProveedor: 'local',
    pais:          'Ecuador',
    codigoPais:    '593',
    tipoPago:      'contado',
    activo:        true,
    createdAt:     serverTimestamp(),
  });
  return { id: ref.id, nombre, ruc };
}

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