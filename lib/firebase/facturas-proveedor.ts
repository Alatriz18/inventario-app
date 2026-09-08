import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, orderBy, where, getDocs, serverTimestamp, runTransaction, getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { FacturaProveedor, PagoFactura, EstadoFacturaProveedor } from '@/types';

const COL = 'facturas_proveedor';

/**
 * Comprueba si una factura de proveedor ya existe. Se considera duplicada si
 * coincide la clave de acceso (única) o la combinación proveedor + número
 * (establecimiento-puntoEmisión-secuencial van dentro de numeroFactura).
 */
export async function existeFacturaProveedor(
  proveedorRuc: string,
  numeroFactura: string,
  claveAcceso?: string
): Promise<boolean> {
  if (claveAcceso) {
    const s1 = await getDocs(query(collection(db, COL), where('claveAcceso', '==', claveAcceso)));
    if (!s1.empty) return true;
  }
  if (proveedorRuc && numeroFactura) {
    const s2 = await getDocs(query(
      collection(db, COL),
      where('proveedorRuc', '==', proveedorRuc),
      where('numeroFactura', '==', numeroFactura),
    ));
    if (!s2.empty) return true;
  }
  return false;
}

export function subscribeToFacturasProveedor(
  callback: (data: FacturaProveedor[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FacturaProveedor)));
  });
}

export async function createFacturaProveedor(
  data: Omit<FacturaProveedor, 'id'>
): Promise<string> {
  // Validación anti-duplicados: mismo proveedor + número, o misma clave de acceso
  const dup = await existeFacturaProveedor(data.proveedorRuc, data.numeroFactura, data.claveAcceso);
  if (dup) {
    throw new Error(
      `La factura ${data.numeroFactura} de ${data.proveedorNombre || data.proveedorRuc} ya está registrada.`
    );
  }
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateFacturaProveedor(
  id: string,
  data: Partial<Omit<FacturaProveedor, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data);
}

/** Registra un pago y devuelve su id (para poder vincular luego su asiento contable). */
export async function registrarPago(
  facturaId: string,
  pago: Omit<PagoFactura, 'id'>
): Promise<string> {
  const pagoId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await runTransaction(db, async (tx) => {
    const ref  = doc(db, COL, facturaId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Factura no encontrada');

    const factura = snap.data() as FacturaProveedor;
    const pagos   = [...(factura.pagos ?? []), { ...pago, id: pagoId }];
    const totalPagado  = pagos.filter(p => !p.anulado).reduce((s, p) => s + p.monto, 0);
    const saldoPendiente = Math.max(0, factura.total - totalPagado);

    let estado: EstadoFacturaProveedor = 'pendiente';
    if (saldoPendiente === 0)             estado = 'pagada';
    else if (totalPagado > 0)             estado = 'parcial';
    else if (factura.fechaVencimiento) {
      const venc = (factura.fechaVencimiento as any)?.toDate?.()
        ?? new Date(factura.fechaVencimiento);
      if (venc < new Date()) estado = 'vencida';
    }

    tx.update(ref, { pagos, saldoPendiente, estado });
  });
  return pagoId;
}

/** Guarda el id del asiento contable generado para un pago específico. */
export async function vincularAsientoPago(
  facturaId: string, pagoId: string, asientoId: string
): Promise<void> {
  const ref  = doc(db, COL, facturaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const factura = snap.data() as FacturaProveedor;
  const pagos = (factura.pagos ?? []).map(p => p.id === pagoId ? { ...p, asientoId } : p);
  await updateDoc(ref, { pagos });
}

/** Anula un pago puntual (no toda la factura): lo marca como anulado y recalcula saldo/estado. */
export async function anularPago(facturaId: string, pagoId: string): Promise<PagoFactura | null> {
  let pagoAnulado: PagoFactura | null = null;
  await runTransaction(db, async (tx) => {
    const ref  = doc(db, COL, facturaId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Factura no encontrada');

    const factura = snap.data() as FacturaProveedor;
    const pagoExistente = (factura.pagos ?? []).find(p => p.id === pagoId);
    if (!pagoExistente) throw new Error('Pago no encontrado');
    if (pagoExistente.anulado) throw new Error('El pago ya estaba anulado');
    pagoAnulado = pagoExistente;

    const pagos = (factura.pagos ?? []).map(p => p.id === pagoId ? { ...p, anulado: true } : p);
    const totalPagado    = pagos.filter(p => !p.anulado).reduce((s, p) => s + p.monto, 0);
    const saldoPendiente = Math.max(0, factura.total - totalPagado);

    let estado: EstadoFacturaProveedor = 'pendiente';
    if (saldoPendiente === 0 && totalPagado > 0) estado = 'pagada';
    else if (totalPagado > 0)                    estado = 'parcial';
    else if (factura.fechaVencimiento) {
      const venc = (factura.fechaVencimiento as any)?.toDate?.()
        ?? new Date(factura.fechaVencimiento);
      if (venc < new Date()) estado = 'vencida';
    }

    tx.update(ref, { pagos, saldoPendiente, estado });
  });
  return pagoAnulado;
}

// Recalcular estado de facturas vencidas (para ejecutar periódicamente)
export async function marcarVencidas(): Promise<void> {
  const snap = await getDoc(doc(db, COL, 'dummy')); // solo para tipado
  // Implementar con Cloud Functions en producción
}