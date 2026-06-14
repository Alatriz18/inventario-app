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

export async function registrarPago(
  facturaId: string,
  pago: Omit<PagoFactura, 'id'>
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref  = doc(db, COL, facturaId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Factura no encontrada');

    const factura = snap.data() as FacturaProveedor;
    const pagos   = [...(factura.pagos ?? []), { ...pago, id: Date.now().toString() }];
    const totalPagado  = pagos.reduce((s, p) => s + p.monto, 0);
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
}

// Recalcular estado de facturas vencidas (para ejecutar periódicamente)
export async function marcarVencidas(): Promise<void> {
  const snap = await getDoc(doc(db, COL, 'dummy')); // solo para tipado
  // Implementar con Cloud Functions en producción
}