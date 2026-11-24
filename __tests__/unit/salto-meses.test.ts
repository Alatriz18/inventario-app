import { describe, it, expect } from 'vitest';
import type { MovimientoBancario } from '@/types';
import { saltoEntreMeses, periodoAnterior } from '@/lib/bancos/salto-meses';

const fila = (fecha: string, tipo: 'credito' | 'debito', monto: number, saldo: number): MovimientoBancario =>
  ({ id: fecha + monto, cuentaBancariaId: 'c1', fecha: new Date(`${fecha}T12:00:00`), descripcion: 'x', tipo, monto, saldo, estado: 'conciliado', createdAt: new Date() }) as MovimientoBancario;

describe('saltoEntreMeses (caso real: abril cerró 5024.74 y mayo abrió 5024.79)', () => {
  it('con los estados de cuenta guardados detecta los $0.05', () => {
    const extractos = [
      { periodo: '2026-04', saldoAnterior: 3821.6, saldoActual: 5024.74 },
      { periodo: '2026-05', saldoAnterior: 5024.79, saldoActual: 9512.31 },
    ];
    expect(saltoEntreMeses({ periodo: '2026-05', extractos, movimientos: [] })).toEqual({ previo: '2026-04', monto: 0.05 });
  });

  it('sin estados de cuenta lo lee de los saldos de los movimientos de cada mes', () => {
    const movimientos = [
      fila('2026-04-10', 'credito', 100, 5024.74),                // abril cierra en 5024.74 (abrió en 4924.74)
      fila('2026-05-05', 'credito', 100, 5124.79),                // mayo abre en 5024.79
    ];
    expect(saltoEntreMeses({ periodo: '2026-05', extractos: [], movimientos })).toEqual({ previo: '2026-04', monto: 0.05 });
  });

  it('un cargo posterior al corte da un salto negativo', () => {
    const extractos = [
      { periodo: '2026-03', saldoAnterior: 0, saldoActual: 1000 },
      { periodo: '2026-04', saldoAnterior: 999.64, saldoActual: 1500 },
    ];
    expect(saltoEntreMeses({ periodo: '2026-04', extractos, movimientos: [] })).toEqual({ previo: '2026-03', monto: -0.36 });
  });

  it('si los meses encadenan no hay salto, y si falta información tampoco se inventa', () => {
    const encadenan = [
      { periodo: '2026-01', saldoAnterior: 10, saldoActual: 779.26 },
      { periodo: '2026-02', saldoAnterior: 779.26, saldoActual: 5804.01 },
    ];
    expect(saltoEntreMeses({ periodo: '2026-02', extractos: encadenan, movimientos: [] })).toBeNull();
    expect(saltoEntreMeses({ periodo: '2026-02', extractos: [], movimientos: [] })).toBeNull();
  });

  it('el mes anterior de enero es diciembre del año anterior', () => {
    expect(periodoAnterior('2026-01')).toBe('2025-12');
    expect(periodoAnterior('2026-05')).toBe('2026-04');
  });
});
