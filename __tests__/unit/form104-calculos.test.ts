import { describe, it, expect } from 'vitest';

// Lógica pura extraída de app/(dashboard)/tributario/form-104/page.tsx
function calcularForm104(
  ventas:  { subtotal: number; total: number }[],
  compras: { subtotal12: number; iva: number }[]
) {
  const ventas15  = ventas.reduce((s, v) => s + v.subtotal, 0);
  const ivaVentas = ventas.reduce((s, v) => s + Math.max(0, v.total - v.subtotal), 0);

  const compras15  = compras.reduce((s, f) => s + f.subtotal12, 0);
  const ivaCompras = compras.reduce((s, f) => s + f.iva, 0);

  const ivaNeto = ivaVentas - ivaCompras;

  return {
    v401_ventas15:    ventas15,
    v415_totalVentas: ventas15,
    v500_ivaVentas:   ivaVentas,
    v510_ivaCompras:  ivaCompras,
    v520_basesCompras:compras15,
    v601_ivaPagar:    Math.max(0, ivaNeto),
    v605_ivaFavor:    Math.max(0, -ivaNeto),
  };
}

const VENTAS_MUESTRA = [
  { subtotal: 100, total: 115   }, // IVA = 15
  { subtotal: 200, total: 230   }, // IVA = 30
  { subtotal:  50, total:  57.5 }, // IVA = 7.5
]; // Total IVA ventas = 52.5

const COMPRAS_MUESTRA = [
  { subtotal12:  80, iva: 12   },
  { subtotal12: 150, iva: 22.5 },
]; // Total IVA compras = 34.5

describe('Form 104 — campo 401 y 415', () => {
  it('suma los subtotales de ventas', () => {
    const r = calcularForm104(VENTAS_MUESTRA, []);
    expect(r.v401_ventas15).toBeCloseTo(350);
    expect(r.v415_totalVentas).toBeCloseTo(350);
  });

  it('retorna 0 sin ventas', () => {
    const r = calcularForm104([], []);
    expect(r.v401_ventas15).toBe(0);
  });
});

describe('Form 104 — campo 500 (IVA ventas)', () => {
  it('calcula IVA como diferencia total - subtotal', () => {
    const r = calcularForm104(VENTAS_MUESTRA, []);
    expect(r.v500_ivaVentas).toBeCloseTo(52.5);
  });

  it('ignora ventas donde total < subtotal (datos corruptos)', () => {
    const r = calcularForm104([{ subtotal: 100, total: 90 }], []);
    expect(r.v500_ivaVentas).toBe(0);
  });
});

describe('Form 104 — campos 510 y 520 (IVA compras)', () => {
  it('suma el IVA de todas las compras', () => {
    const r = calcularForm104([], COMPRAS_MUESTRA);
    expect(r.v510_ivaCompras).toBeCloseTo(34.5);
  });

  it('suma las bases imponibles de compras', () => {
    const r = calcularForm104([], COMPRAS_MUESTRA);
    expect(r.v520_basesCompras).toBeCloseTo(230);
  });
});

describe('Form 104 — liquidación (campos 601 y 605)', () => {
  it('IVA a pagar cuando ventas > compras', () => {
    const r = calcularForm104(VENTAS_MUESTRA, COMPRAS_MUESTRA);
    // 52.5 - 34.5 = 18
    expect(r.v601_ivaPagar).toBeCloseTo(18);
    expect(r.v605_ivaFavor).toBe(0);
  });

  it('crédito tributario cuando compras > ventas', () => {
    const r = calcularForm104(VENTAS_MUESTRA, [{ subtotal12: 500, iva: 75 }]);
    // 75 - 52.5 = 22.5
    expect(r.v601_ivaPagar).toBe(0);
    expect(r.v605_ivaFavor).toBeCloseTo(22.5);
  });

  it('ambos en cero cuando IVA ventas = IVA compras', () => {
    const r = calcularForm104(VENTAS_MUESTRA, [{ subtotal12: 350, iva: 52.5 }]);
    expect(r.v601_ivaPagar).toBeCloseTo(0);
    expect(r.v605_ivaFavor).toBeCloseTo(0);
  });

  it('ambos campos son siempre >= 0 (nunca negativos)', () => {
    const r = calcularForm104(VENTAS_MUESTRA, COMPRAS_MUESTRA);
    expect(r.v601_ivaPagar).toBeGreaterThanOrEqual(0);
    expect(r.v605_ivaFavor).toBeGreaterThanOrEqual(0);
  });
});
