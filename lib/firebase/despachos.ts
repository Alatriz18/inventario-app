import {
  collection, doc, onSnapshot,
  query, orderBy, serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { db } from './config';
import { Entrada } from '@/types';

const COL = 'despachos';

export interface ItemDespacho {
  productoId:    string;
  sku:           string;
  nombre:        string;
  cantidad:      number;
  precioUnitario:number;
  subtotal:      number;
}

export interface Despacho {
  id:             string;
  fecha:          Date;
  motivo:         'venta' | 'ajuste' | 'muestra' | 'devolucion_proveedor' | 'otro';
  motivoDetalle?: string;
  bodegaId?:      string;
  bodegaNombre?:  string;
  items:          ItemDespacho[];
  total:          number;
  usuarioId:      string;
  usuarioNombre:  string;
  anulado?:       boolean;
  anuladoAt?:     Date;
  notas?:         string;
  createdAt:      Date;
}

export function subscribeToDespachos(
  callback: (data: Despacho[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Despacho)));
  });
}
export async function createDespacho(
  despacho: Omit<Despacho, 'id'>,
  usuarioId: string,
  usuarioNombre: string
): Promise<string> {
  return await runTransaction(db, async (tx) => {

    // 1. Leer stock y validar suficiencia
    const stockPrevio = new Map<string, number>();
    for (const item of despacho.items) {
      const prodRef  = doc(db, 'productos', item.productoId);
      const prodSnap = await tx.get(prodRef);
      if (!prodSnap.exists()) throw new Error(`Producto "${item.nombre}" no encontrado`);
      const stock = prodSnap.data().stockActual ?? 0;
      if (stock < item.cantidad) {
        throw new Error(`Stock insuficiente para "${item.nombre}" (disponible: ${stock})`);
      }
      stockPrevio.set(item.productoId, stock);
    }

    // 2. Reducir stock
    for (const item of despacho.items) {
      const anterior = stockPrevio.get(item.productoId) ?? 0;
      tx.update(doc(db, 'productos', item.productoId), {
        stockActual: anterior - item.cantidad,
        updatedAt:   serverTimestamp(),
      });
    }

    // 3. Limpiar undefined antes de guardar en Firestore
    const despachoData: Record<string, any> = {
      fecha:         despacho.fecha,
      motivo:        despacho.motivo,
      items:         despacho.items,
      total:         despacho.total,
      usuarioId:     despacho.usuarioId,
      usuarioNombre: despacho.usuarioNombre,
      anulado:       false,
      createdAt:     serverTimestamp(),
    };

    // Solo agregar campos opcionales si tienen valor
    if (despacho.bodegaId)      despachoData.bodegaId      = despacho.bodegaId;
    if (despacho.bodegaNombre)  despachoData.bodegaNombre  = despacho.bodegaNombre;
    if (despacho.motivoDetalle) despachoData.motivoDetalle = despacho.motivoDetalle;
    if (despacho.notas)         despachoData.notas         = despacho.notas;

    const despachoRef = doc(collection(db, COL));
    tx.set(despachoRef, despachoData);

    // 4. Movimientos
    for (const item of despacho.items) {
      const anterior = stockPrevio.get(item.productoId) ?? 0;
      const movData: Record<string, any> = {
        tipo:           'salida',
        productoId:     item.productoId,
        productoNombre: item.nombre,
        cantidad:       item.cantidad,
        stockAnterior:  anterior,
        stockNuevo:     anterior - item.cantidad,
        referencia:     despachoRef.id,
        referenciaType: 'entrada',
        usuarioId,
        usuarioNombre,
        fecha:          serverTimestamp(),
      };
      if (despacho.bodegaId)    movData.bodegaId    = despacho.bodegaId;
      if (despacho.bodegaNombre)movData.bodegaNombre = despacho.bodegaNombre;
      if (despacho.notas)       movData.notas        = despacho.notas;

      tx.set(doc(collection(db, 'movimientos')), movData);
    }

    return despachoRef.id;
  });
}
export async function anularDespacho(
  despachoId: string,
  usuarioId: string,
  usuarioNombre: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref  = doc(db, COL, despachoId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Despacho no encontrado');

    const despacho = snap.data() as Despacho;

    const stockPrevio = new Map<string, number>();
    for (const item of despacho.items) {
      const prodSnap = await tx.get(doc(db, 'productos', item.productoId));
      if (prodSnap.exists()) {
        stockPrevio.set(item.productoId, prodSnap.data().stockActual ?? 0);
      }
    }

    for (const item of despacho.items) {
      const anterior = stockPrevio.get(item.productoId) ?? 0;
      tx.update(doc(db, 'productos', item.productoId), {
        stockActual: anterior + item.cantidad,
        updatedAt:   serverTimestamp(),
      });

      tx.set(doc(collection(db, 'movimientos')), {
        tipo:           'ajuste_positivo',
        productoId:     item.productoId,
        productoNombre: item.nombre,
        cantidad:       item.cantidad,
        stockAnterior:  anterior,
        stockNuevo:     anterior + item.cantidad,
        bodegaId:       null,
        bodegaNombre:   null,
        referencia:     despachoId,
        referenciaType: 'ajuste',
        usuarioId,
        usuarioNombre,
        fecha:          serverTimestamp(),
        notas:          'Anulación de despacho',
      });
    }

    tx.update(ref, { anulado: true, anuladoAt: serverTimestamp() });
  });
}