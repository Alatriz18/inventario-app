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

/**
 * Por defecto NO incluye los ítems de tipo 'gasto' (alimentación, combustible…):
 * no tienen stock y no deben aparecer en el POS, entradas, despachos ni reportes de
 * inventario. Solo el catálogo de Productos y la importación de compras los piden.
 */
export function subscribeToProductos(
  callback: (data: Producto[]) => void,
  limite = LIMITE_DEFAULT,
  opciones: { incluirGastos?: boolean } = {}
): () => void {
  const q = query(collection(db, COL), orderBy('nombre'), fsLimit(limite));
  return onSnapshot(q, (snap) => {
    const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Producto));
    callback(opciones.incluirGastos ? todos : todos.filter((p) => p.tipoItem !== 'gasto'));
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