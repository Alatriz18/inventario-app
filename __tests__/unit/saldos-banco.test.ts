import { describe, it, expect } from 'vitest';
import type { AsientoContable, MovimientoBancario } from '@/types';
import {
  cadenaDeSaldos, saldoBancoAlCorte, calcularConciliacion, librosDelMes, finDePeriodo,
} from '@/lib/bancos/conciliacion';
import { aperturaDelBanco } from '@/lib/bancos/diagnostico-apertura';

const BANCO = '1010102';
const d = (s: string) => new Date(`${s}T12:00:00`);

// Movimiento de un estado de cuenta del banco: trae el saldo que queda después de él
const fila = (id: string, fecha: string, tipo: 'credito' | 'debito', monto: number, saldo: number,
  extra: Partial<MovimientoBancario> = {}): MovimientoBancario =>
  ({ id, cuentaBancariaId: 'c1', fecha: d(fecha), descripcion: id, tipo, monto, saldo, estado: 'conciliado', createdAt: d(fecha), ...extra }) as MovimientoBancario;

const asiento = (id: string, fecha: string, debe: number, haber: number, concepto = id): AsientoContable => ({
  id, numero: id, fecha: d(fecha), concepto, tipo: 'manual', estado: 'confirmado', bloqueado: false,
  editadoManualmente: false, usuarioId: 'u', usuarioNombre: 'u', createdAt: d(fecha),
  totalDebe: debe || haber, totalHaber: debe || haber,
  lineas: [
    { cuentaCodigo: BANCO, cuentaNombre: 'Banco', debe, haber, descripcion: '' },
    { cuentaCodigo: '999', cuentaNombre: 'Otra', debe: haber, haber: debe, descripcion: '' },
  ],
} as unknown as AsientoContable);

describe('cadenaDeSaldos', () => {
  // Banco abre con 100: +50 → 150, −30 → 120, interés +0.06 → 120.06
  const base = [
    fila('a', '2026-01-02', 'credito', 50, 150),
    fila('b', '2026-01-03', 'debito', 30, 120),
    fila('c', '2026-01-31', 'credito', 0.06, 120.06),
  ];

  it('lee la apertura y el cierre del banco sin importar el orden de los movimientos', () => {
    expect(cadenaDeSaldos(base)).toEqual({ apertura: 100, cierre: 120.06 });
    expect(cadenaDeSaldos([...base].reverse())).toEqual({ apertura: 100, cierre: 120.06 });
  });

  it('si falta un movimiento la cadena se rompe y no se inventa un saldo', () => {
    expect(cadenaDeSaldos([base[0], base[2]])).toBeNull();
  });

  it('ignora los movimientos anulados y los registrados a mano (no traen saldo del banco)', () => {
    const manual = fila('m', '2026-01-10', 'credito', 999, 0, { tipoDocumento: 'saldo_inicial', saldo: undefined });
    const anulado = fila('x', '2026-01-11', 'debito', 5, 1, { estado: 'anulado' });
    expect(cadenaDeSaldos([...base, manual, anulado])).toEqual({ apertura: 100, cierre: 120.06 });
  });

  it('sin movimientos o con saldos vacíos devuelve null', () => {
    expect(cadenaDeSaldos([])).toBeNull();
    expect(cadenaDeSaldos([fila('s', '2026-01-02', 'credito', 5, 0, { saldo: undefined })])).toBeNull();
  });
});

describe('saldoBancoAlCorte con la cadena de saldos del banco', () => {
  const enero = [
    fila('e1', '2026-01-05', 'credito', 483, 4852.82),    // el banco abrió enero con 4369.82
    fila('e2', '2026-01-20', 'debito', 4073.56, 779.26),  // y lo cerró en 779.26
  ];

  it('sin estado de cuenta guardado toma el cierre de los saldos del propio banco, no un cálculo', () => {
    const r = saldoBancoAlCorte({
      movimientos: enero, corte: finDePeriodo('2026-01'),
      saldoInicialCuenta: 4359.82, aperturaRegistrada: false, // el saldo de la cuenta estaba $10 mal
    });
    expect(r).toMatchObject({ valor: 779.26, origen: 'saldos_del_banco' });
  });

  it('el estado de cuenta guardado tiene prioridad', () => {
    const r = saldoBancoAlCorte({ extracto: { saldoActual: 779.26 }, movimientos: enero, corte: finDePeriodo('2026-01'), saldoInicialCuenta: 0, aperturaRegistrada: false });
    expect(r.origen).toBe('estado_de_cuenta');
  });

  it('un salto entre meses del banco no afecta: cada mes se lee solo con sus movimientos', () => {
    const marzo = [fila('m1', '2026-03-02', 'credito', 100, 5024.79), fila('m2', '2026-03-09', 'credito', 50, 5074.79)];
    // el mes anterior cerró en 5024.74: hay un salto de 0.05 hacia marzo
    const r = saldoBancoAlCorte({ movimientos: [...enero, ...marzo], corte: finDePeriodo('2026-03'), saldoInicialCuenta: 0, aperturaRegistrada: false });
    expect(r).toMatchObject({ valor: 5074.79, origen: 'saldos_del_banco' });
  });

  it('si los movimientos no traen saldos, cae al cálculo y lo indica', () => {
    const sinSaldo = [fila('s1', '2026-01-05', 'credito', 50, 0, { saldo: undefined })];
    const r = saldoBancoAlCorte({ movimientos: sinSaldo, corte: finDePeriodo('2026-01'), saldoInicialCuenta: 100, aperturaRegistrada: false });
    expect(r).toMatchObject({ valor: 150, origen: 'calculado' });
  });
});

describe('aperturaDelBanco con los saldos de los movimientos', () => {
  const enero = [fila('e1', '2026-01-05', 'credito', 483, 4852.82), fila('e2', '2026-01-20', 'debito', 4073.56, 779.26)];

  it('sin el estado de cuenta de enero toma la apertura de los saldos de enero: 4369.82', () => {
    expect(aperturaDelBanco([{ periodo: '2026-02', saldoAnterior: 779.26 }], '2026-01', enero)).toBe(4369.82);
  });

  it('con el estado de cuenta guardado manda ese', () => {
    expect(aperturaDelBanco([{ periodo: '2026-01', saldoAnterior: 4369.82 }], '2026-01', [])).toBe(4369.82);
  });
});

describe('excluir un asiento de la conciliación (el asiento de apertura general de $10 000)', () => {
  const corte = finDePeriodo('2026-01');
  // Saldo inicial del banco registrado (4369.82) + el movimiento neto de enero (−3590.56) = 779.26
  const movimientos = [
    fila('ap', '2026-01-01', 'credito', 4369.82, 0, { tipoDocumento: 'saldo_inicial', saldo: undefined, asientoId: 'A0' }),
    fila('mes', '2026-01-15', 'debito', 3590.56, 779.26, { asientoId: 'A1' }),
  ];
  const asientos = [
    asiento('A0', '2026-01-01', 4369.82, 0, 'Saldo inicial del banco'),
    asiento('A1', '2026-01-15', 0, 3590.56),
    asiento('AP', '2026-01-01', 10000, 0, 'Asiento de apertura 2026'),
  ];
  const excluir = [{ asientoId: 'AP', tipo: 'excluida' as const, fechaBanco: corte }];

  it('sin excluir, el apertura de $10 000 queda en tránsito y los libros no igualan al banco', () => {
    const r = calcularConciliacion({ corte, cuentaCodigo: BANCO, movimientos, asientos });
    expect(r.saldoLibros).toBe(10779.26);
    expect(r.depositosTransito.map(p => p.asiento.id)).toEqual(['AP']);
  });

  it('excluido, no cuenta en libros ni en tránsito: libros = banco = 779.26 y la diferencia es cero', () => {
    const r = calcularConciliacion({ corte, cuentaCodigo: BANCO, movimientos, asientos, marcas: excluir });
    expect(r.saldoLibros).toBe(779.26);
    expect(r.depositosTransito).toEqual([]);
    expect(r.diferencia(779.26)).toBe(0);
    expect(r.excluidos.map(x => [x.asiento.id, x.monto])).toEqual([['AP', 10000]]); // queda documentado
  });

  it('en la lista de libros aparece como excluido (se puede volver a incluir)', () => {
    const filas = librosDelMes({ periodo: '2026-01', cuentaCodigo: BANCO, movimientos, asientos, marcas: excluir });
    expect(filas.find(f => f.asiento.id === 'AP')).toMatchObject({ estado: 'excluida', editable: true });
  });

  it('un visto normal y uno excluido no se confunden', () => {
    const marcas = [
      { asientoId: 'AP', tipo: 'excluida' as const, fechaBanco: corte },
      { asientoId: 'A9', tipo: 'visto' as const, fechaBanco: corte },
    ];
    const r = calcularConciliacion({ corte, cuentaCodigo: BANCO, movimientos, asientos: [...asientos, asiento('A9', '2026-01-20', 7, 0)], marcas });
    expect(r.depositosTransito).toEqual([]);   // A9 ya lo reflejó el banco (visto)
    expect(r.saldoLibros).toBe(786.26);        // 779.26 + 7 (A9 sigue en libros); AP fuera
  });
});
