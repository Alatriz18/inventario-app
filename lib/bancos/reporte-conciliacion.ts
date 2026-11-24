/**
 * Reporte de conciliaciones bancarias: resumen mes a mes de una cuenta y detalle de un mes,
 * con los mismos cálculos de la pantalla de conciliación (no se duplica la lógica).
 */

import type { AsientoContable, ConciliacionBancaria, ExtractoBancario, MovimientoBancario } from '@/types';
import {
  aFecha, calcularConciliacion, finDePeriodo, inicioDePeriodo, periodoDe, saldoBancoAlCorte,
  type MarcaVisto, type ResultadoConciliacion,
} from '@/lib/bancos/conciliacion';

export type EstadoMes = 'cerrada' | 'cuadra' | 'diferencia';

export interface FilaResumen {
  periodo:    string;
  estado:     EstadoMes;
  corte:      Date;
  saldoBanco: number;
  /** El saldo del banco viene del estado de cuenta guardado (true) o se calculó con los movimientos (false). */
  conEstadoCuenta: boolean;
  depositosTransito: number;
  nDepositosTransito: number;
  pagosPendientes:   number;
  nPagosPendientes:  number;
  saldoBancoConciliado: number;
  saldoLibros:  number;
  creditosNoRegistrados: number;
  debitosNoRegistrados:  number;
  saldoLibrosConciliado: number;
  diferencia:   number;
  /** Movimientos del banco del mes y cuántos siguen sin contabilizar. */
  movimientosMes: number;
  pendientesMes:  number;
  cierre?:        ConciliacionBancaria;
  /** Está cerrada pero hoy los números ya no son los del cierre (se editó algo después). */
  cambioDespuesDelCierre: boolean;
}

export interface DatosConciliacion {
  cuentaCodigo:       string;
  saldoInicialCuenta: number;
  movimientos:        MovimientoBancario[];
  asientos:           AsientoContable[];
  marcas:             MarcaVisto[];
  extractos:          ExtractoBancario[];
  cierres:            ConciliacionBancaria[];
}

export interface DetalleMes {
  fila: FilaResumen;
  conc: ResultadoConciliacion;
}

/** Meses con movimientos o estado de cuenta, de más antiguo a más reciente. */
export function periodosConDatos(movimientos: MovimientoBancario[], extractos: ExtractoBancario[]): string[] {
  const s = new Set<string>();
  movimientos.filter(m => m.estado !== 'anulado').forEach(m => s.add(periodoDe(aFecha(m.fecha))));
  extractos.forEach(e => s.add(e.periodo));
  return [...s].sort();
}

export function detalleMes(periodo: string, d: DatosConciliacion): DetalleMes {
  const corte = finDePeriodo(periodo);
  const inicio = inicioDePeriodo(periodo);
  const extracto = d.extractos.find(e => e.periodo === periodo);
  const cierre = d.cierres.find(c => c.periodo === periodo);
  const aperturaRegistrada = d.movimientos.some(m => m.tipoDocumento === 'saldo_inicial' && m.estado !== 'anulado');

  const saldo = saldoBancoAlCorte({
    extracto, movimientos: d.movimientos, corte,
    saldoInicialCuenta: d.saldoInicialCuenta, aperturaRegistrada,
  });
  const conc = calcularConciliacion({
    corte, cuentaCodigo: d.cuentaCodigo, movimientos: d.movimientos, asientos: d.asientos, marcas: d.marcas,
  });
  const diferencia = conc.diferencia(saldo.valor);

  const delMes = d.movimientos.filter(m => {
    if (m.estado === 'anulado') return false;
    const f = aFecha(m.fecha);
    return f >= inicio && f <= corte;
  });

  const cambio = !!cierre && (
    Math.abs(cierre.saldoLibros - conc.saldoLibros) >= 0.005 ||
    Math.abs(cierre.saldoBanco - saldo.valor) >= 0.005
  );

  const fila: FilaResumen = {
    periodo, corte,
    estado: cierre ? 'cerrada' : Math.abs(diferencia) < 0.005 ? 'cuadra' : 'diferencia',
    saldoBanco: saldo.valor, conEstadoCuenta: saldo.desdeEstadoCuenta,
    depositosTransito: conc.totalTransito, nDepositosTransito: conc.depositosTransito.length,
    pagosPendientes: conc.totalPendientes, nPagosPendientes: conc.pagosPendientes.length,
    saldoBancoConciliado: conc.saldoBancoConciliado(saldo.valor),
    saldoLibros: conc.saldoLibros,
    creditosNoRegistrados: conc.totalCreditosNR, debitosNoRegistrados: conc.totalDebitosNR,
    saldoLibrosConciliado: conc.saldoLibrosConciliado,
    diferencia,
    movimientosMes: delMes.length,
    pendientesMes: delMes.filter(m => m.estado === 'no_conciliado').length,
    cierre, cambioDespuesDelCierre: cambio,
  };
  return { fila, conc };
}

/** Una fila por mes, del más reciente al más antiguo. */
export function resumenConciliaciones(d: DatosConciliacion): FilaResumen[] {
  return periodosConDatos(d.movimientos, d.extractos)
    .map(p => detalleMes(p, d).fila)
    .reverse();
}
