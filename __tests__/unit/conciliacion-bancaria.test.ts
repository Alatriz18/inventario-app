import { describe, it, expect } from 'vitest';
import type { AsientoContable, MovimientoBancario } from '@/types';
import {
  calcularConciliacion, proponerEmparejamientos, agruparPendientes, claveDescripcion, cruceConCaja, librosDelMes,
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

describe('caso enero: saldo inicial que los libros no tenían', () => {
  const corte = finDePeriodo('2026-01');
  // El banco abrió con 4369.82 y cerró enero en 779.26 (movimiento neto −3590.56)
  const movimientos = [
    mov('mov-enero', '2026-01-15', 'debito', 3590.56, 'conciliado', 'A1'),
  ];
  const asientosSinApertura = [
    asiento('A1', '2026-01-15', 0, 3590.56),   // el neto de enero ya está contabilizado
    asiento('A10000', '2026-01-20', 10000, 0), // un asiento de 10 000 que el banco no muestra
  ];

  it('sin el saldo inicial la diferencia es justamente ese saldo', () => {
    const r = calcularConciliacion({ corte, cuentaCodigo: BANCO, movimientos, asientos: asientosSinApertura });
    expect(r.saldoLibros).toBe(6409.44);
    expect(r.diferencia(779.26)).toBe(4369.82);
  });

  it('registrado el saldo inicial como movimiento conciliado, la diferencia queda en cero y los 10 000 quedan a la vista', () => {
    const apertura = mov('apertura', '2026-01-01', 'credito', 4369.82, 'conciliado', 'A0');
    const r = calcularConciliacion({
      corte, cuentaCodigo: BANCO, movimientos: [apertura, ...movimientos],
      asientos: [asiento('A0', '2026-01-01', 4369.82, 0), ...asientosSinApertura],
    });
    expect(r.diferencia(779.26)).toBe(0);
    expect(r.totalTransito).toBe(10000);                       // lo que explica que libros (10 779.26) ≠ banco (779.26)
    expect(r.saldoLibros).toBe(10779.26);
    expect(r.depositosTransito.map(p => p.asiento.id)).toEqual(['A10000']);
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

  // Asiento Debe Bancos / Haber Caja (el dinero que llega al banco se contabiliza saliendo de Caja)
  const viaCaja = (id: string, fecha: string, monto: number) => ({
    ...asiento(id, fecha, monto, 0),
    lineas: [
      { cuentaCodigo: BANCO, cuentaNombre: 'Banco', debe: monto, haber: 0, descripcion: '' },
      { cuentaCodigo: '1010101', cuentaNombre: 'Caja', debe: 0, haber: monto, descripcion: '' },
    ],
  } as unknown as AsientoContable);

  it('cuando todo el dinero que llega al banco pasa por Caja (depósitos y transferencias) el cruce cuadra', () => {
    const asientos = [viaCaja('T1', '2026-07-03', 520), viaCaja('T2', '2026-07-10', 1000)];
    const movimientos = [
      mov('d1', '2026-07-03', 'credito', 520, 'conciliado', 'T1', 'DEPOSITO 6386'),
      mov('d2', '2026-07-10', 'credito', 1000, 'conciliado', 'T2', 'TRANSFERENCIA INTERNET'),
    ];
    const r = cruceConCaja({ periodo: '2026-07', cuentaCodigo: BANCO, cajaCodigo: '1010101', movimientos, asientos });
    expect(r).toMatchObject({
      creditosViaCaja: 1520, nCreditosViaCaja: 2, efectivo: 520, nEfectivo: 1, transferencias: 1000,
      trasladosCaja: 1520, diferencia: 0,
    });
  });

  it('avisa las salidas de Caja a Bancos en libros que ningún movimiento del banco respalda', () => {
    const asientos = [viaCaja('T1', '2026-07-03', 520), viaCaja('T9', '2026-07-20', 200)];
    const movimientos = [mov('d1', '2026-07-03', 'credito', 520, 'conciliado', 'T1', 'DEPOSITO 6386')];
    const r = cruceConCaja({ periodo: '2026-07', cuentaCodigo: BANCO, cajaCodigo: '1010101', movimientos, asientos });
    expect(r).toMatchObject({ creditosViaCaja: 520, trasladosCaja: 720, diferencia: 200 });
  });

  it('un crédito contabilizado contra otra cuenta (intereses) no cuenta como Caja', () => {
    const interes = asiento('I1', '2026-07-31', 0.06, 0); // Debe Banco / Haber cuenta 999
    const movimientos = [mov('i1', '2026-07-31', 'credito', 0.06, 'conciliado', 'I1', 'INTERES A SU FAVOR')];
    const r = cruceConCaja({ periodo: '2026-07', cuentaCodigo: BANCO, cajaCodigo: '1010101', movimientos, asientos: [interes] });
    expect(r).toMatchObject({ creditosViaCaja: 0, trasladosCaja: 0, diferencia: 0 });
  });
});

describe('vistos sobre los libros del banco', () => {
  const asientos = [
    asiento('JUN', '2026-06-10', 100, 0),   // lo reflejó el banco en junio
    asiento('A1',  '2026-07-02', 300, 0),   // lo respalda un movimiento del estado de cuenta en julio
    asiento('A2',  '2026-07-20', 50, 0),    // visto a mano en julio
    asiento('A3',  '2026-07-28', 0, 80),    // pago que el banco aún no debita
    asiento('A4',  '2026-08-05', 999, 0),   // posterior al corte de julio
  ];
  const movimientos = [
    mov('mj', '2026-06-12', 'credito', 100, 'conciliado', 'JUN'),
    mov('m1', '2026-07-03', 'credito', 300, 'conciliado', 'A1'),
  ];
  const marcas = [{ asientoId: 'A2', fechaBanco: new Date('2026-07-31T12:00:00') }];

  it('lista los asientos del mes y lo que viene pendiente, sin lo que el banco ya reflejó antes', () => {
    const filas = librosDelMes({ periodo: '2026-07', cuentaCodigo: BANCO, movimientos, asientos, marcas });
    expect(filas.map(f => [f.asiento.id, f.estado, f.editable])).toEqual([
      ['A1', 'en_banco', false],
      ['A2', 'visto', true],
      ['A3', 'transito', true],
    ]);
    expect(filas.find(f => f.asiento.id === 'A3')?.monto).toBe(-80);
  });

  it('lo que sigue en tránsito en julio vuelve a aparecer en agosto (arrastre)', () => {
    const filas = librosDelMes({ periodo: '2026-08', cuentaCodigo: BANCO, movimientos, asientos, marcas });
    expect(filas.map(f => f.asiento.id)).toEqual(['A3', 'A4']);
  });

  it('un visto cuenta desde su fecha: en tránsito antes, reflejado después', () => {
    const base = { cuentaCodigo: BANCO, movimientos, asientos };
    const julio = calcularConciliacion({ ...base, corte: finDePeriodo('2026-07'), marcas });
    const antes = calcularConciliacion({ ...base, corte: finDePeriodo('2026-07'), marcas: [] });
    expect(julio.depositosTransito.map(p => p.asiento.id)).not.toContain('A2');
    expect(antes.depositosTransito.map(p => p.asiento.id)).toContain('A2');
    const junio = calcularConciliacion({ ...base, corte: finDePeriodo('2026-06'), marcas });
    expect(junio.depositosTransito.map(p => p.asiento.id)).not.toContain('A2'); // aún no existía
  });

  it('el emparejamiento automático no propone asientos ya marcados con visto', () => {
    const pend = [mov('p', '2026-07-21', 'credito', 50, 'no_conciliado')];
    expect(proponerEmparejamientos({ movimientos: pend, asientos, cuentaCodigo: BANCO })).toHaveLength(1);
    expect(proponerEmparejamientos({ movimientos: pend, asientos, cuentaCodigo: BANCO, marcas })).toHaveLength(0);
  });
});
