/**
 * Migración del plan de cuentas anterior (códigos 1.1.01, 6.1.08…) al plan de la
 * Superintendencia de Compañías.
 *
 * Reescribe TODO lo que guarda un código de cuenta: asientos (incluidos los de
 * períodos cerrados), configuración contable, cuentas bancarias, activos fijos,
 * proveedores, clientes, bodegas y lotes de reclasificación. Es idempotente: lo que
 * ya tiene un código nuevo no se toca, así que puede repetirse si se interrumpe.
 */

import {
  collection, getDocs, doc, writeBatch, setDoc, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { CuentaContable, AsientoLinea } from '@/types';
import { PLAN_CUENTAS_SUPERCIAS } from '@/lib/data/plan-cuentas-supercias';
import { MAPEO_PLAN_ANTERIOR, CONFIG_CONTABLE_DEFAULT } from '@/lib/data/plan-cuentas-ecuador';
import { invalidarCacheCuentas, invalidarCacheConfigContable } from '@/lib/contabilidad/motor-asientos';

const LOTE_BATCH = 400;

/** Los códigos del plan anterior siempre llevan puntos; los de la Supercias nunca. */
export const esCodigoAnterior = (codigo?: string): boolean => !!codigo && codigo.includes('.');

// Campos con código de cuenta fuera de los asientos: colección → campos (cuenta + nombre/id asociados)
const CAMPOS_ENTIDADES: Array<{ col: string; campos: string[] }> = [
  { col: 'cuentas_bancarias', campos: ['cuentaContableCodigo'] },
  { col: 'activos_fijos',     campos: ['cuentaActivoCodigo', 'cuentaDepAcumCodigo', 'cuentaGastoDepCodigo'] },
  { col: 'proveedores',       campos: ['cuentaCxP', 'cuentaGasto', 'cuentaIVACompras'] },
  { col: 'clientes',          campos: ['cuentaCxC'] },
  { col: 'bodegas',           campos: ['cuentaInventario'] },
];

interface Snapshot {
  cuentas:   CuentaContable[];
  asientos:  Array<{ id: string; lineas: AsientoLinea[]; bloqueado?: boolean }>;
  config:    Record<string, unknown> | null;
  entidades: Record<string, Array<{ id: string; data: DocumentData }>>;
  lotes:     Array<{ id: string; data: DocumentData }>;
}

async function leerTodo(): Promise<Snapshot> {
  const leer = async (col: string) => (await getDocs(collection(db, col))).docs;
  const [cuentasD, asientosD, lotesD, ...entD] = await Promise.all([
    leer('cuentas_contables'), leer('asientos'), leer('reclasificaciones_lote'),
    ...CAMPOS_ENTIDADES.map(e => leer(e.col)),
  ]);
  const configD = (await getDocs(collection(db, 'config_contable'))).docs.find(d => d.id === 'config');
  return {
    cuentas:  cuentasD.map(d => ({ id: d.id, ...d.data() } as CuentaContable)),
    asientos: asientosD.map(d => ({ id: d.id, lineas: (d.data().lineas ?? []) as AsientoLinea[], bloqueado: d.data().bloqueado })),
    config:   configD ? (configD.data() as Record<string, unknown>) : null,
    entidades: Object.fromEntries(
      CAMPOS_ENTIDADES.map((e, i) => [e.col, entD[i].map(d => ({ id: d.id, data: d.data() }))])
    ),
    lotes: lotesD.map(d => ({ id: d.id, data: d.data() })),
  };
}

// ── Análisis ──────────────────────────────────────────────────────────────

export interface UsoCodigo {
  codigo:     string;
  nombre:     string;        // nombre de la cuenta anterior (si existe en el plan)
  lineas:     number;        // líneas de asiento que la usan
  otros:      number;        // referencias en configuración / bancos / activos / proveedores…
  destino:    string | null; // código Supercias sugerido (null = hay que elegirlo a mano)
}

export interface AnalisisMigracion {
  yaMigrado:        boolean;
  totalAsientos:    number;
  asientosAfectados: number;
  asientosCerrados: number;   // afectados que están en períodos cerrados
  usos:             UsoCodigo[];
}

function recolectarUsos(s: Snapshot): Map<string, { lineas: number; otros: number }> {
  const usos = new Map<string, { lineas: number; otros: number }>();
  const sumar = (codigo: unknown, campo: 'lineas' | 'otros') => {
    if (typeof codigo !== 'string' || !esCodigoAnterior(codigo)) return;
    const u = usos.get(codigo) ?? { lineas: 0, otros: 0 };
    u[campo]++;
    usos.set(codigo, u);
  };
  s.asientos.forEach(a => a.lineas.forEach(l => sumar(l.cuentaCodigo, 'lineas')));
  if (s.config) Object.entries(s.config).forEach(([k, v]) => { if (k.startsWith('cuenta')) sumar(v, 'otros'); });
  CAMPOS_ENTIDADES.forEach(e => s.entidades[e.col].forEach(d => e.campos.forEach(c => sumar(d.data[c], 'otros'))));
  s.lotes.forEach(l => {
    sumar(l.data.cuentaDestinoCodigo, 'otros');
    (l.data.items ?? []).forEach((i: DocumentData) => sumar(i.cuentaOrigenCodigo, 'otros'));
  });
  return usos;
}

export async function analizarMigracion(): Promise<AnalisisMigracion> {
  const s = await leerTodo();
  const usos = recolectarUsos(s);
  const nombrePorCodigo = new Map(s.cuentas.map(c => [c.codigo, c.nombre]));
  const afectados = s.asientos.filter(a => a.lineas.some(l => esCodigoAnterior(l.cuentaCodigo)));
  return {
    yaMigrado: usos.size === 0 && !s.cuentas.some(c => esCodigoAnterior(c.codigo) && c.activa !== false),
    totalAsientos: s.asientos.length,
    asientosAfectados: afectados.length,
    asientosCerrados: afectados.filter(a => a.bloqueado).length,
    usos: [...usos.entries()]
      .map(([codigo, u]) => ({
        codigo, nombre: nombrePorCodigo.get(codigo) ?? '(cuenta no encontrada en el plan)',
        ...u, destino: MAPEO_PLAN_ANTERIOR[codigo] ?? null,
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true })),
  };
}

// ── Respaldo ──────────────────────────────────────────────────────────────

/** JSON con todo lo que la migración puede modificar, para guardarlo antes de aplicar. */
export async function generarRespaldo(): Promise<string> {
  const cols = ['cuentas_contables', 'asientos', 'config_contable', 'reclasificaciones_lote',
    ...CAMPOS_ENTIDADES.map(e => e.col)];
  const salida: Record<string, Array<{ id: string; data: DocumentData }>> = {};
  for (const col of cols) {
    salida[col] = (await getDocs(collection(db, col))).docs.map(d => ({ id: d.id, data: d.data() }));
  }
  return JSON.stringify({ generado: new Date().toISOString(), colecciones: salida });
}

// ── Aplicación ────────────────────────────────────────────────────────────

export interface ResultadoMigracion {
  cuentasCreadas:    number;
  asientosActualizados: number;
  otrosActualizados: number;
  cuentasDesactivadas: number;
}

export async function aplicarMigracion(
  /** código anterior → código Supercias (sugerencias + elecciones manuales) */
  mapa: Record<string, string>,
  onProgreso?: (mensaje: string) => void
): Promise<ResultadoMigracion> {
  const s = await leerTodo();
  const codigosValidos = new Set(PLAN_CUENTAS_SUPERCIAS.map(c => c.codigo));
  const usos = recolectarUsos(s);

  for (const codigo of usos.keys()) {
    const destino = mapa[codigo];
    if (!destino || !codigosValidos.has(destino)) {
      throw new Error(`La cuenta ${codigo} no tiene un destino válido en el plan de la Supercias.`);
    }
  }

  // 1) Crear las cuentas del plan nuevo que falten
  onProgreso?.('Creando cuentas del plan de la Supercias…');
  const nuevas = new Map<string, { id: string; nombre: string }>();
  s.cuentas.filter(c => !esCodigoAnterior(c.codigo)).forEach(c => nuevas.set(c.codigo, { id: c.id, nombre: c.nombre }));
  const porCrear = PLAN_CUENTAS_SUPERCIAS.filter(c => !nuevas.has(c.codigo));
  for (let i = 0; i < porCrear.length; i += LOTE_BATCH) {
    const batch = writeBatch(db);
    porCrear.slice(i, i + LOTE_BATCH).forEach(c => {
      const ref = doc(collection(db, 'cuentas_contables'));
      batch.set(ref, { ...c, activa: true });
      nuevas.set(c.codigo, { id: ref.id, nombre: c.nombre });
    });
    await batch.commit();
  }

  const remapear = (codigo: unknown): string | null =>
    typeof codigo === 'string' && esCodigoAnterior(codigo) ? mapa[codigo] : null;

  // 2) Entidades con códigos (bancos, activos, proveedores, clientes, bodegas)
  onProgreso?.('Actualizando bancos, activos fijos, proveedores y clientes…');
  let otros = 0;
  for (const e of CAMPOS_ENTIDADES) {
    const cambios: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];
    s.entidades[e.col].forEach(d => {
      const data: Record<string, unknown> = {};
      e.campos.forEach(campo => {
        const nuevo = remapear(d.data[campo]);
        if (!nuevo) return;
        data[campo] = nuevo;
        // Bancos y activos guardan también id y nombre de la cuenta
        const base = campo.replace(/Codigo$/, '');
        if (campo.endsWith('Codigo')) {
          data[`${base}Id`] = nuevas.get(nuevo)!.id;
          if (e.col === 'cuentas_bancarias') data[`${base}Nombre`] = nuevas.get(nuevo)!.nombre;
        }
      });
      if (Object.keys(data).length) cambios.push({ col: e.col, id: d.id, data });
    });
    otros += await escribirLotes(cambios);
  }
  const cambiosLotes: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];
  s.lotes.forEach(l => {
    const dest = remapear(l.data.cuentaDestinoCodigo);
    const items = (l.data.items ?? []) as DocumentData[];
    const nuevosItems = items.map(i => {
      const o = remapear(i.cuentaOrigenCodigo);
      return o ? { ...i, cuentaOrigenCodigo: o, cuentaOrigenId: nuevas.get(o)!.id, cuentaOrigenNombre: nuevas.get(o)!.nombre } : i;
    });
    const data: Record<string, unknown> = {};
    if (dest) { data.cuentaDestinoCodigo = dest; data.cuentaDestinoNombre = nuevas.get(dest)!.nombre; }
    if (nuevosItems.some((it, k) => it !== items[k])) data.items = nuevosItems;
    if (Object.keys(data).length) cambiosLotes.push({ col: 'reclasificaciones_lote', id: l.id, data });
  });
  otros += await escribirLotes(cambiosLotes);

  // 3) Configuración contable
  onProgreso?.('Actualizando la configuración contable…');
  const config: Record<string, unknown> = { ...CONFIG_CONTABLE_DEFAULT, ...(s.config ?? {}) };
  Object.entries(config).forEach(([k, v]) => {
    if (!k.startsWith('cuenta')) return;
    const nuevo = remapear(v);
    if (nuevo) config[k] = nuevo;
  });
  config.planMigradoSupercias = true;
  await setDoc(doc(db, 'config_contable', 'config'), config);

  // 4) Asientos (también los de períodos cerrados: solo cambia la cuenta, no los montos)
  const cambiosAsientos: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];
  s.asientos.forEach(a => {
    if (!a.lineas.some(l => esCodigoAnterior(l.cuentaCodigo))) return;
    const lineas = a.lineas.map(l => {
      const nuevo = remapear(l.cuentaCodigo);
      if (!nuevo) return l;
      const c = nuevas.get(nuevo)!;
      return { ...l, cuentaCodigo: nuevo, cuentaNombre: c.nombre, cuentaId: c.id };
    });
    cambiosAsientos.push({ col: 'asientos', id: a.id, data: { lineas } });
  });
  let asientosActualizados = 0;
  for (let i = 0; i < cambiosAsientos.length; i += LOTE_BATCH) {
    onProgreso?.(`Reescribiendo asientos… ${Math.min(i + LOTE_BATCH, cambiosAsientos.length)} / ${cambiosAsientos.length}`);
    asientosActualizados += await escribirLotes(cambiosAsientos.slice(i, i + LOTE_BATCH));
  }

  // 5) Desactivar las cuentas del plan anterior (se conservan por trazabilidad)
  onProgreso?.('Desactivando el plan anterior…');
  const viejas = s.cuentas.filter(c => esCodigoAnterior(c.codigo) && c.activa !== false);
  for (let i = 0; i < viejas.length; i += LOTE_BATCH) {
    const batch = writeBatch(db);
    viejas.slice(i, i + LOTE_BATCH).forEach(c => batch.update(doc(db, 'cuentas_contables', c.id), { activa: false }));
    await batch.commit();
  }

  invalidarCacheCuentas();
  invalidarCacheConfigContable();
  return {
    cuentasCreadas: porCrear.length, asientosActualizados,
    otrosActualizados: otros, cuentasDesactivadas: viejas.length,
  };
}

async function escribirLotes(
  cambios: Array<{ col: string; id: string; data: Record<string, unknown> }>
): Promise<number> {
  for (let i = 0; i < cambios.length; i += LOTE_BATCH) {
    const batch = writeBatch(db);
    cambios.slice(i, i + LOTE_BATCH).forEach(c => batch.update(doc(db, c.col, c.id), c.data));
    await batch.commit();
  }
  return cambios.length;
}
