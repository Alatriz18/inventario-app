/**
 * Prepara la importación del estado de cuenta: separa los movimientos del PDF en nuevos y ya registrados.
 * Un movimiento ya está registrado si coincide en fecha, documento, tipo y monto con uno existente.
 */

import type { MovimientoBancario } from '@/types';
import type { MovimientoPDF } from '@/lib/bancos/estado-cuenta-pichincha';
import { aFecha } from '@/lib/bancos/conciliacion';

export type MovimientoNuevo = Omit<MovimientoBancario, 'id' | 'createdAt'>;

const pad = (n: number) => String(n).padStart(2, '0');

/** Clave del día en hora local; devuelve null si la fecha no es válida (nunca lanza). */
function claveDia(fecha: Date): string | null {
  return Number.isNaN(fecha.getTime()) ? null : `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

const clave = (fecha: Date, doc: string, tipo: string, monto: number): string | null => {
  const dia = claveDia(fecha);
  return dia === null ? null : `${dia}|${doc}|${tipo}|${monto.toFixed(2)}`;
};

export function planificarImportacion(p: {
  movimientosPdf:   MovimientoPDF[];
  /** Movimientos que la cuenta ya tiene (las fechas pueden venir como Timestamp de Firestore). */
  existentes:       MovimientoBancario[];
  cuentaBancariaId: string;
}): { nuevos: MovimientoNuevo[]; yaRegistrados: number } {
  const existentes = new Set<string>();
  for (const m of p.existentes) {
    if (m.estado === 'anulado') continue;
    const k = clave(aFecha(m.fecha), m.referencia ?? '', m.tipo, m.monto);
    if (k) existentes.add(k);
  }

  const nuevos: MovimientoNuevo[] = [];
  let yaRegistrados = 0;
  for (const mv of p.movimientosPdf) {
    const tipo  = mv.debito > 0 ? 'debito' : 'credito';
    const monto = mv.debito > 0 ? mv.debito : mv.credito;
    if (monto <= 0) continue;
    const k = clave(mv.fecha, mv.documento, tipo, monto);
    if (k && existentes.has(k)) { yaRegistrados++; continue; }
    nuevos.push({
      cuentaBancariaId: p.cuentaBancariaId, fecha: mv.fecha, descripcion: mv.descripcion, tipo, monto,
      saldo: mv.saldo, referencia: mv.documento, oficina: mv.oficina, estado: 'no_conciliado',
    });
  }
  nuevos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  return { nuevos, yaRegistrados };
}
