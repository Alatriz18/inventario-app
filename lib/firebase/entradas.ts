import {
  collection, doc, onSnapshot,
  query, orderBy, serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { db } from './config';
import { Entrada } from '@/types';

const COL = 'entradas';

export function subscribeToEntradas(
  callback: (data: Entrada[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entrada)));
  });
}

export async function createEntrada(
  entrada: Omit<Entrada, 'id'>,
  usuarioId: string,
  usuarioNombre: string
): Promise<string> {
  return await runTransaction(db, async (tx) => {

    // 1. Leer stock actual de todos los productos
    const stockPrevio = new Map<string, number>();
    for (const item of entrada.items) {
      const prodRef  = doc(db, 'productos', item.productoId);
      const prodSnap = await tx.get(prodRef);
      if (!prodSnap.exists()) throw new Error(`Producto "${item.nombre}" no encontrado`);
      stockPrevio.set(item.productoId, prodSnap.data().stockActual ?? 0);
    }

    // 2. Actualizar stock de cada producto
    for (const item of entrada.items) {
      const anterior = stockPrevio.get(item.productoId) ?? 0;
      tx.update(doc(db, 'productos', item.productoId), {
        stockActual: anterior + item.cantidad,
        updatedAt:   serverTimestamp(),
      });
    }

    // 3. Limpiar undefined antes de guardar en Firestore
    const entradaData: Record<string, any> = {
      fecha:          entrada.fecha,
      proveedorId:    entrada.proveedorId,
      proveedorNombre:entrada.proveedorNombre,
      items:          entrada.items,
      subtotal:       entrada.subtotal,
      iva:            entrada.iva,
      total:          entrada.total,
      usuarioId:      entrada.usuarioId,
      usuarioNombre:  entrada.usuarioNombre,
      createdAt:      serverTimestamp(),
    };

    // Solo agregar campos opcionales si tienen valor
    if (entrada.bodegaId)           entradaData.bodegaId           = entrada.bodegaId;
    if (entrada.bodegaNombre)       entradaData.bodegaNombre       = entrada.bodegaNombre;
    if (entrada.facturaProveedorId) entradaData.facturaProveedorId = entrada.facturaProveedorId;
    if (entrada.notas)              entradaData.notas              = entrada.notas;

    const entradaRef = doc(collection(db, COL));
    tx.set(entradaRef, entradaData);

    // 4. Registrar movimiento por cada item
    for (const item of entrada.items) {
      const anterior = stockPrevio.get(item.productoId) ?? 0;
      const movData: Record<string, any> = {
        tipo:           'entrada',
        productoId:     item.productoId,
        productoNombre: item.nombre,
        cantidad:       item.cantidad,
        stockAnterior:  anterior,
        stockNuevo:     anterior + item.cantidad,
        referencia:     entradaRef.id,
        referenciaType: 'entrada',
        usuarioId,
        usuarioNombre,
        fecha:          serverTimestamp(),
      };

      if (entrada.bodegaId)    movData.bodegaId    = entrada.bodegaId;
      if (entrada.bodegaNombre)movData.bodegaNombre = entrada.bodegaNombre;
      if (entrada.notas)       movData.notas        = entrada.notas;

      tx.set(doc(collection(db, 'movimientos')), movData);
    }

    return entradaRef.id;
  });
}

export async function anularEntrada(
  entradaId: string,
  usuarioId: string,
  usuarioNombre: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const entradaRef  = doc(db, COL, entradaId);
    const entradaSnap = await tx.get(entradaRef);
    if (!entradaSnap.exists()) throw new Error('Entrada no encontrada');

    const entrada = entradaSnap.data() as Entrada;

    // Leer stock actual antes de revertir
    const stockPrevio = new Map<string, number>();
    for (const item of entrada.items) {
      const prodSnap = await tx.get(doc(db, 'productos', item.productoId));
      if (prodSnap.exists()) {
        stockPrevio.set(item.productoId, prodSnap.data().stockActual ?? 0);
      }
    }

    // Revertir stock y registrar movimientos
    for (const item of entrada.items) {
      const anterior = stockPrevio.get(item.productoId) ?? 0;
      const nuevo    = Math.max(0, anterior - item.cantidad);

      tx.update(doc(db, 'productos', item.productoId), {
        stockActual: nuevo,
        updatedAt:   serverTimestamp(),
      });

      tx.set(doc(collection(db, 'movimientos')), {
        tipo:           'devolucion_proveedor',
        productoId:     item.productoId,
        productoNombre: item.nombre,
        cantidad:       item.cantidad,
        stockAnterior:  anterior,
        stockNuevo:     nuevo,
        referencia:     entradaId,
        referenciaType: 'devolucion',
        usuarioId,
        usuarioNombre,
        fecha:          serverTimestamp(),
        notas:          'Anulación de entrada',
      });
    }

    tx.update(entradaRef, {
      anulada:   true,
      anuladaAt: serverTimestamp(),
    });
  });
}