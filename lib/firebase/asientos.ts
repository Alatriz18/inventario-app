import {
  collection, doc, addDoc, updateDoc, getDoc, onSnapshot,
  query, orderBy, where, getDocs, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { AsientoContable, AsientoLinea, TipoAsiento } from '@/types';

const COL = 'asientos';

// ── helpers ───────────────────────────────────────────────────────────────

function toDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Timestamp) return v.toDate();
  if (v?.toDate) return v.toDate();
  return new Date(v);
}

function fromDoc(d: any): AsientoContable {
  const data = d.data();
  return {
    id:                    d.id,
    ...data,
    fecha:                 toDate(data.fecha),
    createdAt:             toDate(data.createdAt),
    updatedAt:             data.updatedAt ? toDate(data.updatedAt) : undefined,
    bloqueado:             data.bloqueado             ?? false,
    editadoManualmente:    data.editadoManualmente    ?? false,
  } as AsientoContable;
}

// ── Suscripción y lectura ─────────────────────────────────────────────────

export function subscribeToAsientos(
  callback: (data: AsientoContable[]) => void,
  limite = 300
): () => void {
  const q = query(collection(db, COL), orderBy('fecha', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.slice(0, limite).map(fromDoc));
  });
}

export async function getAsientos(desde?: Date, hasta?: Date): Promise<AsientoContable[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('fecha', 'desc')));
  let items  = snap.docs.map(fromDoc);
  if (desde) items = items.filter(a => a.fecha >= desde);
  if (hasta) items = items.filter(a => a.fecha <= hasta);
  return items;
}

/** Busca el asiento vinculado a un documento origen (venta, entrada, pago, etc.) */
export async function getAsientoByReferencia(
  referenciaId: string,
  referenciaTipo: string
): Promise<AsientoContable | null> {
  const q = query(
    collection(db, COL),
    where('referenciaId',   '==', referenciaId),
    where('referenciaTipo', '==', referenciaTipo)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return fromDoc(snap.docs[0]);
}

// ── Creación ──────────────────────────────────────────────────────────────

export async function createAsiento(
  data: Omit<AsientoContable, 'id' | 'numero'>
): Promise<string> {
  const snap  = await getDocs(collection(db, COL));
  const num   = String(snap.size + 1).padStart(6, '0');
  const anio  = new Date().getFullYear();
  const numero = `AJ-${anio}-${num}`;

  const ref = await addDoc(collection(db, COL), {
    ...data,
    numero,
    bloqueado:          data.bloqueado          ?? false,
    editadoManualmente: data.editadoManualmente ?? false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// ── Confirmación ──────────────────────────────────────────────────────────

export async function confirmarAsiento(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { estado: 'confirmado' });
}

// ── EDICIÓN SINCRONIZADA ──────────────────────────────────────────────────
/**
 * Edita un asiento existente.
 *
 * Reglas de negocio:
 *  1. Si el período contable está bloqueado → error.
 *  2. Si el asiento tiene referenciaId, es un asiento automático:
 *     - Se permite editar líneas (para corregir descuadres).
 *     - Se marca `editadoManualmente = true` para auditoría.
 *     - NO se propaga la edición de vuelta al documento origen
 *       (una venta no cambia porque se editó el asiento contable).
 *  3. Debe y Haber deben cuadrar al guardar.
 */
export async function editarAsiento(
  id: string,
  cambios: {
    concepto?: string;
    fecha?:    Date;
    lineas?:   AsientoLinea[];
  },
  usuarioId:     string,
  usuarioNombre: string
): Promise<void> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) throw new Error('Asiento no encontrado');

  const asiento = fromDoc(snap);

  // 1. Período bloqueado
  if (asiento.bloqueado) {
    throw new Error('No se puede editar: el período contable está cerrado.');
  }

  // 2. Validar que cuadre si se enviaron nuevas líneas
  if (cambios.lineas) {
    const totalDebe  = cambios.lineas.reduce((s, l) => s + l.debe,  0);
    const totalHaber = cambios.lineas.reduce((s, l) => s + l.haber, 0);
    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      throw new Error(`El asiento no cuadra: Debe ${totalDebe.toFixed(2)} ≠ Haber ${totalHaber.toFixed(2)}`);
    }
    const totalDebe2  = totalDebe;
    const totalHaber2 = totalHaber;
    await updateDoc(doc(db, COL, id), {
      ...(cambios.concepto && { concepto: cambios.concepto }),
      ...(cambios.fecha    && { fecha:    cambios.fecha }),
      lineas:             cambios.lineas,
      totalDebe:          totalDebe2,
      totalHaber:         totalHaber2,
      editadoManualmente: true,
      updatedAt:          serverTimestamp(),
      usuarioEdicionId:   usuarioId,
      usuarioEdicionNombre: usuarioNombre,
    });
  } else {
    await updateDoc(doc(db, COL, id), {
      ...(cambios.concepto && { concepto: cambios.concepto }),
      ...(cambios.fecha    && { fecha:    cambios.fecha }),
      editadoManualmente: true,
      updatedAt:          serverTimestamp(),
      usuarioEdicionId:   usuarioId,
      usuarioEdicionNombre: usuarioNombre,
    });
  }
}

// ── RECÁLCULO desde documento origen ─────────────────────────────────────
/**
 * Cuando se edita una VENTA o COMPRA, el motor de asientos llama a esta
 * función para reemplazar el asiento automático con los nuevos valores.
 *
 * Flujo:
 *   1. Módulo de ventas edita la venta en Firestore.
 *   2. Llama a `recalcularAsientoDeDocumento` con los nuevos totales.
 *   3. Esta función busca el asiento vinculado y reemplaza sus líneas.
 *   4. Si el asiento fue editado manualmente (editadoManualmente=true),
 *      lanza una advertencia pero NO sobreescribe — respeta la corrección manual.
 */
export async function recalcularAsientoDeDocumento(params: {
  referenciaId:   string;
  referenciaTipo: string;
  nuevasLineas:   AsientoLinea[];
  nuevoConcepto?: string;
  usuarioId:      string;
  usuarioNombre:  string;
  forzar?:        boolean;  // true para sobreescribir incluso si fue editado manualmente
}): Promise<{ actualizado: boolean; advertencia?: string }> {
  const asiento = await getAsientoByReferencia(
    params.referenciaId,
    params.referenciaTipo
  );
  if (!asiento) return { actualizado: false, advertencia: 'No se encontró asiento vinculado' };

  if (asiento.bloqueado) {
    return { actualizado: false, advertencia: 'El período contable está cerrado' };
  }

  // Si fue editado manualmente y no se forza → advertir, no sobreescribir
  if (asiento.editadoManualmente && !params.forzar) {
    return {
      actualizado: false,
      advertencia: `El asiento ${asiento.numero} fue editado manualmente. ` +
        'Si deseas recalcularlo, ve a Contabilidad → Asientos y usa "Recalcular desde origen".',
    };
  }

  const totalDebe  = params.nuevasLineas.reduce((s, l) => s + l.debe,  0);
  const totalHaber = params.nuevasLineas.reduce((s, l) => s + l.haber, 0);

  await updateDoc(doc(db, COL, asiento.id), {
    lineas:     params.nuevasLineas,
    totalDebe,
    totalHaber,
    ...(params.nuevoConcepto && { concepto: params.nuevoConcepto }),
    updatedAt:             serverTimestamp(),
    usuarioEdicionId:      params.usuarioId,
    usuarioEdicionNombre:  params.usuarioNombre,
    editadoManualmente:    false,  // se resetea al recalcular desde origen
  });

  return { actualizado: true };
}

// ── Bloqueo por período ───────────────────────────────────────────────────
/**
 * Bloquea/desbloquea todos los asientos de un mes específico.
 * Se llama al cerrar/reabrir un período contable.
 */
export async function bloquearAsientosDePeriodo(
  anio:    number,
  mes:     number,  // 1-12
  bloquear: boolean
): Promise<void> {
  const inicio = new Date(anio, mes - 1, 1);
  const fin    = new Date(anio, mes,     0, 23, 59, 59);

  const snap = await getDocs(query(collection(db, COL), orderBy('fecha')));
  const batch: Promise<void>[] = [];

  for (const d of snap.docs) {
    const a = fromDoc(d);
    if (a.fecha >= inicio && a.fecha <= fin) {
      batch.push(updateDoc(doc(db, COL, d.id), { bloqueado: bloquear }));
    }
  }

  await Promise.all(batch);
}
