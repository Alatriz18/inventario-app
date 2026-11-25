import { describe, it, expect } from 'vitest';
import { codigosDeLineas, codigosAlDia, tocaCuentas, unirAsientos } from '@/lib/contabilidad/cuentas-codigos';
import { diaLocal, leerMarca, puedeUsarCache, desdeDelta, mayorFecha, MARGEN_DELTA_MS } from '@/lib/firebase/catalogo-marca';
import type { AsientoContable, AsientoLinea } from '@/types';

const linea = (cuentaCodigo: string, debe = 0, haber = 0) => ({ cuentaCodigo, cuentaNombre: cuentaCodigo, cuentaId: cuentaCodigo, debe, haber }) as AsientoLinea;
const asiento = (id: string, fecha: string, lineas: AsientoLinea[], cuentasCodigos?: string[]) =>
  ({ id, fecha: new Date(fecha), lineas, cuentasCodigos }) as AsientoContable;

describe('códigos de cuenta de un asiento', () => {
  it('sin repetir, ordenados y sin vacíos', () => {
    expect(codigosDeLineas([linea('1.1.02', 10), linea('1.1.01', 0, 5), linea('1.1.02', 0, 5), linea('')])).toEqual(['1.1.01', '1.1.02']);
    expect(codigosDeLineas(undefined)).toEqual([]);
  });

  it('detecta si el campo guardado está al día', () => {
    const l = [linea('1.1.02', 10), linea('4.1.01', 0, 10)];
    expect(codigosAlDia({ lineas: l, cuentasCodigos: ['1.1.02', '4.1.01'] })).toBe(true);
    expect(codigosAlDia({ lineas: l })).toBe(false);                               // asiento viejo, sin campo
    expect(codigosAlDia({ lineas: l, cuentasCodigos: ['1.1.01', '4.1.01'] })).toBe(false); // reclasificado
  });

  it('tocaCuentas mira las líneas, no el campo guardado', () => {
    expect(tocaCuentas(asiento('a', '2026-01-01', [linea('1.1.02', 5)], ['9.9']), ['1.1.02'])).toBe(true);
    expect(tocaCuentas(asiento('a', '2026-01-01', [linea('1.1.01', 5)], ['1.1.02']), ['1.1.02'])).toBe(false);
  });

  it('unirAsientos no repite, la versión posterior gana y quedan del más nuevo al más viejo', () => {
    const viejo = asiento('x', '2026-01-05', [linea('1.1.02', 1)]);
    const nuevo = asiento('x', '2026-01-05', [linea('1.1.02', 2)]);
    const otro  = asiento('y', '2026-02-01', [linea('1.1.02', 3)]);
    const r = unirAsientos([viejo, otro], [nuevo]);
    expect(r.map(a => a.id)).toEqual(['y', 'x']);
    expect(r[1].lineas[0].debe).toBe(2);
  });
});

describe('marca de sincronización de catálogos', () => {
  it('diaLocal en formato año-mes-día', () => {
    expect(diaLocal(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
  });

  it('lee solo marcas válidas', () => {
    expect(leerMarca(JSON.stringify({ v: 1, dia: '2026-11-24', hasta: 5, n: 10 }))).toEqual({ v: 1, dia: '2026-11-24', hasta: 5, n: 10 });
    expect(leerMarca(null)).toBeNull();
    expect(leerMarca('dañado')).toBeNull();
    expect(leerMarca(JSON.stringify({ v: 2, dia: 'x', hasta: 1, n: 1 }))).toBeNull();
  });

  it('usa la caché solo el mismo día y si no le faltan documentos', () => {
    const m = { v: 1 as const, dia: '2026-11-24', hasta: 1000, n: 300 };
    expect(puedeUsarCache(m, '2026-11-24', 300)).toBe(true);
    expect(puedeUsarCache(m, '2026-11-24', 301)).toBe(true);  // hay más (creados en este computador)
    expect(puedeUsarCache(m, '2026-11-24', 120)).toBe(false); // el navegador borró parte de la caché
    expect(puedeUsarCache(m, '2026-11-25', 300)).toBe(false); // día nuevo: carga completa
    expect(puedeUsarCache(m, '2026-11-24', 0)).toBe(false);
    expect(puedeUsarCache(null, '2026-11-24', 300)).toBe(false);
  });

  it('pide cambios desde un poco antes de la marca y nunca antes de 0', () => {
    expect(desdeDelta({ v: 1, dia: 'd', hasta: 10_000_000, n: 1 })).toBe(10_000_000 - MARGEN_DELTA_MS);
    expect(desdeDelta({ v: 1, dia: 'd', hasta: 5, n: 1 })).toBe(0);
  });

  it('mayorFecha ignora los que aún no tienen hora del servidor', () => {
    expect(mayorFecha([3, null, 9, undefined, 4])).toBe(9);
    expect(mayorFecha([null], 7)).toBe(7);
  });
});
