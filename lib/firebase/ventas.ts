import {
  collection, doc, onSnapshot,
  query, orderBy, serverTimestamp, runTransaction,
  where, getDocs, writeBatch, updateDoc,
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

export async function vincularComprobante(ventaId: string, comprobanteId: string): Promise<void> {
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, COL, ventaId), { comprobanteId });
}

export async function anularVenta(
  ventaId: string,
  usuarioId: string,
  usuarioNombre: string
): Promise<{ advertencia?: string }> {
  let advertencia: string | undefined;

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

    // Leer la CxC vinculada (si existe) ANTES de cualquier escritura — Firestore
    // exige que todas las lecturas de una transacción ocurran antes que las escrituras.
    const cxcRef = venta.esCxC && (venta as any).cxcId
      ? doc(db, 'cuentas_cobrar', (venta as any).cxcId)
      : null;
    const cxcSnap = cxcRef ? await tx.get(cxcRef) : null;

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

    // Si era venta a crédito, cancelar el registro CxC vinculado — siempre,
    // incluso si ya estaba pagada, para que desaparezca de saldos pendientes
    // y reportes. Si ya tenía cobros registrados, se avisa para conciliar
    // manualmente un posible reembolso (el historial de cobros no se borra).
    if (cxcRef && cxcSnap?.exists()) {
      const cxcData = cxcSnap.data();
      const totalCobrado = (cxcData.cobros ?? []).reduce((s: number, c: any) => s + c.monto, 0);
      if (totalCobrado > 0) {
        advertencia = `Esta venta ya tenía $${totalCobrado.toFixed(2)} cobrado(s) antes de anularse — revisa si corresponde un reembolso al cliente.`;
      }
      tx.update(cxcRef, { estado: 'anulada' as EstadoCxC, anuladaAt: serverTimestamp() });
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

  return { advertencia };
}

// Repara una venta con datos incompletos (sin metodoPago, sin CxC vinculada, etc.)
// Si el nuevo método es 'credito' y la venta no tiene CxC, crea el registro en cuentas_cobrar.
export async function repararVenta(
  ventaId:       string,
  metodoPago:    string,
  diasCredito:   number | undefined,
  usuarioId:     string,
  usuarioNombre: string
): Promise<{ cxcCreada: boolean }> {
  let cxcCreada = false;

  await runTransaction(db, async (tx) => {
    const ventaRef  = doc(db, COL, ventaId);
    const ventaSnap = await tx.get(ventaRef);
    if (!ventaSnap.exists()) throw new Error('Venta no encontrada');

    const venta = ventaSnap.data() as Venta;
    if (venta.estado === 'anulada') throw new Error('No se puede editar una venta anulada');

    const cambios: Record<string, unknown> = { metodoPago };

    if (metodoPago === 'credito' && diasCredito && !venta.cxcId) {
      const cxcRef  = doc(collection(db, 'cuentas_cobrar'));
      const fechaVenta = (venta.fecha as any)?.toDate?.() ?? new Date(venta.fecha);
      const venc    = new Date(fechaVenta);
      venc.setDate(venc.getDate() + diasCredito);

      tx.set(cxcRef, {
        ventaId:               ventaId,
        clienteId:             venta.clienteId,
        clienteNombre:         venta.clienteNombre,
        clienteIdentificacion: venta.clienteIdentificacion,
        fechaEmision:          venta.fecha,
        fechaVencimiento:      venc,
        diasCredito,
        total:          venta.total,
        saldoPendiente: venta.total,
        estado:         'pendiente' as EstadoCxC,
        cobros:         [],
        usuarioId,
        usuarioNombre,
        createdAt:      serverTimestamp(),
      });

      cambios.esCxC       = true;
      cambios.diasCredito = diasCredito;
      cambios.cxcId       = cxcRef.id;
      cxcCreada = true;
    } else if (metodoPago !== 'credito') {
      cambios.esCxC = false;
    }

    tx.update(ventaRef, cambios);
  });

  return { cxcCreada };
}