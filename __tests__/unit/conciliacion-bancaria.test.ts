import { describe, it, expect } from 'vitest';
import type { AsientoContable, MovimientoBancario } from '@/types';
import {
  calcularConciliacion, proponerEmparejamientos, agruparPendientes, claveDescripcion, cruceConCaja,
  finDePeriodo, periodoDe,
} from '@/lib/bancos/conciliacion';

const BANCO = '1010102';
const d = (s: string) => new Date(`${s}T12:00:00`);

const asiento = (id: string, fecha: string, debe: number, haber: number): AsientoContable => ({
  id, fecha: d(fecha), concepto: id, tipo: 'manual', estado: 'confirmado', bloqueado: false,
  editadoManualmente: false, usuarioId: 'u', usuarioNombre: 'u', createdAt: d(fecha),
  totalDebe: debe || haber, totalHaber: debe || haber,
  lineas: [
    { cuentaCodigo: BANCO, cuentaNombre: 'Banco', debe, haber, descripcion: '' },
    { cuentaCodigo: '999', cuentaNombre: 'Otra', debe: haber, haber: debe, descripcion: '' },
  ],
} as unknown as AsientoContable);

const mov = (id: string, fecha: string, tipo: 'credito' | 'debito', monto: number,
  estado: MovimientoBancario['estado'], asientoId?: string, descripcion = id): MovimientoBancario => ({
  id, cuentaBancariaId: 'c1', fecha: d(fecha), descripcion, tipo, monto, estado, asientoId,
  createdAt: d(fecha),
} as MovimientoBancario);

describe('calcularConciliacion', () => {
  const asientos = [
    asiento('A1', '2026-07-02', 100, 0),   // depósito ya acreditado por el banco
    asiento('A2', '2026-07-30', 0, 50),    // pago girado, el banco aún no lo debita
    asiento('A3', '2026-07-31', 200, 0),   // depósito en tránsito
    asiento('A4', '2026-08-05', 999, 0),   // posterior al corte: no cuenta
  ];
  const movimientos = [
    mov('m1', '2026-07-03', 'credito', 100, 'conciliado', 'A1'),
    mov('m2', '2026-07-15', 'debito', 0.36, 'no_conciliado'),   // comisión sin contabilizar
    mov('m3', '2026-07-31', 'credito', 0.06, 'no_conciliado'),  // interés sin contabilizar
  ];
  const corte = finDePeriodo('2026-07');

  it('arma las partidas conciliatorias y la diferencia queda en cero', () => {
    const r = calcularConciliacion({ corte, cuentaCodigo: BANCO, movimientos, asientos });
    expect(r.saldoLibros).toBe(250);
    expect(r.totalTransito).toBe(200);
    expect(r.totalPendientes).toBe(50);
    expect(r.totalCreditosNR).toBe(0.06);
    expect(r.totalDebitosNR).toBe(0.36);
    const saldoBanco = 99.7; // 100 − 0.36 + 0.06
    expect(r.saldoBancoConciliado(saldoBanco)).toBe(249.7);
    expect(r.saldoLibrosConciliado).toBe(249.7);
    expect(r.diferencia(saldoBanco)).toBe(0);
    expect(r.descuadres).toHaveLength(0);
  });

  it('muestra la diferencia cuando el saldo del banco no cuadra', () => {
    const r = calcularConciliacion({ corte, cuentaCodigo: BANCO, movimientos, asientos });
    expect(r.diferencia(100)).toBe(0.3);
  });

  it('detecta un movimiento conciliado con un asiento de otro monto', () => {
    const malos = [mov('m1', '2026-07-03', 'credito', 90, 'conciliado', 'A1')];
    const r = calcularConciliacion({ corte, cuentaCodigo: BANCO, movimientos: malos, asientos });
    expect(r.descuadres).toHaveLength(1);
    expect(r.descuadres[0]).toMatchObject({ montoBanco: 90, montoLibros: 100 });
  });

  it('un asiento conciliado con un movimiento posterior al corte sigue en tránsito', () => {
    const tarde = [mov('m1', '2026-08-03', 'credito', 100, 'conciliado', 'A1')];
    const r = calcularConciliacion({ corte, cuentaCodigo: BANCO, movimientos: tarde, asientos });
    expect(r.depositosTransito.map(p => p.asiento.id)).toContain('A1');
  });
});

describe('proponerEmparejamientos', () => {
  const asientos = [asiento('A3', '2026-07-31', 200, 0), asiento('A9', '2026-07-01', 0, 75)];

  it('empareja por monto exacto, lado correcto y cercanía de fecha', () => {
    const pend = [
      mov('m4', '2026-08-02', 'credito', 200, 'no_conciliado'),
      mov('m5', '2026-07-03', 'debito', 75, 'no_conciliado'),
      mov('m6', '2026-07-03', 'credito', 75, 'no_conciliado'), // lado equivocado: no debe emparejar
    ];
    const r = proponerEmparejamientos({ movimientos: pend, asientos, cuentaCodigo: BANCO });
    expect(r.map(x => [x.movimiento.id, x.asiento.id])).toEqual([['m5', 'A9'], ['m4', 'A3']]);
    expect(r.every(x => x.confianza === 'alta')).toBe(true);
  });

  it('no usa un asiento dos veces ni se sale de la tolerancia de fechas', () => {
    const pend = [
      mov('a', '2026-08-02', 'credito', 200, 'no_conciliado'),
      mov('b', '2026-08-03', 'credito', 200, 'no_conciliado'),
      mov('c', '2026-09-30', 'debito', 75, 'no_conciliado'),
    ];
    const r = proponerEmparejamientos({ movimientos: pend, asientos, cuentaCodigo: BANCO });
    expect(r).toHaveLength(1);
    expect(r[0].movimiento.id).toBe('a');
  });
});

describe('agruparPendientes', () => {
  const cuentas = { gastoComisiones: '520302', ivaCompras: '101050101', interesesGanados: '4302', retencionFuente: '101050201', caja: '1010101' };

  it('agrupa por descripción sin códigos y sugiere la cuenta de comisiones, IVA e intereses', () => {
    const pend = [
      mov('1', '2026-07-06', 'debito', 0.36, 'no_conciliado', undefined, '**2607040DIWOP-COMISION-PAG-1793225803001'),
      mov('2', '2026-07-08', 'debito', 0.36, 'no_conciliado', undefined, '**2607080DM0U1-COMISION-PAG-1793225803001'),
      mov('3', '2026-07-06', 'debito', 0.05, 'no_conciliado', undefined, 'COSTO IVA CASH'),
      mov('4', '2026-07-31', 'credito', 0.06, 'no_conciliado', undefined, 'INTERES A SU FAVOR'),
      mov('5', '2026-07-01', 'credito', 1000, 'no_conciliado', undefined, 'TRANSFERENCIA INTERNET'),
    ];
    const g = agruparPendientes(pend, cuentas);
    const por = (clave: string) => g.find(x => x.clave === clave)!;
    expect(por('COMISION PAG').movimientos).toHaveLength(2);
    expect(por('COMISION PAG').sugerencia?.codigo).toBe('520302');
    expect(por('COSTO IVA CASH').sugerencia?.codigo).toBe('101050101');
    expect(por('INTERES A SU FAVOR').sugerencia?.codigo).toBe('4302');
    expect(por('TRANSFERENCIA INTERNET').sugerencia).toBeUndefined(); // un cobro de cliente no se adivina
    expect(g.length).toBe(4); // las dos comisiones forman un solo grupo
  });

  it('claveDescripcion ignora ids y números', () => {
    expect(claveDescripcion('2607060DJLAH-DISTRIBU-PAG-CELYASA')).toBe('DISTRIBU PAG CELYASA');
    expect(periodoDe(new Date(2026, 0, 31))).toBe('2026-01');
  });
});

describe('depósitos y cruce con Caja', () => {
  const cuentas = { gastoComisiones: '520302', ivaCompras: '101050101', interesesGanados: '4302', retencionFuente: '101050201', caja: '1010101' };

  it('los depósitos de efectivo se sugieren contra Caja', () => {
    const pend = [
      mov('1', '2026-07-03', 'credito', 520, 'no_conciliado', undefined, 'DEPOSITO 6386'),
      mov('2', '2026-07-03', 'credito', 21.1, 'no_conciliado', undefined, 'DEP CNB 1719924357003'),
    ];
    const g = agruparPendientes(pend, cuentas);
    expect(g.find(x => x.clave === 'DEPOSITO')?.sugerencia?.codigo).toBe('1010101');
    expect(g.find(x => x.clave === 'DEP CNB')?.sugerencia?.codigo).toBe('1010101');
  });

  it('compara los depósitos del banco con lo que los libros sacaron de Caja', () => {
    const traslado = {
      ...asiento('T1', '2026-07-03', 500, 0),
      lineas: [
        { cuentaCodigo: BANCO, cuentaNombre: 'Banco', debe: 500, haber: 0, descripcion: '' },
        { cuentaCodigo: '1010101', cuentaNombre: 'Caja', debe: 0, haber: 500, descripcion: '' },
      ],
    } as unknown as AsientoContable;
    const movimientos = [
      mov('d1', '2026-07-03', 'credito', 520, 'no_conciliado', undefined, 'DEPOSITO 6386'),
      mov('d2', '2026-07-10', 'credito', 1000, 'no_conciliado', undefined, 'TRANSFERENCIA INTERNET'), // no es efectivo
    ];
    const r = cruceConCaja({ periodo: '2026-07', cuentaCodigo: BANCO, cajaCodigo: '1010101', movimientos, asientos: [traslado] });
    expect(r).toMatchObject({ depositosBanco: 520, nDepositosBanco: 1, trasladosCaja: 500, diferencia: 20 });
  });
});
