import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, where, getDocs, serverTimestamp, limit as fsLimit } from 'firebase/firestore';
import { onSnapshot } from './compartido';
import { suscribirCatalogo } from './catalogo';
import { db } from './config';
import { Cliente } from '@/types';

const COL = 'clientes';

// Tope de seguridad: evita facturar lecturas de un catálogo sin fin. Si el
// negocio llega a tener más clientes que esto, hace falta rediseñar esta
// pantalla con búsqueda del lado del servidor en vez de traer todo.
const LIMITE_DEFAULT = 3000;

export function subscribeToClientes(
  callback: (data: Cliente[]) => void,
  limite = LIMITE_DEFAULT
): () => void {
  // Catálogo completo: desde la caché del navegador + solo los cambios (ver catalogo.ts)
  if (limite === LIMITE_DEFAULT) {
    return suscribirCatalogo({ coleccion: COL, ordenarPor: 'nombre', limite }, docs => callback(docs as Cliente[]));
  }
  const q = query(collection(db, COL), orderBy('nombre'), fsLimit(limite));
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
    updatedAt:   serverTimestamp(),
  });
  return { id: ref.id, nombre, identificacion };
}

export async function createCliente(data: Omit<Cliente, 'id'>): Promise<void> {
  await addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateCliente(
  id: string, data: Partial<Omit<Cliente, 'id'>>
): Promise<void> {
  // updatedAt: las pantallas piden a Firebase solo los clientes que cambiaron (ver catalogo.ts)
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteCliente(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}