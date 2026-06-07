import {
  collection, doc, onSnapshot, query, orderBy,
  serverTimestamp, runTransaction, getDoc, setDoc,
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

export async function registrarCobroCxC(
  cxcId:         string,
  cobro:         Omit<CobroCxC, 'id'>,
  usuarioId:     string,
  usuarioNombre: string
): Promise<void> {
  await runTransaction(db, async (tx: Transaction) => {
    const ref  = doc(db, COL, cxcId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Cuenta por cobrar no encontrada');

    const cxc            = snap.data() as CuentaCobrar;
    const id             = `cobro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nuevoCobro: CobroCxC = { ...cobro, id, usuarioId, usuarioNombre };

    const cobros         = [...(cxc.cobros ?? []), nuevoCobro];
    const totalCobrado   = cobros.reduce((s, c) => s + c.monto, 0);
    const saldoPendiente = Math.max(0, cxc.total - totalCobrado);
    const estado: EstadoCxC =
      saldoPendiente === 0 ? 'pagada'  :
      totalCobrado   > 0   ? 'parcial' :
      'pendiente';

    tx.update(ref, { cobros, saldoPendiente, estado });
  });
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
