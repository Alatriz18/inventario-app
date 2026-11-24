import { describe, it, expect } from 'vitest';
import { interpretarEstadoCuentaPichincha, type ItemTexto } from '@/lib/bancos/estado-cuenta-pichincha';

type Celda = [number, string];
const fila = (pagina: number, y: number, celdas: Celda[]): ItemTexto[] =>
  celdas.map(([x, str]) => ({ str, x, y, pagina }));

/** Un corte con las mismas posiciones que el PDF real del banco. */
function corte(pagina: number, fechaCorte: string, extra: ItemTexto[] = []): ItemTexto[] {
  return [
    ...fila(pagina, 687, [[308, 'FECHA ESTE CORTE'], [409, ' '], [522, fechaCorte]]),
    ...fila(pagina, 452, [[314, 'SALDO ANTERIOR'], [520, '100.00']]),
    ...fila(pagina, 430, [[314, 'DEPÓSITO / CRÉDITOS'], [480, '(2)'], [520, '50.06']]),
    ...fila(pagina, 410, [[314, 'CHEQUES / DÉBITOS'], [480, '(1)'], [520, '30.00']]),
    ...fila(pagina, 390, [[314, 'SALDO ACTUAL'], [520, '120.06']]),
    ...fila(pagina + 1, 612, [[26, '31-jul.'], [66, '901'], [111, '85598980'], [159, 'INTERES A SU FAVOR'], [428, '0.00'], [493, '0.06'], [531, '100.06']]),
    ...fila(pagina + 1, 603, [[111, '1']]),
    ...fila(pagina + 1, 590, [[26, '01-jul.'], [66, '12'], [111, '20883448'], [159, 'TRANSFERENCIA'], [250, 'INTERNET'], [428, '0.00'], [493, '50.00'], [531, '150.06']]),
    ...fila(pagina + 1, 570, [[26, '06-jul.'], [66, '12'], [111, '2467228'], [159, 'PAGO A TERCER'], [428, '30.00'], [493, '0.00'], [531, '120.06']]),
    ...extra,
  ];
}

describe('interpretarEstadoCuentaPichincha', () => {
  it('lee los movimientos, une el N.DOC. partido en dos renglones y cuadra con el banco', () => {
    const r = interpretarEstadoCuentaPichincha(corte(1, '31-07-2026'));
    expect(r.cortes).toHaveLength(1);
    const c = r.cortes[0];
    expect(c.cuadra).toBe(true);
    expect(c.avisos).toEqual([]);
    expect(r.movimientos).toHaveLength(3);
    expect(r.movimientos[0]).toMatchObject({ oficina: '901', documento: '855989801', credito: 0.06, debito: 0 });
    expect(r.movimientos[1]).toMatchObject({ descripcion: 'TRANSFERENCIA INTERNET', credito: 50, saldo: 150.06 });
    expect(r.movimientos[2]).toMatchObject({ debito: 30, credito: 0 });
    expect(r.movimientos[1].fecha.getFullYear()).toBe(2026);
    expect(r.movimientos[1].fecha.getMonth()).toBe(6);
    expect(r.movimientos[1].fecha.getDate()).toBe(1);
  });

  it('descarta un corte repetido dentro del mismo archivo', () => {
    const r = interpretarEstadoCuentaPichincha([...corte(1, '31-07-2026'), ...corte(4, '31-07-2026')]);
    expect(r.cortes).toHaveLength(2);
    expect(r.cortes[1].repetido).toBe(true);
    expect(r.movimientos).toHaveLength(3);
  });

  it('avisa cuando lo leído no coincide con los totales del banco', () => {
    const items = corte(1, '31-07-2026').filter(i => i.str !== '2467228' && i.str !== 'PAGO A TERCER');
    const c = interpretarEstadoCuentaPichincha(items).cortes[0];
    expect(c.cuadra).toBe(false);
    expect(c.avisos.length).toBeGreaterThan(0);
  });

  it('un movimiento de diciembre en un corte de enero es del año anterior', () => {
    const items = [
      ...fila(1, 687, [[308, 'FECHA ESTE CORTE'], [522, '31-01-2027']]),
      ...fila(2, 612, [[26, '30-dic.'], [66, '12'], [111, '111'], [159, 'DEPOSITO'], [428, '0.00'], [493, '10.00'], [531, '10.00']]),
    ];
    const r = interpretarEstadoCuentaPichincha(items);
    expect(r.movimientos[0].fecha.getFullYear()).toBe(2026);
    expect(r.movimientos[0].fecha.getMonth()).toBe(11);
  });
});
