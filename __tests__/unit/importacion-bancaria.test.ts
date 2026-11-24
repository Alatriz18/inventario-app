import { describe, it, expect } from 'vitest';
import type { MovimientoBancario } from '@/types';
import type { MovimientoPDF } from '@/lib/bancos/estado-cuenta-pichincha';
import { planificarImportacion } from '@/lib/bancos/importacion';

const pdf = (fecha: string, documento: string, credito: number, debito = 0): MovimientoPDF => ({
  fecha: new Date(`${fecha}T12:00:00`), oficina: '12', documento, descripcion: 'TRANSFERENCIA INTERNET',
  debito, credito, saldo: 0, saldoOk: true,
});

// Firestore devuelve las fechas como Timestamp (objeto con toDate), no como Date
const timestamp = (fecha: string) => ({ toDate: () => new Date(`${fecha}T12:00:00`) });

const existente = (fecha: unknown, referencia: string, tipo: 'credito' | 'debito', monto: number,
  estado: MovimientoBancario['estado'] = 'conciliado') =>
  ({ id: 'x', cuentaBancariaId: 'c1', fecha, descripcion: 'x', tipo, monto, referencia, estado, createdAt: new Date() }) as unknown as MovimientoBancario;

describe('planificarImportacion', () => {
  const movimientosPdf = [pdf('2026-01-05', '111', 483), pdf('2026-01-06', '222', 0, 1600), pdf('2026-01-07', '333', 50)];

  it('con movimientos existentes cuyas fechas son Timestamp de Firestore NO falla y detecta los repetidos', () => {
    const existentes = [
      existente(timestamp('2026-01-05'), '111', 'credito', 483),
      existente(timestamp('2026-01-06'), '222', 'debito', 1600),
    ];
    const r = planificarImportacion({ movimientosPdf, existentes, cuentaBancariaId: 'c1' });
    expect(r.yaRegistrados).toBe(2);
    expect(r.nuevos.map(n => n.referencia)).toEqual(['333']);
  });

  it('también funciona si las fechas existentes ya son Date', () => {
    const existentes = [existente(new Date('2026-01-07T12:00:00'), '333', 'credito', 50)];
    const r = planificarImportacion({ movimientosPdf, existentes, cuentaBancariaId: 'c1' });
    expect(r.yaRegistrados).toBe(1);
    expect(r.nuevos).toHaveLength(2);
  });

  it('un movimiento existente con fecha dañada no rompe la importación', () => {
    const existentes = [existente(undefined, '111', 'credito', 483), existente('basura', '222', 'debito', 1600)];
    expect(() => planificarImportacion({ movimientosPdf, existentes, cuentaBancariaId: 'c1' })).not.toThrow();
  });

  it('un movimiento anulado no cuenta como ya registrado', () => {
    const existentes = [existente(timestamp('2026-01-05'), '111', 'credito', 483, 'anulado')];
    const r = planificarImportacion({ movimientosPdf, existentes, cuentaBancariaId: 'c1' });
    expect(r.yaRegistrados).toBe(0);
    expect(r.nuevos).toHaveLength(3);
  });

  it('los nuevos quedan pendientes, ordenados por fecha y con débito/crédito correctos', () => {
    const r = planificarImportacion({ movimientosPdf, existentes: [], cuentaBancariaId: 'c1' });
    expect(r.nuevos.map(n => [n.referencia, n.tipo, n.monto, n.estado])).toEqual([
      ['111', 'credito', 483, 'no_conciliado'],
      ['222', 'debito', 1600, 'no_conciliado'],
      ['333', 'credito', 50, 'no_conciliado'],
    ]);
  });
});
