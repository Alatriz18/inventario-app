/**
 * Documentos del reporte de conciliaciones: PDF de un mes (estado de conciliación con sus partidas y
 * espacio para firmas), PDF resumen de todos los meses y Excel con ambos.
 */

import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { aFecha } from '@/lib/bancos/conciliacion';
import type { DetalleMes, FilaResumen } from '@/lib/bancos/reporte-conciliacion';

export interface CabeceraReporte {
  empresa:        string;
  ruc?:           string;
  banco:          string;
  numeroCuenta:   string;
  cuentaContable: string;
}

const dinero = (n: number) => `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f: unknown) => format(aFecha(f), 'dd/MM/yyyy');
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const nombrePeriodo = (p: string) => { const [y, m] = p.split('-').map(Number); return `${MESES[m - 1]} de ${y}`; };

const ETIQUETA_ESTADO: Record<FilaResumen['estado'], string> = {
  cerrada: 'Cerrada', cuadra: 'Cuadra (sin cerrar)', diferencia: 'Con diferencia', sin_estado: 'Sin estado de cuenta',
};

// ── PDF de un mes ──────────────────────────────────────────────────────────

export function generarPdfMes(cab: CabeceraReporte, det: DetalleMes): Uint8Array {
  const { fila, conc } = det;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ML = 15, MR = 195, ANCHO = MR - ML;
  let y = 16;

  const salto = (alto: number) => { if (y + alto > 280) { doc.addPage(); y = 16; } };
  const texto = (t: string, x: number, yy: number, o?: { bold?: boolean; size?: number; align?: 'left' | 'right' | 'center'; color?: number }) => {
    doc.setFont('helvetica', o?.bold ? 'bold' : 'normal');
    doc.setFontSize(o?.size ?? 9);
    doc.setTextColor(o?.color ?? 30);
    doc.text(t, x, yy, { align: o?.align ?? 'left' });
  };
  const recortar = (t: string, ancho: number) => {
    const l = doc.splitTextToSize(t, ancho)[0] as string | undefined;
    return l && l.length < t.length ? `${l.slice(0, Math.max(0, l.length - 1))}...` : (l ?? '');
  };

  // Encabezado
  texto(cab.empresa, ML, y, { bold: true, size: 12 });
  if (cab.ruc) texto(`RUC ${cab.ruc}`, MR, y, { size: 8, align: 'right', color: 100 });
  y += 7;
  texto('CONCILIACION BANCARIA', ML, y, { bold: true, size: 15 });
  y += 6;
  texto(`Al ${format(fila.corte, 'dd/MM/yyyy')}  -  ${nombrePeriodo(fila.periodo)}`, ML, y, { size: 10 });
  y += 5;
  texto(`${cab.banco}  ${cab.numeroCuenta}   |   Cuenta contable ${cab.cuentaContable}`, ML, y, { size: 8, color: 100 });
  y += 5;
  if (fila.cierre) {
    texto(`Estado: CERRADA el ${fecha(fila.cierre.cerradaAt)} por ${fila.cierre.usuarioNombre}`, ML, y, { bold: true, size: 8, color: 20 });
  } else {
    texto(`Estado: ${ETIQUETA_ESTADO[fila.estado]}`, ML, y, { bold: true, size: 8 });
  }
  y += 4;
  if (!fila.conEstadoCuenta) {
    texto('Aviso: el saldo del banco se calculo con los movimientos (no hay estado de cuenta guardado para este mes).', ML, y, { size: 7.5, color: 140 });
    y += 4;
  }
  if (fila.cambioDespuesDelCierre) {
    texto('Aviso: despues del cierre cambiaron los libros o el saldo del banco; las cifras de abajo son las actuales.', ML, y, { size: 7.5, color: 140 });
    y += 4;
  }
  y += 3;

  // Estado de conciliación: banco | libros
  const mitad = ANCHO / 2 - 4;
  const colB = ML, colL = ML + ANCHO / 2 + 4;
  const filaEstado = (x: number, etiqueta: string, valor: number, o?: { total?: boolean; signo?: string }) => {
    if (o?.total) { doc.setDrawColor(120); doc.line(x, y - 3.5, x + mitad, y - 3.5); }
    texto(`${o?.signo ? `${o.signo} ` : ''}${etiqueta}`, x, y, { bold: o?.total, size: 8.5 });
    texto(dinero(valor), x + mitad, y, { bold: o?.total, size: 8.5, align: 'right' });
  };
  texto('SEGUN EL BANCO', colB, y, { bold: true, size: 8, color: 110 });
  texto('SEGUN LIBROS', colL, y, { bold: true, size: 8, color: 110 });
  y += 5;
  const y0 = y;
  filaEstado(colB, 'Saldo segun estado de cuenta', fila.saldoBanco); y += 5.5;
  filaEstado(colB, `Depositos en transito (${fila.nDepositosTransito})`, fila.depositosTransito, { signo: '+' }); y += 5.5;
  filaEstado(colB, `Pagos y cheques no cobrados (${fila.nPagosPendientes})`, fila.pagosPendientes, { signo: '-' }); y += 6.5;
  filaEstado(colB, 'Saldo bancario conciliado', fila.saldoBancoConciliado, { total: true });
  const yFinBanco = y;
  y = y0;
  filaEstado(colL, 'Saldo segun contabilidad', fila.saldoLibros); y += 5.5;
  filaEstado(colL, `Creditos del banco sin contabilizar (${conc.creditosNoRegistrados.length})`, fila.creditosNoRegistrados, { signo: '+' }); y += 5.5;
  filaEstado(colL, `Debitos del banco sin contabilizar (${conc.debitosNoRegistrados.length})`, fila.debitosNoRegistrados, { signo: '-' }); y += 6.5;
  filaEstado(colL, 'Saldo contable conciliado', fila.saldoLibrosConciliado, { total: true });
  y = Math.max(y, yFinBanco) + 8;

  // Diferencia
  const cuadra = Math.abs(fila.diferencia) < 0.005;
  doc.setDrawColor(cuadra ? 60 : 150);
  doc.rect(ML, y - 5, ANCHO, 9);
  texto('Diferencia por explicar', ML + 3, y, { bold: true, size: 9 });
  texto(dinero(fila.diferencia), MR - 3, y, { bold: true, size: 10, align: 'right' });
  y += 11;

  // Tablas de partidas
  const tabla = (titulo: string, cab2: string[], anchos: number[], derecha: number[], filas: string[][]) => {
    if (filas.length === 0) return;
    salto(16);
    texto(`${titulo} (${filas.length})`, ML, y, { bold: true, size: 9 });
    y += 4;
    const dibujarCab = () => {
      doc.setFillColor(238, 240, 243);
      doc.rect(ML, y - 3.4, ANCHO, 5, 'F');
      let x = ML + 1;
      cab2.forEach((c, i) => {
        texto(c, derecha.includes(i) ? x + anchos[i] - 2 : x, y, { bold: true, size: 7.5, align: derecha.includes(i) ? 'right' : 'left' });
        x += anchos[i];
      });
      y += 5;
    };
    dibujarCab();
    for (const f of filas) {
      if (y > 276) { doc.addPage(); y = 16; dibujarCab(); }
      let x = ML + 1;
      f.forEach((celda, i) => {
        texto(derecha.includes(i) ? celda : recortar(celda, anchos[i] - 2), derecha.includes(i) ? x + anchos[i] - 2 : x, y,
          { size: 7.5, align: derecha.includes(i) ? 'right' : 'left' });
        x += anchos[i];
      });
      y += 4.2;
    }
    y += 5;
  };

  const partidas = (lista: typeof conc.depositosTransito) => lista.map(p => [
    fecha(p.asiento.fecha), p.asiento.numero ?? '', p.asiento.concepto, dinero(p.monto), p.dias > 30 ? `${p.dias} dias` : '',
  ]);
  tabla('Depositos en transito', ['Fecha', 'N. asiento', 'Concepto', 'Monto', 'Antiguedad'], [22, 28, 80, 28, 22], [3, 4], partidas(conc.depositosTransito));
  tabla('Pagos y cheques no cobrados', ['Fecha', 'N. asiento', 'Concepto', 'Monto', 'Antiguedad'], [22, 28, 80, 28, 22], [3, 4], partidas(conc.pagosPendientes));
  const delBanco = (l: typeof conc.creditosNoRegistrados) => l.map(m => [fecha(m.fecha), m.descripcion, m.referencia ?? '', dinero(m.monto)]);
  tabla('Creditos del banco sin contabilizar', ['Fecha', 'Descripcion', 'N. documento', 'Monto'], [22, 98, 34, 26], [3], delBanco(conc.creditosNoRegistrados));
  tabla('Debitos del banco sin contabilizar', ['Fecha', 'Descripcion', 'N. documento', 'Monto'], [22, 98, 34, 26], [3], delBanco(conc.debitosNoRegistrados));
  tabla('Movimientos conciliados con monto distinto al del asiento', ['Fecha', 'Descripcion', 'Banco', 'Libros'], [22, 98, 30, 30], [2, 3],
    conc.descuadres.map(d => [fecha(d.movimiento.fecha), `${d.movimiento.descripcion} (asiento ${d.asiento.numero ?? ''})`, dinero(d.montoBanco), dinero(d.montoLibros)]));

  // Firmas
  salto(30);
  y += 14;
  doc.setDrawColor(90);
  doc.line(ML + 8, y, ML + 68, y);
  doc.line(MR - 68, y, MR - 8, y);
  texto('Elaborado por', ML + 38, y + 4, { size: 8, align: 'center', color: 90 });
  texto('Revisado por', MR - 38, y + 4, { size: 8, align: 'center', color: 90 });

  // Numeración de páginas
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    texto(`Pagina ${i} de ${n}`, MR, 290, { size: 7, align: 'right', color: 130 });
    texto(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, ML, 290, { size: 7, color: 130 });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

// ── PDF resumen de todos los meses ─────────────────────────────────────────

export function generarPdfResumen(cab: CabeceraReporte, filas: FilaResumen[]): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const ML = 12, MR = 285;
  let y = 15;
  const t = (txt: string, x: number, yy: number, o?: { bold?: boolean; size?: number; align?: 'left' | 'right'; color?: number }) => {
    doc.setFont('helvetica', o?.bold ? 'bold' : 'normal'); doc.setFontSize(o?.size ?? 8.5);
    doc.setTextColor(o?.color ?? 30); doc.text(txt, x, yy, { align: o?.align ?? 'left' });
  };

  t(cab.empresa, ML, y, { bold: true, size: 12 });
  if (cab.ruc) t(`RUC ${cab.ruc}`, MR, y, { size: 8, align: 'right', color: 100 });
  y += 7;
  t('RESUMEN DE CONCILIACIONES BANCARIAS', ML, y, { bold: true, size: 14 });
  y += 5;
  t(`${cab.banco}  ${cab.numeroCuenta}   |   Cuenta contable ${cab.cuentaContable}`, ML, y, { size: 8, color: 100 });
  y += 8;

  const cols: { h: string; w: number; r?: boolean }[] = [
    // suman 270 mm: caben entre los márgenes de la hoja horizontal (12 a 285)
    { h: 'Mes', w: 32 }, { h: 'Estado', w: 32 }, { h: 'Saldo banco', w: 26, r: true }, { h: 'Dep. transito', w: 26, r: true },
    { h: 'Pagos pend.', w: 24, r: true }, { h: 'Conciliado banco', w: 30, r: true }, { h: 'Saldo libros', w: 26, r: true },
    { h: 'Conciliado libros', w: 30, r: true }, { h: 'Diferencia', w: 24, r: true }, { h: 'Sin contab.', w: 20, r: true },
  ];
  const cabecera = () => {
    doc.setFillColor(238, 240, 243);
    doc.rect(ML, y - 4, MR - ML, 6, 'F');
    let x = ML + 1;
    for (const c of cols) { t(c.h, c.r ? x + c.w - 2 : x, y, { bold: true, size: 7.5, align: c.r ? 'right' : 'left' }); x += c.w; }
    y += 6;
  };
  cabecera();
  const cerradas = filas.filter(f => f.estado === 'cerrada').length;
  for (const f of filas) {
    if (y > 190) { doc.addPage(); y = 15; cabecera(); }
    const valores = [
      nombrePeriodo(f.periodo), `${ETIQUETA_ESTADO[f.estado]}${f.cambioDespuesDelCierre ? ' *' : ''}`,
      dinero(f.saldoBanco), dinero(f.depositosTransito), dinero(f.pagosPendientes), dinero(f.saldoBancoConciliado),
      dinero(f.saldoLibros), dinero(f.saldoLibrosConciliado), dinero(f.diferencia), String(f.pendientesMes),
    ];
    let x = ML + 1;
    cols.forEach((c, i) => { t(valores[i], c.r ? x + c.w - 2 : x, y, { size: 8, align: c.r ? 'right' : 'left' }); x += c.w; });
    y += 5.2;
  }
  y += 4;
  t(`${cerradas} de ${filas.length} mes(es) cerrados.   * cambiaron los libros despues del cierre.   ` +
    'Saldo banco calculado (sin estado de cuenta guardado) en: ' +
    (filas.filter(f => !f.conEstadoCuenta).map(f => f.periodo).join(', ') || 'ninguno') + '.', ML, y, { size: 7.5, color: 100 });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); t(`Pagina ${i} de ${n}   |   Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, MR, 203, { size: 7, align: 'right', color: 130 }); }
  return new Uint8Array(doc.output('arraybuffer'));
}

// ── Excel ───────────────────────────────────────────────────────────────────

export function descargarExcel(cab: CabeceraReporte, filas: FilaResumen[], det: DetalleMes | null, nombreArchivo: string) {
  const wb = XLSX.utils.book_new();

  const resumen: (string | number)[][] = [
    [cab.empresa], [`Resumen de conciliaciones - ${cab.banco} ${cab.numeroCuenta} (cuenta contable ${cab.cuentaContable})`], [],
    ['Mes', 'Estado', 'Cerrada por', 'Saldo banco', 'Saldo del estado de cuenta guardado', 'Depositos en transito', 'Pagos no cobrados',
      'Saldo bancario conciliado', 'Saldo libros', 'Creditos sin contabilizar', 'Debitos sin contabilizar',
      'Saldo contable conciliado', 'Diferencia', 'Movimientos del mes', 'Sin contabilizar'],
    ...filas.map(f => [
      nombrePeriodo(f.periodo), ETIQUETA_ESTADO[f.estado], f.cierre?.usuarioNombre ?? '', f.saldoBanco, f.conEstadoCuenta ? 'Si' : 'No (calculado)',
      f.depositosTransito, f.pagosPendientes, f.saldoBancoConciliado, f.saldoLibros, f.creditosNoRegistrados, f.debitosNoRegistrados,
      f.saldoLibrosConciliado, f.diferencia, f.movimientosMes, f.pendientesMes,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');

  if (det) {
    const { fila, conc } = det;
    const d: (string | number)[][] = [
      [cab.empresa], [`Conciliacion bancaria al ${format(fila.corte, 'dd/MM/yyyy')} - ${cab.banco} ${cab.numeroCuenta}`], [],
      ['SEGUN EL BANCO', '', 'SEGUN LIBROS', ''],
      ['Saldo segun estado de cuenta', fila.saldoBanco, 'Saldo segun contabilidad', fila.saldoLibros],
      [`+ Depositos en transito (${fila.nDepositosTransito})`, fila.depositosTransito, `+ Creditos del banco sin contabilizar (${conc.creditosNoRegistrados.length})`, fila.creditosNoRegistrados],
      [`- Pagos y cheques no cobrados (${fila.nPagosPendientes})`, fila.pagosPendientes, `- Debitos del banco sin contabilizar (${conc.debitosNoRegistrados.length})`, fila.debitosNoRegistrados],
      ['Saldo bancario conciliado', fila.saldoBancoConciliado, 'Saldo contable conciliado', fila.saldoLibrosConciliado],
      [], ['Diferencia por explicar', fila.diferencia], [],
      ['DEPOSITOS EN TRANSITO'], ['Fecha', 'N. asiento', 'Concepto', 'Monto', 'Dias'],
      ...conc.depositosTransito.map(p => [fecha(p.asiento.fecha), p.asiento.numero ?? '', p.asiento.concepto, p.monto, p.dias]),
      [], ['PAGOS Y CHEQUES NO COBRADOS'], ['Fecha', 'N. asiento', 'Concepto', 'Monto', 'Dias'],
      ...conc.pagosPendientes.map(p => [fecha(p.asiento.fecha), p.asiento.numero ?? '', p.asiento.concepto, p.monto, p.dias]),
      [], ['CREDITOS DEL BANCO SIN CONTABILIZAR'], ['Fecha', 'Descripcion', 'N. documento', 'Monto'],
      ...conc.creditosNoRegistrados.map(m => [fecha(m.fecha), m.descripcion, m.referencia ?? '', m.monto]),
      [], ['DEBITOS DEL BANCO SIN CONTABILIZAR'], ['Fecha', 'Descripcion', 'N. documento', 'Monto'],
      ...conc.debitosNoRegistrados.map(m => [fecha(m.fecha), m.descripcion, m.referencia ?? '', m.monto]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d), `Detalle ${fila.periodo}`);
  }
  XLSX.writeFile(wb, nombreArchivo);
}

/** Descarga un PDF generado en el navegador. */
export function descargarPdf(bytes: Uint8Array, nombreArchivo: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
