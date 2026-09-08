import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, where, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Cliente } from '@/types';

const COL = 'clientes';

export function subscribeToClientes(
  callback: (data: Cliente[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cliente)));
  });
}

/**
 * Busca un cliente por identificación; si no existe lo crea con datos mínimos
 * (usado por importaciones masivas). Devuelve { id, nombre, identificacion }.
 */
export async function getOrCreateClientePorIdentificacion(
  identificacion: string,
  nombre: string
): Promise<{ id: string; nombre: string; identificacion: string }> {
  if (identificacion && identificacion !== '9999999999999') {
    const snap = await getDocs(query(collection(db, COL), where('identificacion', '==', identificacion)));
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data() as Cliente;
      return { id: d.id, nombre: data.nombre, identificacion: data.identificacion };
    }
  }
  if (!identificacion || identificacion === '9999999999999') {
    return { id: 'consumidor_final', nombre: nombre || 'CONSUMIDOR FINAL', identificacion: '9999999999999' };
  }
  const tipoIdentificacion =
    identificacion.length === 13 ? 'ruc' : identificacion.length === 10 ? 'cedula' : 'pasaporte';
  const ref = await addDoc(collection(db, COL), {
    tipoIdentificacion,
    identificacion,
    nombre,
    tipoCliente: 'local',
    pais:        'Ecuador',
    codigoPais:  '593',
    tipoPago:    'contado',
    activo:      true,
    createdAt:   serverTimestamp(),
  });
  return { id: ref.id, nombre, identificacion };
}

export async function createCliente(data: Omit<Cliente, 'id'>): Promise<void> {
  await addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp() });
}

export async function updateCliente(
  id: string, data: Partial<Omit<Cliente, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data);
}

export async function deleteCliente(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}