/**
 * Conciliación bancaria MENSUAL (práctica contable ecuatoriana):
 *
 *   Saldo según estado de cuenta (banco) al corte
 *     + Depósitos en tránsito        (registrados en libros, aún no acreditados por el banco)
 *     − Pagos / cheques no cobrados  (registrados en libros, aún no debitados por el banco)
 *   = Saldo bancario conciliado
 *
 *   Saldo según libros (contabilidad) al corte
 *     + Créditos del banco no contabilizados (intereses, depósitos, notas de crédito)
 *     − Débitos del banco no contabilizados  (comisiones, IVA, notas de débito)
 *   = Saldo contable conciliado
 *
 * Los dos saldos conciliados deben ser iguales: la diferencia es lo que falta explicar.
 */

import type { AsientoContable, MovimientoBancario } from '@/types';
import { CUENTAS_POR_DEFECTO } from '@/lib/data/plan-cuentas-ecuador';

const redondear = (n: number) => Math.round(n * 100) / 100;
const MS_DIA = 24 * 60 * 60 * 1000;

export const aFecha = (f: unknown): Date => {
  const x = f as { toDate?: () => Date } | Date | string | number | null | undefined;
  if (x && typeof x === 'object' && 'toDate' in x && typeof x.toDate === 'function') return x.toDate();
  return x instanceof Date ? x : new Date(x as string | number);
};

export const periodoDe = (f: Date) =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;

/** Último instante del mes 'yyyy-MM'. */
export function finDePeriodo(periodo: string): Date {
  const [y, m] = periodo.split('-').map(Number);
  return new Date(y, m, 0, 23, 59, 59, 999);
}

export function inicioDePeriodo(periodo: string): Date {
  const [y, m] = periodo.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}

export interface PartidaAsiento {
  asiento: AsientoContable;
  /** Efecto neto en el banco: positivo = entra dinero, negativo = sale. */
  monto: number;
  dias:  number; // antigüedad respecto al corte
}

export interface Descuadre {
  movimiento: MovimientoBancario;
  asiento:    AsientoContable;
  montoBanco: number;
  montoLibros: number;
}

export interface ResultadoConciliacion {
  corte: Date;
  saldoLibros: number;
  depositosTransito:   PartidaAsiento[];
  pagosPendientes:     PartidaAsiento[];
  creditosNoRegistrados: MovimientoBancario[];
  debitosNoRegistrados:  MovimientoBancario[];
  /** Movimientos conciliados cuyo monto no coincide con el de su asiento. */
  descuadres: Descuadre[];
  totalTransito:   number;
  totalPendientes: number;
  totalCreditosNR: number;
  totalDebitosNR:  number;
  saldoBancoConciliado:  (saldoBanco: number) => number;
  saldoLibrosConciliado: number;
  diferencia: (saldoBanco: number) => number;
}

/** Efecto neto de un asiento sobre la cuenta contable del banco (debe − haber). */
export function netoEnCuenta(a: AsientoContable, cuentaCodigo: string): number {
  return redondear(
    a.lineas.filter(l => l.cuentaCodigo === cuentaCodigo).reduce((s, l) => s + l.debe - l.haber, 0)
  );
}

export function calcularConciliacion(p: {
  corte:        Date;
  cuentaCodigo: string;
  movimientos:  MovimientoBancario[];
  asientos:     AsientoContable[];
  /** Asientos que la contadora marcó con visto como ya reflejados por el banco (sin movimiento del PDF). */
  marcas?:      MarcaVisto[];
}): ResultadoConciliacion {
  const { corte, cuentaCodigo } = p;
  const validos = p.asientos.filter(a => a.estado !== 'borrador' && aFecha(a.fecha) <= corte);
  const porId = new Map(validos.map(a => [a.id, a]));

  // Movimientos del banco hasta el corte
  const movsHastaCorte = p.movimientos.filter(m => m.estado !== 'anulado' && aFecha(m.fecha) <= corte);

  // Asientos que el banco ya acreditó/debitó al corte
  const compensados = new Set<string>();
  const descuadres: Descuadre[] = [];
  for (const m of movsHastaCorte) {
    if (m.estado !== 'conciliado' || !m.asientoId) continue;
    compensados.add(m.asientoId);
    const a = porId.get(m.asientoId);
    if (!a) continue;
    const neto = netoEnCuenta(a, cuentaCodigo);
    const montoBanco = m.tipo === 'credito' ? m.monto : -m.monto;
    if (Math.abs(neto - montoBanco) > 0.005) {
      descuadres.push({ movimiento: m, asiento: a, montoBanco, montoLibros: neto });
    }
  }
  // Vistos puestos a mano sobre los libros: cuentan como ya reflejados por el banco desde su fecha
  for (const k of p.marcas ?? []) {
    if (aFecha(k.fechaBanco) <= corte) compensados.add(k.asientoId);
  }

  // Todo asiento contabilizado en el banco que el banco aún no refleja es una partida en tránsito
  const depositosTransito: PartidaAsiento[] = [];
  const pagosPendientes:   PartidaAsiento[] = [];
  let saldoLibros = 0;
  for (const a of validos) {
    const neto = netoEnCuenta(a, cuentaCodigo);
    if (neto === 0) continue;
    saldoLibros += neto;
    if (compensados.has(a.id)) continue;
    const dias = Math.max(0, Math.round((corte.getTime() - aFecha(a.fecha).getTime()) / MS_DIA));
    (neto > 0 ? depositosTransito : pagosPendientes).push({ asiento: a, monto: Math.abs(neto), dias });
  }
  saldoLibros = redondear(saldoLibros);
  depositosTransito.sort((x, y) => aFecha(x.asiento.fecha).getTime() - aFecha(y.asiento.fecha).getTime());
  pagosPendientes.sort((x, y) => aFecha(x.asiento.fecha).getTime() - aFecha(y.asiento.fecha).getTime());

  // Movimientos del banco que la contabilidad todavía no registra
  const sinContabilizar = movsHastaCorte.filter(m => m.estado === 'no_conciliado');
  const creditosNoRegistrados = sinContabilizar.filter(m => m.tipo === 'credito');
  const debitosNoRegistrados  = sinContabilizar.filter(m => m.tipo === 'debito');

  const suma = (xs: { monto: number }[]) => redondear(xs.reduce((s, x) => s + x.monto, 0));
  const totalTransito   = suma(depositosTransito);
  const totalPendientes = suma(pagosPendientes);
  const totalCreditosNR = suma(creditosNoRegistrados);
  const totalDebitosNR  = suma(debitosNoRegistrados);
  const saldoLibrosConciliado = redondear(saldoLibros + totalCreditosNR - totalDebitosNR);
  const saldoBancoConciliado = (saldoBanco: number) => redondear(saldoBanco + totalTransito - totalPendientes);

  return {
    corte, saldoLibros, depositosTransito, pagosPendientes,
    creditosNoRegistrados, debitosNoRegistrados, descuadres,
    totalTransito, totalPendientes, totalCreditosNR, totalDebitosNR,
    saldoBancoConciliado, saldoLibrosConciliado,
    diferencia: (saldoBanco: number) => redondear(saldoBancoConciliado(saldoBanco) - saldoLibrosConciliado),
  };
}

// ── Cruce Bancos ↔ Caja ──────────────────────────────────────────────────────

export interface CruceCaja {
  /** Créditos del banco del mes ya contabilizados contra Caja (los que salieron de Caja hacia Bancos). */
  creditosViaCaja:  number;
  nCreditosViaCaja: number;
  /** De esos, los que son depósitos de efectivo o cheques… */
  efectivo:         number;
  nEfectivo:        number;
  /** …y el resto (transferencias recibidas y otros créditos). */
  transferencias:   number;
  /** Lo que los libros registraron en el mes como salida de Caja hacia Bancos (Debe Bancos / Haber Caja). */
  trasladosCaja:    number;
  /** Libros − banco: positivo = hay salidas de Caja a Bancos en libros que ningún movimiento del banco respalda. */
  diferencia:       number;
}

/**
 * Control del efectivo: toda salida de Caja hacia Bancos que figura en libros debe estar respaldada
 * por un crédito del banco. Se compara por movimiento (no por la descripción), de modo que sirve tanto
 * si solo los depósitos pasan por Caja como si también las transferencias recibidas se llevan a Caja.
 */
export function cruceConCaja(p: {
  periodo:       string;
  cuentaCodigo:  string;
  cajaCodigo:    string;
  movimientos:   MovimientoBancario[];
  asientos:      AsientoContable[];
}): CruceCaja {
  const desde = inicioDePeriodo(p.periodo), hasta = finDePeriodo(p.periodo);
  const enMes = (f: unknown) => { const t = aFecha(f); return t >= desde && t <= hasta; };
  const cajaHaber = (a: AsientoContable) =>
    a.lineas.filter(l => l.cuentaCodigo === p.cajaCodigo).reduce((s, l) => s + l.haber - l.debe, 0);
  const porId = new Map(p.asientos.map(a => [a.id, a]));

  let creditosViaCaja = 0, nCreditosViaCaja = 0, efectivo = 0, nEfectivo = 0;
  for (const m of p.movimientos) {
    if (m.estado !== 'conciliado' || m.tipo !== 'credito' || !m.asientoId || !enMes(m.fecha)) continue;
    const a = porId.get(m.asientoId);
    if (!a || cajaHaber(a) <= 0) continue;
    creditosViaCaja += m.monto; nCreditosViaCaja++;
    if (ES_DEPOSITO_EFECTIVO.test(claveDescripcion(m.descripcion))) { efectivo += m.monto; nEfectivo++; }
  }

  let trasladosCaja = 0;
  for (const a of p.asientos) {
    if (a.estado === 'borrador' || !enMes(a.fecha)) continue;
    if (netoEnCuenta(a, p.cuentaCodigo) <= 0) continue;                // entra dinero al banco
    const caja = cajaHaber(a);
    if (caja > 0) trasladosCaja += caja;                                // …y sale de Caja
  }

  creditosViaCaja = redondear(creditosViaCaja);
  efectivo = redondear(efectivo);
  trasladosCaja = redondear(trasladosCaja);
  return {
    creditosViaCaja, nCreditosViaCaja, efectivo, nEfectivo,
    transferencias: redondear(creditosViaCaja - efectivo),
    trasladosCaja,
    diferencia: redondear(trasladosCaja - creditosViaCaja),
  };
}

// ── Emparejamiento automático movimiento del banco ↔ asiento contable ────────

export interface Emparejamiento {
  movimiento: MovimientoBancario;
  asiento:    AsientoContable;
  dias:       number;
  /** 'alta': único asiento posible; 'media': había varios del mismo monto (se eligió el más cercano en fecha). */
  confianza:  'alta' | 'media';
}

/**
 * Propone qué asiento corresponde a cada movimiento pendiente: mismo monto exacto, lado correcto
 * (crédito → entra al banco, débito → sale) y fecha dentro de la tolerancia. Cada asiento se usa una sola vez.
 */
export function proponerEmparejamientos(p: {
  movimientos:   MovimientoBancario[];
  asientos:      AsientoContable[];
  cuentaCodigo:  string;
  toleranciaDias?: number;
  /** Asientos ya marcados con visto: no se vuelven a proponer. */
  marcas?:       MarcaVisto[];
}): Emparejamiento[] {
  const tol = p.toleranciaDias ?? 10;
  const usados = new Set(p.movimientos.filter(m => m.asientoId).map(m => m.asientoId as string));
  for (const k of p.marcas ?? []) usados.add(k.asientoId);
  const libres = p.asientos
    .filter(a => a.estado !== 'borrador' && !usados.has(a.id))
    .map(a => ({ a, neto: netoEnCuenta(a, p.cuentaCodigo), t: aFecha(a.fecha).getTime() }))
    .filter(x => x.neto !== 0);

  const pendientes = p.movimientos
    .filter(m => m.estado === 'no_conciliado')
    .sort((x, y) => aFecha(x.fecha).getTime() - aFecha(y.fecha).getTime());

  const propuestas: Emparejamiento[] = [];
  const tomados = new Set<string>();
  for (const m of pendientes) {
    const objetivo = m.tipo === 'credito' ? m.monto : -m.monto;
    const tm = aFecha(m.fecha).getTime();
    const candidatos = libres
      .filter(x => !tomados.has(x.a.id) && Math.abs(x.neto - objetivo) < 0.005
        && Math.abs(x.t - tm) <= tol * MS_DIA)
      .sort((x, y) => Math.abs(x.t - tm) - Math.abs(y.t - tm) || x.t - y.t);
    if (candidatos.length === 0) continue;
    const mejor = candidatos[0];
    tomados.add(mejor.a.id);
    propuestas.push({
      movimiento: m, asiento: mejor.a,
      dias: Math.round(Math.abs(mejor.t - tm) / MS_DIA),
      confianza: candidatos.length === 1 ? 'alta' : 'media',
    });
  }
  return propuestas;
}

// ── Agrupación de movimientos repetitivos (comisiones, IVA, intereses…) ──────

export interface GrupoMovimientos {
  clave:       string;
  etiqueta:    string;
  tipo:        'credito' | 'debito';
  movimientos: MovimientoBancario[];
  total:       number;
  /** Cuenta contable sugerida para contabilizarlos todos, si la descripción lo permite. */
  sugerencia?: { codigo: string; motivo: string };
}

/** Quita códigos y números de la descripción para poder agrupar renglones equivalentes. */
export function claveDescripcion(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/\*+/g, '')
    .split(/[\s-]+/)
    .filter(t => t && !/\d/.test(t))
    .join(' ')
    .trim() || desc.toUpperCase();
}

/** Descripciones del banco que corresponden a efectivo o cheques depositados (salen de Caja). */
export const ES_DEPOSITO_EFECTIVO = /\bDEPOSITO\b|\bDEP CNB\b|\bREMESA\b/;

export function sugerirContrapartida(
  clave: string, tipo: 'credito' | 'debito',
  cuentas: { gastoComisiones: string; ivaCompras: string; interesesGanados: string; retencionFuente: string; caja: string }
): { codigo: string; motivo: string } | undefined {
  if (ES_DEPOSITO_EFECTIVO.test(clave) && tipo === 'credito')
    return { codigo: cuentas.caja, motivo: 'Depósito de efectivo o cheques que sale de Caja' };
  if (/COSTO IVA|\bIVA\b/.test(clave) && tipo === 'debito')
    return { codigo: cuentas.ivaCompras, motivo: 'IVA de la comisión bancaria (crédito tributario)' };
  if (/COMISION|COMISIÓN/.test(clave) && tipo === 'debito')
    return { codigo: cuentas.gastoComisiones, motivo: 'Comisión bancaria' };
  if (/INTERES|INTERÉS/.test(clave) && tipo === 'credito')
    return { codigo: cuentas.interesesGanados, motivo: 'Interés ganado' };
  if (/RETENCION EN LA FUENTE|RETENCIÓN EN LA FUENTE/.test(clave) && tipo === 'debito')
    return { codigo: cuentas.retencionFuente, motivo: 'Retención en la fuente sobre intereses' };
  return undefined;
}

export function agruparPendientes(
  movs: MovimientoBancario[],
  cuentas: Parameters<typeof sugerirContrapartida>[2]
): GrupoMovimientos[] {
  const grupos = new Map<string, GrupoMovimientos>();
  for (const m of movs.filter(x => x.estado === 'no_conciliado')) {
    const clave = claveDescripcion(m.descripcion);
    const k = `${m.tipo}|${clave}`;
    const g = grupos.get(k) ?? {
      clave, etiqueta: clave, tipo: m.tipo, movimientos: [], total: 0,
      sugerencia: sugerirContrapartida(clave, m.tipo, cuentas),
    };
    g.movimientos.push(m);
    g.total = redondear(g.total + m.monto);
    grupos.set(k, g);
  }
  return [...grupos.values()].sort((a, b) => b.movimientos.length - a.movimientos.length);
}

/** Cuentas con las que se sugiere contabilizar los movimientos típicos del banco. */
export const CUENTAS_SUGERIDAS = {
  gastoComisiones:  '52030201', // Gasto por servicios bancarios (subcuenta propia de 520302 Comisiones, Gastos financieros)
  ivaCompras:       CUENTAS_POR_DEFECTO.cuentaIVACompras,
  interesesGanados: CUENTAS_POR_DEFECTO.cuentaInteresesGanados,
  retencionFuente:  CUENTAS_POR_DEFECTO.cuentaRetFuenteClientes,
  caja:             CUENTAS_POR_DEFECTO.cuentaCaja,
};

// ── Libros del banco: vistos sobre los asientos de la cuenta ────────────────

/** Visto puesto a un asiento: el banco ya lo reflejó (se acreditó el depósito, se cobró el pago…). */
export interface MarcaVisto {
  asientoId:  string;
  /** Fecha desde la que el banco lo refleja; cuenta para los cortes de esa fecha en adelante. */
  fechaBanco: Date;
}

export type EstadoLibro = 'en_banco' | 'visto' | 'transito';

export interface FilaLibro {
  asiento: AsientoContable;
  /** Efecto neto en el banco: positivo = depósito/ingreso, negativo = pago/egreso. */
  monto:   number;
  estado:  EstadoLibro;
  /** 'en_banco': ya lo respalda un movimiento del estado de cuenta (no se puede desmarcar aquí). */
  movimiento?: MovimientoBancario;
  /** 'visto': visto manual puesto en el mes consultado (se puede quitar). */
  editable: boolean;
  /** Días que lleva sin reflejarse en el banco al corte. */
  dias:    number;
}

/**
 * Lista de los asientos de la cuenta del banco para conciliar el mes: los del mes y los que vienen
 * pendientes de meses anteriores. Se omiten los que el banco ya reflejó antes del mes.
 */
export function librosDelMes(p: {
  periodo:      string;
  cuentaCodigo: string;
  movimientos:  MovimientoBancario[];
  asientos:     AsientoContable[];
  marcas:       MarcaVisto[];
}): FilaLibro[] {
  const inicio = inicioDePeriodo(p.periodo), corte = finDePeriodo(p.periodo);
  const marcaPor = new Map(p.marcas.map(k => [k.asientoId, k]));
  const movPor = new Map<string, MovimientoBancario>();
  for (const m of p.movimientos) {
    if (m.estado === 'conciliado' && m.asientoId && !movPor.has(m.asientoId)) movPor.set(m.asientoId, m);
  }

  const filas: FilaLibro[] = [];
  for (const a of p.asientos) {
    if (a.estado === 'borrador' || aFecha(a.fecha) > corte) continue;
    const monto = netoEnCuenta(a, p.cuentaCodigo);
    if (monto === 0) continue;

    const mov = movPor.get(a.id);
    const marca = marcaPor.get(a.id);
    const fechaMov = mov ? aFecha(mov.fecha) : undefined;
    const fechaMarca = marca ? aFecha(marca.fechaBanco) : undefined;

    // Ya reflejado por el banco antes del mes: no es parte de esta conciliación
    if ((fechaMov && fechaMov < inicio) || (fechaMarca && fechaMarca < inicio)) continue;

    let estado: EstadoLibro = 'transito';
    if (fechaMov && fechaMov <= corte) estado = 'en_banco';
    else if (fechaMarca && fechaMarca <= corte) estado = 'visto';

    filas.push({
      asiento: a, monto, estado,
      movimiento: estado === 'en_banco' ? mov : undefined,
      editable: estado !== 'en_banco',
      dias: Math.max(0, Math.round((corte.getTime() - aFecha(a.fecha).getTime()) / MS_DIA)),
    });
  }
  return filas.sort((x, y) => aFecha(x.asiento.fecha).getTime() - aFecha(y.asiento.fecha).getTime());
}

// ── Saldo del banco al corte ────────────────────────────────────────────────

/**
 * Saldo del banco al corte: el que declara el estado de cuenta; si ese mes no se guardó, se calcula con
 * los movimientos (y el saldo inicial de la cuenta, salvo que ya esté registrado como movimiento).
 */
export function saldoBancoAlCorte(p: {
  extracto?:           { saldoActual: number } | null;
  movimientos:         MovimientoBancario[];
  corte:               Date;
  saldoInicialCuenta:  number;
  aperturaRegistrada:  boolean;
}): { valor: number; desdeEstadoCuenta: boolean } {
  if (p.extracto) return { valor: p.extracto.saldoActual, desdeEstadoCuenta: true };
  const base = p.aperturaRegistrada ? 0 : p.saldoInicialCuenta;
  const neto = p.movimientos
    .filter(m => m.estado !== 'anulado' && aFecha(m.fecha) <= p.corte)
    .reduce((s, m) => s + (m.tipo === 'credito' ? m.monto : -m.monto), base);
  return { valor: redondear(neto), desdeEstadoCuenta: false };
}
