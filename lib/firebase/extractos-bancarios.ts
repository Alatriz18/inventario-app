import {
  collection, doc, setDoc, deleteDoc, query, where, serverTimestamp, writeBatch,
  type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { onSnapshot } from './compartido';
import { db } from './config';
import type { ExtractoBancario, ConciliacionBancaria, MarcaConciliacion } from '@/types';
import type { CorteEstadoCuenta } from '@/lib/bancos/estado-cuenta-pichincha';
import { periodoDe } from '@/lib/bancos/conciliacion';

const COL_EXT = 'extractos_bancarios';
const COL_CON = 'conciliaciones_bancarias';

/** Guarda un registro por cada corte mensual leído del PDF (si el corte ya existía, lo actualiza). */
export async function guardarExtractos(
  cuentaBancariaId: string,
  cortes: CorteEstadoCuenta[],
  usuarioNombre: string
): Promise<number> {
  let n = 0;
  for (const c of cortes) {
    if (c.repetido || c.saldoAnterior === null || c.saldoActual === null || !c.creditos || !c.debitos) continue;
    const periodo = periodoDe(c.corte);
    await setDoc(doc(db, COL_EXT, `${cuentaBancariaId}_${periodo}`), {
      cuentaBancariaId, periodo, corte: c.corte,
      saldoAnterior: c.saldoAnterior, saldoActual: c.saldoActual,
      creditos: c.creditos, debitos: c.debitos,
      movimientos: c.movimientos.length, cuadra: c.cuadra,
      usuarioNombre, createdAt: serverTimestamp(),
    });
    n++;
  }
  return n;
}

export function subscribeToExtractos(
  cuentaBancariaId: string,
  callback: (data: ExtractoBancario[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(collection(db, COL_EXT), where('cuentaBancariaId', '==', cuentaBancariaId));
  return onSnapshot(
    q,
    snap => callback(snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as ExtractoBancario))),
    e => onError?.(e)
  );
}

export function subscribeToConciliaciones(
  cuentaBancariaId: string,
  callback: (data: ConciliacionBancaria[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(collection(db, COL_CON), where('cuentaBancariaId', '==', cuentaBancariaId));
  return onSnapshot(
    q,
    snap => callback(snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as ConciliacionBancaria))),
    e => onError?.(e)
  );
}

export async function cerrarConciliacion(data: Omit<ConciliacionBancaria, 'id' | 'cerradaAt'>): Promise<void> {
  await setDoc(doc(db, COL_CON, `${data.cuentaBancariaId}_${data.periodo}`), {
    ...data, cerradaAt: serverTimestamp(),
  });
}

export async function reabrirConciliacion(cuentaBancariaId: string, periodo: string): Promise<void> {
  await deleteDoc(doc(db, COL_CON, `${cuentaBancariaId}_${periodo}`));
}

// ── Vistos sobre los asientos del banco ──────────────────────────────────────

const COL_MARCAS = 'conciliacion_marcas';
const idMarca = (cuentaBancariaId: string, asientoId: string) => `${cuentaBancariaId}_${asientoId}`;

export function subscribeToMarcas(
  cuentaBancariaId: string,
  callback: (data: MarcaConciliacion[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(collection(db, COL_MARCAS), where('cuentaBancariaId', '==', cuentaBancariaId));
  return onSnapshot(
    q,
    snap => callback(snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as MarcaConciliacion))),
    e => onError?.(e)
  );
}

/** Pone el visto a varios asientos a la vez (firestore admite 500 escrituras por lote). */
export async function marcarAsientos(
  cuentaBancariaId: string, asientoIds: string[], fechaBanco: Date, usuarioNombre: string
): Promise<void> {
  for (let i = 0; i < asientoIds.length; i += 400) {
    const batch = writeBatch(db);
    asientoIds.slice(i, i + 400).forEach(asientoId => {
      batch.set(doc(db, COL_MARCAS, idMarca(cuentaBancariaId, asientoId)), {
        cuentaBancariaId, asientoId, fechaBanco, usuarioNombre, createdAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
}

export async function desmarcarAsientos(cuentaBancariaId: string, asientoIds: string[]): Promise<void> {
  for (let i = 0; i < asientoIds.length; i += 400) {
    const batch = writeBatch(db);
    asientoIds.slice(i, i + 400).forEach(asientoId => batch.delete(doc(db, COL_MARCAS, idMarca(cuentaBancariaId, asientoId))));
    await batch.commit();
  }
}
