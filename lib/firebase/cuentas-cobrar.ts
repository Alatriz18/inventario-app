import {
  collection, doc, onSnapshot, query, orderBy,
  serverTimestamp, runTransaction, getDoc, setDoc, updateDoc,
  getDocs, where, writeBatch, Transaction,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { CuentaCobrar, CobroCxC, EstadoCxC } from '@/types';

const COL = 'cuentas_cobrar';

export function subscribeToCxC(
  callback: (data: CuentaCobrar[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('fechaEmision', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
        id: d.id,
        ...d.data(),
      } as CuentaCobrar))
    );
  });
}

export async function getCxCById(id: string): Promise<CuentaCobrar | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CuentaCobrar;
}

/** Busca la CxC (si existe) generada por una venta a crédito. */
export async function getCxCByVentaId(ventaId: string): Promise<CuentaCobrar | null> {
  const snap = await getDocs(query(collection(db, COL), where('ventaId', '==', ventaId)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as CuentaCobrar;
}

export async function crearCuentaCobrar(
  data: Omit<CuentaCobrar, 'id' | 'cobros' | 'estado' | 'createdAt'>
): Promise<string> {
  const ref = doc(collection(db, COL));
  await setDoc(ref, {
    ...data,
    cobros:    [],
    estado:    'pendiente' as EstadoCxC,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Crear CxC dentro de una transacción existente (desde createVenta a crédito)
export function crearCxCEnTransaccion(
  data: Omit<CuentaCobrar, 'id' | 'cobros' | 'estado' | 'createdAt'>,
  tx:   Transaction
): string {
  const ref = doc(collection(db, COL));
  tx.set(ref, {
    ...data,
    cobros:    [],
    estado:    'pendiente' as EstadoCxC,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Registra un cobro y devuelve su id (para poder vincular luego su asiento contable). */
export async function registrarCobroCxC(
  cxcId:         string,
  cobro:         Omit<CobroCxC, 'id'>,
  usuarioId:     string,
  usuarioNombre: string
): Promise<string> {
  const id = `cobro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await runTransaction(db, async (tx: Transaction) => {
    const ref  = doc(db, COL, cxcId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Cuenta por cobrar no encontrada');

    const cxc            = snap.data() as CuentaCobrar;
    const nuevoCobro: CobroCxC = { ...cobro, id, usuarioId, usuarioNombre };

    const cobros         = [...(cxc.cobros ?? []), nuevoCobro];
    const totalCobrado   = Math.round(cobros.filter(c => !c.anulado).reduce((s, c) => s + c.monto, 0) * 100) / 100;
    const saldoPendiente = Math.round(Math.max(0, cxc.total - totalCobrado) * 100) / 100;
    const estado: EstadoCxC =
      saldoPendiente === 0 && totalCobrado > 0 ? 'pagada'  :
      totalCobrado   > 0                       ? 'parcial' :
      'pendiente';

    tx.update(ref, { cobros, saldoPendiente, estado });
  });
  return id;
}

/** Guarda el id del asiento contable generado para un cobro específico. */
export async function vincularAsientoCobro(
  cxcId: string, cobroId: string, asientoId: string
): Promise<void> {
  const ref  = doc(db, COL, cxcId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const cxc = snap.data() as CuentaCobrar;
  const cobros = (cxc.cobros ?? []).map(c => c.id === cobroId ? { ...c, asientoId } : c);
  await updateDoc(ref, { cobros });
}

/** Edita fecha, referencia y/o monto de un cobro ya registrado; recalcula saldo/estado si cambia el monto. */
export async function editarCobro(
  cxcId: string, cobroId: string,
  cambios: { fecha?: Date; referencia?: string; monto?: number }
): Promise<CobroCxC> {
  let cobroEditado: CobroCxC | null = null;
  await runTransaction(db, async (tx: Transaction) => {
    const ref  = doc(db, COL, cxcId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Cuenta por cobrar no encontrada');

    const cxc = snap.data() as CuentaCobrar;
    const cobroExistente = (cxc.cobros ?? []).find(c => c.id === cobroId);
    if (!cobroExistente) throw new Error('Cobro no encontrado');
    if (cobroExistente.anulado) throw new Error('No se puede editar un cobro anulado');

    if (cambios.monto !== undefined && cambios.monto <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    const actualizado: CobroCxC = { ...cobroExistente };
    if (cambios.fecha) actualizado.fecha = cambios.fecha;
    if (cambios.monto !== undefined) actualizado.monto = cambios.monto;
    if (cambios.referencia !== undefined) {
      if (cambios.referencia) actualizado.referencia = cambios.referencia;
      else delete actualizado.referencia;
    }
    cobroEditado = actualizado;
    const cobros = (cxc.cobros ?? []).map(c => c.id === cobroId ? actualizado : c);

    if (cambios.monto !== undefined) {
      const totalCobrado   = Math.round(cobros.filter(c => !c.anulado).reduce((s, c) => s + c.monto, 0) * 100) / 100;
      if (totalCobrado > cxc.total + 0.01) {
        throw new Error(`El nuevo monto hace que el total cobrado (${totalCobrado.toFixed(2)}) supere el total de la cuenta (${cxc.total.toFixed(2)})`);
      }
      const saldoPendiente = Math.round(Math.max(0, cxc.total - totalCobrado) * 100) / 100;
      const estado: EstadoCxC =
        saldoPendiente === 0 && totalCobrado > 0 ? 'pagada'  :
        totalCobrado   > 0                       ? 'parcial' :
        'pendiente';
      tx.update(ref, { cobros, saldoPendiente, estado });
    } else {
      tx.update(ref, { cobros });
    }
  });
  return cobroEditado!;
}

/** Anula un cobro puntual (no toda la CxC): lo marca como anulado y recalcula saldo/estado. */
export async function anularCobro(cxcId: string, cobroId: string): Promise<CobroCxC | null> {
  let cobroAnulado: CobroCxC | null = null;
  await runTransaction(db, async (tx: Transaction) => {
    const ref  = doc(db, COL, cxcId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Cuenta por cobrar no encontrada');

    const cxc = snap.data() as CuentaCobrar;
    const cobroExistente = (cxc.cobros ?? []).find(c => c.id === cobroId);
    if (!cobroExistente) throw new Error('Cobro no encontrado');
    if (cobroExistente.anulado) throw new Error('El cobro ya estaba anulado');
    cobroAnulado = cobroExistente;

    const cobros = (cxc.cobros ?? []).map(c => c.id === cobroId ? { ...c, anulado: true } : c);
    const totalCobrado   = Math.round(cobros.filter(c => !c.anulado).reduce((s, c) => s + c.monto, 0) * 100) / 100;
    const saldoPendiente = Math.round(Math.max(0, cxc.total - totalCobrado) * 100) / 100;
    const estado: EstadoCxC =
      saldoPendiente === 0 && totalCobrado > 0 ? 'pagada'  :
      totalCobrado   > 0                       ? 'parcial' :
      'pendiente';

    tx.update(ref, { cobros, saldoPendiente, estado });
  });
  return cobroAnulado;
}

export async function actualizarEstadosVencidos(): Promise<void> {
  const hoy  = new Date();
  const q    = query(
    collection(db, COL),
    where('estado', 'in', ['pendiente', 'parcial'])
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
    const data = d.data() as CuentaCobrar;
    const venc = (data.fechaVencimiento as any)?.toDate?.() ?? new Date(data.fechaVencimiento);
    if (venc < hoy) batch.update(d.ref, { estado: 'vencida' });
  });
  await batch.commit();
}
