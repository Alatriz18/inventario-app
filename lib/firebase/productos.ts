import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp, limit as fsLimit,
} from 'firebase/firestore';
import { db } from './config';
import { Producto } from '@/types';

const COL = 'productos';

// Tope de seguridad: evita facturar lecturas de un catálogo sin fin. Si el
// negocio llega a tener más productos que esto, hace falta rediseñar esta
// pantalla con búsqueda del lado del servidor en vez de traer todo.
const LIMITE_DEFAULT = 3000;

export function subscribeToProductos(
  callback: (data: Producto[]) => void,
  limite = LIMITE_DEFAULT
): () => void {
  const q = query(collection(db, COL), orderBy('nombre'), fsLimit(limite));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Producto)));
  });
}

/**
 * Crea un producto. La imagen (si existe) viene en data.imagen como una
 * miniatura en base64 (ver lib/utils/imagen.ts) — se guarda en Firestore.
 */
export async function createProducto(
  data: Omit<Producto, 'id'>
): Promise<string> {
  const docRef = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateProducto(
  id: string,
  data: Partial<Omit<Producto, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProducto(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}