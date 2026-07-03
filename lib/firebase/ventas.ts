import {
  collection, doc, onSnapshot,
  query, orderBy, serverTimestamp, runTransaction,
  where, getDocs, writeBatch,
} from 'firebase/firestore';
import { db } from './config';
import { Venta, EstadoCxC } from '@/types';

const COL = 'ventas';

export function subscribeToVentas(
  callback: (data: Venta[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('fecha', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Venta)));
  });
}

export async function createVenta(
  venta: Omit<Venta, 'id'>,
  usuarioId: string,
  usuarioNombre: string
): Promise<string> {
  return await runTransaction(db, async (tx) => {

    // 1. Validar stock
    const stockPrevio = new Map<string, number>();
    for (const item of venta.items) {
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
    for (const item of venta.items) {
      const anterior = stockPrevio.get(item.productoId) ?? 0;
      tx.update(doc(db, 'productos', item.productoId), {
        stockActual: anterior - item.cantidad,
        updatedAt:   serverTimestamp(),
      });
    }

    // 3. Crear venta
    const ventaRef  = doc(collection(db, COL));
    const ventaData: Record<string, any> = {
      fecha:                 venta.fecha,
      clienteId:             venta.clienteId,
      clienteNombre:         venta.clienteNombre,
      clienteIdentificacion: venta.clienteIdentificacion,
      items:                 venta.items,
      subtotal:              venta.subtotal,
      descuentoGlobal:       venta.descuentoGlobal,
      total:                 venta.total,
      gananciaTotal:         venta.gananciaTotal,
      metodoPago:            venta.metodoPago,
      estado:                'completada',
      usuarioId,
      usuarioNombre,
      createdAt:             serverTimestamp(),
    };
    if (venta.comprobanteId) ventaData.comprobanteId = venta.comprobanteId;
    if (venta.esCxC)        ventaData.esCxC        = true;
    if (venta.diasCredito)  ventaData.diasCredito  = venta.diasCredito;

    // 3b. Si es crédito, crear CxC en la misma transacción
    let cxcId: string | undefined;
    if (venta.esCxC && venta.diasCredito) {
      const cxcRef = doc(collection(db, 'cuentas_cobrar'));
      cxcId = cxcRef.id;
      const venc = new Date(venta.fecha);
      venc.setDate(venc.getDate() + venta.diasCredito);
      tx.set(cxcRef, {
        ventaId:               ventaRef.id,
        clienteId:             venta.clienteId,
        clienteNombre:         venta.clienteNombre,
        clienteIdentificacion: venta.clienteIdentificacion,
        fechaEmision:          venta.fecha,
        fechaVencimiento:      venc,
        diasCredito:           venta.diasCredito,
        total:                 venta.total,
        saldoPendiente:        venta.total,
        estado:                'pendiente' as EstadoCxC,
        cobros:                [],
        usuarioId,
        usuarioNombre,
        createdAt:             serverTimestamp(),
      });
      ventaData.cxcId = cxcId;
    }

    tx.set(ventaRef, ventaData);

    // 4. Movimientos
    for (const item of venta.items) {
      const anterior = stockPrevio.get(item.productoId) ?? 0;
      tx.set(doc(collection(db, 'movimientos')), {
        tipo:           'salida',
        productoId:     item.productoId,
        productoNombre: item.nombre,
        cantidad:       item.cantidad,
        stockAnterior:  anterior,
        stockNuevo:     anterior - item.cantidad,
        referencia:     ventaRef.id,
        referenciaType: 'venta',
        usuarioId,
        usuarioNombre,
        fecha:          venta.fecha,
      });
    }

    return ventaRef.id;
  });
}

export async function getVentaById(id: string): Promise<Venta | null> {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Venta;
}

export async function anularVenta(
  ventaId: string,
  usuarioId: string,
  usuarioNombre: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ventaRef  = doc(db, COL, ventaId);
    const ventaSnap = await tx.get(ventaRef);
    if (!ventaSnap.exists()) throw new Error('Venta no encontrada');

    const venta = ventaSnap.data() as Venta;
    if (venta.estado === 'anulada') throw new Error('La venta ya está anulada');

    const stockPrevio = new Map<string, number>();
    for (const item of venta.items) {
      const prodSnap = await tx.get(doc(db, 'productos', item.productoId));
      if (prodSnap.exists()) {
        stockPrevio.set(item.productoId, prodSnap.data().stockActual ?? 0);
      }
    }

    for (const item of venta.items) {
      const anterior = stockPrevio.get(item.productoId);
      // Solo revertir stock si el producto aún existe en Firestore
      if (anterior !== undefined) {
        tx.update(doc(db, 'productos', item.productoId), {
          stockActual: anterior + item.cantidad,
          updatedAt:   serverTimestamp(),
        });
      }
      tx.set(doc(collection(db, 'movimientos')), {
        tipo:           'devolucion_cliente',
        productoId:     item.productoId,
        productoNombre: item.nombre,
        cantidad:       item.cantidad,
        stockAnterior:  anterior ?? 0,
        stockNuevo:     (anterior ?? 0) + item.cantidad,
        referencia:     ventaId,
        referenciaType: 'devolucion',
        usuarioId,
        usuarioNombre,
        fecha:          serverTimestamp(),
        notas:          'Anulación de venta',
      });
    }

    tx.update(ventaRef, { estado: 'anulada', anuladaAt: serverTimestamp() });

    // Si era venta a crédito, cancelar el registro CxC vinculado
    if (venta.esCxC && (venta as any).cxcId) {
      const cxcRef  = doc(db, 'cuentas_cobrar', (venta as any).cxcId);
      const cxcSnap = await tx.get(cxcRef);
      if (cxcSnap.exists()) {
        const cxcData = cxcSnap.data();
        if (cxcData.estado !== 'pagada') {
          tx.update(cxcRef, { estado: 'anulada' as EstadoCxC, anuladaAt: serverTimestamp() });
        }
      }
    }
  });

  // Eliminar asiento contable vinculado (si no está bloqueado por período cerrado)
  const asientosSnap = await getDocs(
    query(
      collection(db, 'asientos'),
      where('referenciaId',   '==', ventaId),
      where('referenciaTipo', '==', 'venta'),
    )
  );
  if (!asientosSnap.empty) {
    const batch = writeBatch(db);
    asientosSnap.docs.forEach(d => {
      if (!d.data().bloqueado) batch.delete(d.ref);
    });
    await batch.commit();
  }
}