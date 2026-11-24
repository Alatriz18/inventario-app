import { describe, it, expect } from 'vitest';
import type { AsientoContable, ConciliacionBancaria, ExtractoBancario, MovimientoBancario } from '@/types';
import { resumenConciliaciones, detalleMes, periodosConDatos, type DatosConciliacion } from '@/lib/bancos/reporte-conciliacion';
import { saldoBancoAlCorte, finDePeriodo } from '@/lib/bancos/conciliacion';

const BANCO = '1010102';
const d = (s: string) => new Date(`${s}T12:00:00`);

const asiento = (id: string, fecha: string, debe: number, haber: number): AsientoContable => ({
  id, numero: id, fecha: d(fecha), concepto: id, tipo: 'manual', estado: 'confirmado', bloqueado: false,
  editadoManualmente: false, usuarioId: 'u', usuarioNombre: 'u', createdAt: d(fecha),
  totalDebe: debe || haber, totalHaber: debe || haber,
  lineas: [
    { cuentaCodigo: BANCO, cuentaNombre: 'Banco', debe, haber, descripcion: '' },
    { cuentaCodigo: '999', cuentaNombre: 'Otra', debe: haber, haber: debe, descripcion: '' },
  ],
} as unknown as AsientoContable);

const mov = (id: string, fecha: string, tipo: 'credito' | 'debito', monto: number,
  estado: MovimientoBancario['estado'], asientoId?: string): MovimientoBancario =>
  ({ id, cuentaBancariaId: 'c1', fecha: d(fecha), descripcion: id, tipo, monto, estado, asientoId, createdAt: d(fecha) }) as MovimientoBancario;

const extracto = (periodo: string, saldoActual: number): ExtractoBancario =>
  ({ id: `c1_${periodo}`, cuentaBancariaId: 'c1', periodo, corte: finDePeriodo(periodo), saldoAnterior: 0, saldoActual,
     creditos: { n: 0, total: 0 }, debitos: { n: 0, total: 0 }, movimientos: 0, cuadra: true, usuarioNombre: 'u', createdAt: new Date() });

const datos = (extra: Partial<DatosConciliacion> = {}): DatosConciliacion => ({
  cuentaCodigo: BANCO, saldoInicialCuenta: 0,
  movimientos: [mov('m1', '2026-01-15', 'credito', 100, 'conciliado', 'A1'), mov('m2', '2026-02-10', 'debito', 30, 'conciliado', 'A2')],
  asientos: [asiento('A1', '2026-01-15', 100, 0), asiento('A2', '2026-02-10', 0, 30), asiento('A3', '2026-02-20', 50, 0)],
  marcas: [],
  extractos: [extracto('2026-01', 100), extracto('2026-02', 70)],
  cierres: [],
  ...extra,
});

const cierreEnero = (): ConciliacionBancaria => ({
  id: 'c1_2026-01', cuentaBancariaId: 'c1', periodo: '2026-01', corte: finDePeriodo('2026-01'),
  saldoBanco: 100, saldoLibros: 100, saldoConciliado: 100, depositosTransito: 0, pagosPendientes: 0,
  usuarioId: 'u', usuarioNombre: 'Contadora', cerradaAt: new Date(),
});

describe('resumenConciliaciones', () => {
  it('arma una fila por mes, del más reciente al más antiguo, con el saldo conciliado de cada lado', () => {
    const filas = resumenConciliaciones(datos());
    expect(filas.map(f => f.periodo)).toEqual(['2026-02', '2026-01']);
    const feb = filas[0];
    expect(feb).toMatchObject({
      estado: 'cuadra', saldoBanco: 70, conEstadoCuenta: true,
      depositosTransito: 50, nDepositosTransito: 1, saldoLibros: 120,
      saldoBancoConciliado: 120, saldoLibrosConciliado: 120, diferencia: 0,
      movimientosMes: 1, pendientesMes: 0,
    });
  });

  it('un mes con cierre figura como cerrado; si después cambian los libros se avisa', () => {
    const limpio = resumenConciliaciones(datos({ cierres: [cierreEnero()] }));
    expect(limpio[1]).toMatchObject({ periodo: '2026-01', estado: 'cerrada', cambioDespuesDelCierre: false });
    expect(limpio[1].cierre?.usuarioNombre).toBe('Contadora');

    const editado = resumenConciliaciones(datos({
      cierres: [cierreEnero()],
      asientos: [...datos().asientos, asiento('A9', '2026-01-20', 5, 0)], // se registró algo después del cierre
    }));
    expect(editado[1].cambioDespuesDelCierre).toBe(true);
  });

  it('un mes con diferencia queda como «diferencia» y cuenta los movimientos sin contabilizar', () => {
    const filas = resumenConciliaciones(datos({
      movimientos: [...datos().movimientos, mov('m3', '2026-02-12', 'debito', 0.36, 'no_conciliado')],
      extractos: [extracto('2026-01', 100), extracto('2026-02', 70)],
    }));
    const feb = filas[0];
    expect(feb.pendientesMes).toBe(1);
    expect(feb.debitosNoRegistrados).toBe(0.36);
    expect(feb.estado).toBe('diferencia');
  });

  it('sin estado de cuenta del mes, el saldo del banco se calcula y se indica', () => {
    const filas = resumenConciliaciones(datos({ extractos: [extracto('2026-01', 100)] }));
    const feb = filas.find(f => f.periodo === '2026-02')!;
    expect(feb.conEstadoCuenta).toBe(false);
    expect(feb.estado).toBe('sin_estado'); // no se presenta como «cuadra» ni se puede cerrar
    expect(feb.saldoBanco).toBe(70); // 0 + 100 − 30
  });

  it('detalleMes devuelve las partidas del mes pedido', () => {
    const { conc } = detalleMes('2026-02', datos());
    expect(conc.depositosTransito.map(p => p.asiento.id)).toEqual(['A3']);
  });

  it('periodosConDatos une meses con movimientos y con estado de cuenta', () => {
    expect(periodosConDatos(datos().movimientos, [extracto('2026-03', 1)])).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

describe('saldoBancoAlCorte', () => {
  it('prefiere el estado de cuenta y, sin él, no suma dos veces el saldo inicial ya registrado', () => {
    const movs = [mov('ap', '2026-01-01', 'credito', 1000, 'conciliado', 'A0'), mov('x', '2026-01-10', 'debito', 100, 'conciliado', 'A1')];
    const corte = finDePeriodo('2026-01');
    expect(saldoBancoAlCorte({ extracto: { saldoActual: 905 }, movimientos: movs, corte, saldoInicialCuenta: 1000, aperturaRegistrada: true }))
      .toMatchObject({ valor: 905, desdeEstadoCuenta: true, origen: 'estado_de_cuenta' });
    expect(saldoBancoAlCorte({ movimientos: movs, corte, saldoInicialCuenta: 1000, aperturaRegistrada: true }).valor).toBe(900);
    expect(saldoBancoAlCorte({ movimientos: movs, corte, saldoInicialCuenta: 1000, aperturaRegistrada: false }).valor).toBe(1900);
  });
});

describe('PDF del reporte', () => {
  const cab = { empresa: 'DISTRIBUIDORA ROMMSON S.A.S', ruc: '1793225803001', banco: 'BANCO PICHINCHA', numeroCuenta: '2214436553', cuentaContable: '1010102' };

  it('genera el PDF de un mes y el resumen sin errores', async () => {
    const { generarPdfMes, generarPdfResumen } = await import('@/lib/bancos/reporte-pdf');
    const d = datos({ cierres: [cierreEnero()] });
    const mes = generarPdfMes(cab, detalleMes('2026-02', d));
    const resumen = generarPdfResumen(cab, resumenConciliaciones(d));
    const cabecera = (b: Uint8Array) => String.fromCharCode(...b.slice(0, 5));
    expect(cabecera(mes)).toBe('%PDF-');
    expect(cabecera(resumen)).toBe('%PDF-');
    expect(mes.length).toBeGreaterThan(1500);
    if (process.env.GUARDAR_PDF_PRUEBA) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${process.env.GUARDAR_PDF_PRUEBA}/reporte-mes.pdf`, mes);
      fs.writeFileSync(`${process.env.GUARDAR_PDF_PRUEBA}/reporte-resumen.pdf`, resumen);
    }
  });

  it('un mes con muchas partidas pagina sin fallar', async () => {
    const { generarPdfMes } = await import('@/lib/bancos/reporte-pdf');
    const muchos = Array.from({ length: 120 }, (_, i) => asiento(`T${i}`, '2026-02-15', 10 + i, 0));
    const d = datos({ asientos: [...datos().asientos, ...muchos] });
    expect(() => generarPdfMes(cab, detalleMes('2026-02', d))).not.toThrow();
  });
});
