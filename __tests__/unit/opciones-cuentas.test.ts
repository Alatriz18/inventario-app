import { describe, it, expect } from 'vitest';
import { armarOpcionesCuentas, type CuentaBase } from '@/lib/bancos/opciones-cuentas';
import { PLAN_CUENTAS_ECUADOR } from '@/lib/data/plan-cuentas-ecuador';

const cuenta = (codigo: string, nombre: string, tipo: string, aceptaMovimientos: boolean, activa = true): CuentaBase =>
  ({ codigo, nombre, tipo, aceptaMovimientos, activa });

describe('armarOpcionesCuentas', () => {
  const catalogo = PLAN_CUENTAS_ECUADOR as unknown as CuentaBase[];
  const opciones = armarOpcionesCuentas([], catalogo);
  const por = (codigo: string) => opciones.find(o => o.value === codigo)!;

  it('distingue las tres cuentas «COMISIONES» por su grupo', () => {
    const comisiones = opciones.filter(o => o.label.endsWith('– COMISIONES'));
    expect(comisiones.map(o => o.value).sort()).toEqual(['520110', '520210', '520302']);
    expect(por('520302').contexto).toBe('GASTOS FINANCIEROS');
    expect(new Set(comisiones.map(o => o.contexto)).size).toBe(3);
  });

  it('«gastos bancarios» encuentra las cuentas de gastos financieros y no las de administración', () => {
    expect(por('520302').keywords).toContain('gastos bancarios');
    expect(por('520305').keywords).toContain('gastos bancarios');
    expect(por('520210').keywords).not.toContain('gastos bancarios');
  });

  it('«Gasto por servicios bancarios» existe bajo Comisiones (gastos financieros) y se encuentra por sus nombres habituales', () => {
    const c = por('52030201');
    expect(c.label).toBe('52030201 – Gasto por servicios bancarios');
    expect(c.contexto).toBe('COMISIONES');
    expect(c.keywords).toEqual(expect.arrayContaining(['gastos financieros', 'gastos bancarios', 'servicios bancarios']));
    // sobregiros e intereses bancarios: se llegan a las cuentas oficiales equivalentes
    expect(por('2010401').keywords).toContain('sobregiros bancarios');
    expect(por('4302').keywords).toContain('intereses bancarios');
  });

  it('Caja y Bancos se encuentran por su nombre habitual', () => {
    expect(por('1010101').keywords).toContain('caja general');
  });

  it('no ofrece cuentas que no aceptan movimientos', () => {
    expect(opciones.find(o => o.value === '5203')).toBeUndefined();
    expect(opciones.find(o => o.value === '52')).toBeUndefined();
  });

  it('respeta el plan de la empresa: incluye sus cuentas propias aunque tengan puntos y excluye las inactivas', () => {
    const plan = [
      cuenta('5203', 'GASTOS FINANCIEROS', 'gasto', false),
      cuenta('52030201', 'GASTOS BANCARIOS', 'gasto', true),
      cuenta('6.3.02', 'Comisiones bancarias (anterior)', 'gasto', true, false),
      cuenta('9.9.01', 'Cuenta propia con puntos', 'gasto', true),
    ];
    const r = armarOpcionesCuentas(plan, catalogo);
    expect(r.find(o => o.value === '52030201')?.label).toBe('52030201 – GASTOS BANCARIOS');
    expect(r.find(o => o.value === '6.3.02')).toBeUndefined();
    expect(r.find(o => o.value === '9.9.01')).toBeDefined();
  });
});
