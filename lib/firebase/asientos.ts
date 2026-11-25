import {
  collection, doc, updateDoc, getDoc, setDoc, query, orderBy, where, getDocs, serverTimestamp, Timestamp, limit as fsLimit,
  runTransaction, writeBatch, documentId, startAfter, type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { onSnapshot } from './compartido';
import { db } from '@/lib/firebase/config';
import { AsientoContable, AsientoLinea } from '@/types';
import { codigosDeLineas, codigosAlDia, tocaCuentas, unirAsientos } from '@/lib/contabilidad/cuentas-codigos';

const COL = 'asientos';

// ── Asientos por cuenta (para no leer toda la colección) ──────────────────
//
// Cada asiento guarda `cuentasCodigos` (las cuentas de sus líneas) y así se le puede pedir a
// Firestore solo los de una cuenta. Los asientos anteriores a este cambio no lo tienen: hay que
// "prepararlos" una sola vez (lee toda la colección una vez y les escribe el campo). Mientras no
// se haga, las pantallas siguen leyendo como antes, así nunca muestran datos incompletos.
//
// Para no depender de que TODO asiento nuevo traiga el campo (pestañas con la versión anterior
// del sistema, procesos del servidor), a lo leído por cuenta se suman los asientos creados o
// editados desde la última revisión (`revisadoHasta`), filtrados aquí por sus líneas.

const REF_INDICES = doc(db, 'config_contable', 'indices');
const CLAVE_LOCAL = 'asientosPorCuenta';
/** Margen para relojes desajustados entre computadores y el servidor. */
const MARGEN_MS = 30 * 60 * 1000;

export interface EstadoIndiceAsientos {
  /** true si los asientos ya tienen guardadas sus cuentas. */
  listo:         boolean;
  /** Desde cuándo hay que sumar los asientos creados o editados (sin confiar en su campo). */
  revisadoHasta: Date | null;
}

function leerEstado(data: DocumentData | undefined): EstadoIndiceAsientos {
  const r = data?.revisadoHasta;
  return {
    listo: data?.asientosPorCuenta === true,
    revisadoHasta: r instanceof Timestamp ? r.toDate() : r ? new Date(r) : null,
  };
}

/** Escucha si los asientos ya están preparados para consultarse por cuenta. */
export function subscribeEstadoIndiceAsientos(callback: (e: EstadoIndiceAsientos) => void): () => void {
  return onSnapshot(REF_INDICES, snap => {
    const e = leerEstado(snap.data());
    try { if (e.listo) localStorage.setItem(CLAVE_LOCAL, '1'); } catch { /* sin almacenamiento */ }
    callback(e);
  }, () => callback({ listo: false, revisadoHasta: null }));
}

export async function getEstadoIndiceAsientos(): Promise<EstadoIndiceAsientos> {
  return leerEstado((await getDoc(REF_INDICES)).data());
}

/** Asientos que usan alguna de estas cuentas (máx. 30 cuentas por consulta, límite de Firestore). */
export function subscribeToAsientosDeCuentas(
  codigos: string[],
  callback: (data: AsientoContable[]) => void,
  onError?: (e: Error) => void
): () => void {
  const lista = [...new Set(codigos.filter(Boolean))].slice(0, 30);
  if (lista.length === 0) { callback([]); return () => {}; }
  const q = query(collection(db, COL), where('cuentasCodigos', 'array-contains-any', lista));
  return onSnapshot(q, snap => callback(snap.docs.map(fromDoc)), err => onError?.(err));
}

/** Asientos creados o editados desde una fecha (dos consultas pequeñas, unidas). */
export function subscribeToAsientosRecientes(
  desde: Date,
  callback: (data: AsientoContable[]) => void,
  onError?: (e: Error) => void
): () => void {
  let creados: AsientoContable[] = [], editados: AsientoContable[] = [];
  const emitir = () => callback(unirAsientos(creados, editados));
  const u1 = onSnapshot(query(collection(db, COL), where('createdAt', '>=', desde)),
    snap => { creados = snap.docs.map(fromDoc); emitir(); }, err => onError?.(err));
  const u2 = onSnapshot(query(collection(db, COL), where('updatedAt', '>=', desde)),
    snap => { editados = snap.docs.map(fromDoc); emitir(); }, err => onError?.(err));
  return () => { u1(); u2(); };
}

/** Lee asientos puntuales por su id (de a 30, límite de Firestore). */
export async function getAsientosPorIds(ids: string[]): Promise<AsientoContable[]> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const salida: AsientoContable[] = [];
  for (let i = 0; i < unicos.length; i += 30) {
    const snap = await getDocs(query(collection(db, COL), where(documentId(), 'in', unicos.slice(i, i + 30))));
    salida.push(...snap.docs.map(fromDoc));
  }
  return salida;
}

/**
 * Lectura puntual de los asientos que usan alguna de estas cuentas. Si los asientos aún no están
 * preparados, lee todos y filtra (como antes), así el resultado siempre es completo.
 */
export async function getAsientosQueTocan(codigos: string[]): Promise<AsientoContable[]> {
  const lista = [...new Set(codigos.filter(Boolean))];
  if (lista.length === 0) return [];
  const estado = await getEstadoIndiceAsientos();
  if (!estado.listo || lista.length > 30) {
    return (await getAsientos()).filter(a => tocaCuentas(a, lista));
  }
  const porCuenta = await getDocs(query(collection(db, COL), where('cuentasCodigos', 'array-contains-any', lista)));
  const desde = estado.revisadoHasta ?? new Date(0);
  const [creados, editados] = await Promise.all([
    getDocs(query(collection(db, COL), where('createdAt', '>=', desde))),
    getDocs(query(collection(db, COL), where('updatedAt', '>=', desde))),
  ]);
  const recientes = [...creados.docs, ...editados.docs].map(fromDoc).filter(a => tocaCuentas(a, lista));
  // Si una edición quitó la cuenta, el asiento llega por la consulta por cuenta pero ya no la toca
  return unirAsientos(porCuenta.docs.map(fromDoc), recientes).filter(a => tocaCuentas(a, lista));
}

/**
 * Guarda `cuentasCodigos` en los asientos que no lo tienen al día (solo escribe los que cambian) y
 * corre la marca de revisión. Lo usan la preparación inicial y la revisión de lo reciente.
 */
async function escribirCodigos(asientos: AsientoContable[]): Promise<number> {
  const pendientes = asientos.filter(a => !codigosAlDia(a));
  for (let i = 0; i < pendientes.length; i += 400) {
    const lote = writeBatch(db);
    pendientes.slice(i, i + 400).forEach(a => lote.update(doc(db, COL, a.id), { cuentasCodigos: codigosDeLineas(a.lineas) }));
    await lote.commit();
  }
  return pendientes.length;
}

/**
 * Preparación única: recorre todos los asientos (en páginas de 500) y les guarda sus cuentas.
 * Cuesta una lectura por asiento, una sola vez. Se puede repetir sin problema: solo escribe lo
 * que falte.
 */
export async function prepararAsientosPorCuenta(
  onProgreso?: (leidos: number, actualizados: number) => void
): Promise<{ leidos: number; actualizados: number }> {
  const inicio = new Date(Date.now() - MARGEN_MS);
  let leidos = 0, actualizados = 0;
  let ultimo: QueryDocumentSnapshot<DocumentData> | undefined;
  for (;;) {
    const partes = [orderBy(documentId()), fsLimit(500), ...(ultimo ? [startAfter(ultimo)] : [])];
    const snap = await getDocs(query(collection(db, COL), ...partes));
    if (snap.empty) break;
    leidos += snap.size;
    actualizados += await escribirCodigos(snap.docs.map(fromDoc));
    onProgreso?.(leidos, actualizados);
    ultimo = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
  await setDoc(REF_INDICES, { asientosPorCuenta: true, revisadoHasta: Timestamp.fromDate(inicio), preparadoEn: serverTimestamp() }, { merge: true });
  try { localStorage.setItem(CLAVE_LOCAL, '1'); } catch { /* sin almacenamiento */ }
  return { leidos, actualizados };
}

/**
 * Revisión de lo reciente (la hace quien puede editar asientos al abrir la conciliación): guarda
 * las cuentas en los asientos recientes que no las tengan y adelanta la marca, para que la
 * consulta de "recientes" siga siendo pequeña.
 */
export async function revisarAsientosRecientes(recientes: AsientoContable[]): Promise<void> {
  await escribirCodigos(recientes);
  await setDoc(REF_INDICES, { revisadoHasta: Timestamp.fromDate(new Date(Date.now() - MARGEN_MS)) }, { merge: true });
}

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
  limite = 300,
  opts?: { desde?: Date; hasta?: Date }
): () => void {
  // El límite se aplica en la propia consulta (fsLimit) para no cobrar
  // lecturas de TODA la colección y luego recortar en el cliente. Si se pasa
  // un rango de fechas (ej. reportes anuales) se acota ahí en vez de usar
  // solo el límite, que igual sirve de tope de seguridad.
  const constraints = [];
  if (opts?.desde) constraints.push(where('fecha', '>=', opts.desde));
  if (opts?.hasta) constraints.push(where('fecha', '<=', opts.hasta));
  constraints.push(orderBy('fecha', 'desc'), fsLimit(limite));
  const q = query(collection(db, COL), ...constraints);
  return onSnapshot(q, snap => {
    callback(snap.docs.map(fromDoc));
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
  // Antes se hacia un getDocs() de TODA la coleccion en cada asiento (venta,
  // pago, cobro...) solo para contar cuantos habia y numerar el siguiente —
  // con miles de asientos eso volvia cada operacion mas lenta y cara en
  // lecturas a medida que crecia la coleccion, y en importaciones masivas
  // (cientos de facturas seguidas) el riesgo de que una lectura fallara a
  // mitad de camino dejaba facturas sin su asiento. Ahora se usa un contador
  // atomico por año en una transaccion, sin leer la coleccion completa.
  const fechaAsiento = data.fecha instanceof Date ? data.fecha : new Date(data.fecha);
  const anio = fechaAsiento.getFullYear();
  const counterRef = doc(db, 'contadores', `asientos_${anio}`);
  const nuevoRef = doc(collection(db, COL));

  await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const siguiente = (counterSnap.exists() ? (counterSnap.data().valor as number) : 0) + 1;
    const numero = `AJ-${anio}-${String(siguiente).padStart(6, '0')}`;

    tx.set(counterRef, { valor: siguiente }, { merge: true });
    tx.set(nuevoRef, {
      ...data,
      cuentasCodigos: codigosDeLineas(data.lineas),
      numero,
      bloqueado:          data.bloqueado          ?? false,
      editadoManualmente: data.editadoManualmente ?? false,
      createdAt: serverTimestamp(),
    });
  });
  return nuevoRef.id;
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
      cuentasCodigos:     codigosDeLineas(cambios.lineas),
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

/**
 * Escala proporcionalmente el debe/haber de TODAS las líneas de un asiento
 * (ej. al corregir el monto de un cobro/pago ya registrado), preservando
 * la mezcla original de cuentas (retenciones, etc.) sin necesidad de
 * reconstruirla desde cero.
 */
export async function escalarLineasAsiento(
  id:            string,
  factor:        number,
  usuarioId:     string,
  usuarioNombre: string
): Promise<void> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) throw new Error('Asiento no encontrado');
  const asiento = fromDoc(snap);
  if (asiento.bloqueado) {
    throw new Error('No se puede editar: el período contable está cerrado.');
  }

  const nuevasLineas: AsientoLinea[] = asiento.lineas.map(l => ({
    ...l,
    debe:  Math.round(l.debe  * factor * 100) / 100,
    haber: Math.round(l.haber * factor * 100) / 100,
  }));
  const totalDebe  = nuevasLineas.reduce((s, l) => s + l.debe,  0);
  const totalHaber = nuevasLineas.reduce((s, l) => s + l.haber, 0);

  await updateDoc(doc(db, COL, id), {
    lineas: nuevasLineas,
    totalDebe,
    totalHaber,
    editadoManualmente:   true,
    updatedAt:            serverTimestamp(),
    usuarioEdicionId:     usuarioId,
    usuarioEdicionNombre: usuarioNombre,
  });
}

/**
 * Reemplaza, dentro de un asiento, todas las líneas que usan una cuenta
 * contable por otra cuenta (mismo debe/haber, solo cambia a qué cuenta
 * apunta). Se usa para reclasificar movimientos ya registrados contra el
 * banco hacia Caja General cuando el banco ya no se puede conciliar.
 * Devuelve true si alguna línea coincidía y se reclasificó.
 */
export async function reclasificarCuentaEnAsiento(
  id:                 string,
  cuentaOrigenCodigo: string,
  cuentaDestino:      { codigo: string; nombre: string; id?: string },
  usuarioId:          string,
  usuarioNombre:       string,
  /** Permite reclasificar aunque el período esté cerrado (solo cambia la cuenta, no los montos). */
  permitirCerrado = false
): Promise<boolean> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) throw new Error('Asiento no encontrado');
  const asiento = fromDoc(snap);
  if (asiento.bloqueado && !permitirCerrado) {
    throw new Error('No se puede editar: el período contable está cerrado.');
  }

  let cambio = false;
  const nuevasLineas: AsientoLinea[] = asiento.lineas.map(l => {
    if (l.cuentaCodigo !== cuentaOrigenCodigo) return l;
    cambio = true;
    return {
      ...l,
      cuentaCodigo: cuentaDestino.codigo,
      cuentaNombre: cuentaDestino.nombre,
      cuentaId:     cuentaDestino.id ?? cuentaDestino.codigo,
    };
  });
  if (!cambio) return false;

  await updateDoc(doc(db, COL, id), {
    lineas: nuevasLineas,
    cuentasCodigos:       codigosDeLineas(nuevasLineas),
    editadoManualmente:   true,
    updatedAt:            serverTimestamp(),
    usuarioEdicionId:     usuarioId,
    usuarioEdicionNombre: usuarioNombre,
  });
  return true;
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
    cuentasCodigos: codigosDeLineas(params.nuevasLineas),
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

  // Solo los asientos del mes (antes se leía toda la colección para filtrar aquí)
  const snap = await getDocs(query(collection(db, COL), where('fecha', '>=', inicio), where('fecha', '<=', fin)));
  await Promise.all(snap.docs.map(d => updateDoc(doc(db, COL, d.id), { bloqueado: bloquear })));
}

/**
 * Como reclasificarCuentaEnAsiento, pero SOLO si el asiento tiene una única línea con la cuenta de
 * origen. Si tiene varias (p. ej. un depósito: Debe Bancos / Haber Caja, que al moverse a Caja deja
 * dos líneas de Caja) no se puede saber cuál era la original: no se toca y se devuelve 'ambigua'
 * para revisarla a mano. Se usa al deshacer "mover el historial a Caja".
 */
export async function reclasificarCuentaEnAsientoSiEsUnica(
  id:                 string,
  cuentaOrigenCodigo: string,
  cuentaDestino:      { codigo: string; nombre: string; id?: string },
  usuarioId:          string,
  usuarioNombre:      string
): Promise<'ok' | 'sin_cambio' | 'ambigua'> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) throw new Error('Asiento no encontrado');
  const lineasOrigen = fromDoc(snap).lineas.filter(l => l.cuentaCodigo === cuentaOrigenCodigo);
  if (lineasOrigen.length > 1) return 'ambigua';
  const cambio = await reclasificarCuentaEnAsiento(id, cuentaOrigenCodigo, cuentaDestino, usuarioId, usuarioNombre);
  return cambio ? 'ok' : 'sin_cambio';
}
