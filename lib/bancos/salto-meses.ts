/**
 * Salto entre el cierre de un mes y la apertura del siguiente en los propios saldos del banco.
 * Pasa cuando el banco acredita o debita algo (p. ej. un interés) después del corte y no lo incluye como
 * movimiento de ningún estado de cuenta: el cierre de abril es 5 024,74 y mayo abre con 5 024,79.
 * Ese valor no está en ningún movimiento, así que hay que registrarlo como ajuste para que los libros igualen al banco.
 */

import type { MovimientoBancario } from '@/types';
import { aFecha, cadenaDeSaldos, periodoDe } from '@/lib/bancos/conciliacion';

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Mes calendario anterior a 'yyyy-MM'. */
export function periodoAnterior(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  return periodoDe(new Date(y, m - 2, 1));
}

export function saltoEntreMeses(p: {
  periodo:     string;
  extractos:   { periodo: string; saldoAnterior: number; saldoActual: number }[];
  movimientos: MovimientoBancario[];
}): { previo: string; monto: number } | null {
  const previo = periodoAnterior(p.periodo);
  const delMes = (per: string) =>
    cadenaDeSaldos(p.movimientos.filter(m => m.estado !== 'anulado' && periodoDe(aFecha(m.fecha)) === per));

  const cierrePrevio = p.extractos.find(e => e.periodo === previo)?.saldoActual ?? delMes(previo)?.cierre ?? null;
  const aperturaMes  = p.extractos.find(e => e.periodo === p.periodo)?.saldoAnterior ?? delMes(p.periodo)?.apertura ?? null;
  if (cierrePrevio === null || aperturaMes === null) return null;

  const monto = redondear(aperturaMes - cierrePrevio);
  return Math.abs(monto) >= 0.005 ? { previo, monto } : null;
}
