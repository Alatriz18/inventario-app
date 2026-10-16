/**
 * Exportación a Excel con formato real (negrita, colores, bordes) de los
 * estados financieros — mismo criterio visual que el PDF, para que ambos
 * sirvan igual de bien para presentar y firmar. La librería xlsx gratuita
 * no escribe estilos de celda al guardar; exceljs sí.
 */
import ExcelJS from 'exceljs';
import type { CuentaMonto, DatosBalanceGeneralPDF, DatosEstadoResultadosPDF } from './estados-financieros-pdf';

const FILL_SECCION: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBEBEB' } };
const FILL_TOTAL:   ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
const BORDE_FINO: Partial<ExcelJS.Borders> = { top: { style: 'thin' } };
const BORDE_DOBLE: Partial<ExcelJS.Borders> = { top: { style: 'double' } };
const FORMATO_MONEDA = '"$"#,##0.00;[Red]-"$"#,##0.00';

async function descargar(wb: ExcelJS.Workbook, nombreArchivo: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

function encabezado(ws: ExcelJS.Worksheet, razonSocial: string, ruc: string, direccion: string | undefined, titulo: string, subtitulo: string) {
  let fila = 1;
  const merge = (f: number, texto: string, opts: { bold?: boolean; size?: number } = {}) => {
    ws.mergeCells(f, 1, f, 3);
    const cell = ws.getCell(f, 1);
    cell.value = texto;
    cell.font = { bold: opts.bold ?? false, size: opts.size ?? 10, name: 'Calibri' };
    cell.alignment = { horizontal: 'center' };
    return f + 1;
  };
  fila = merge(fila, razonSocial || 'EMPRESA', { bold: true, size: 14 });
  fila = merge(fila, `RUC: ${ruc || '-'}`);
  if (direccion) fila = merge(fila, direccion);
  fila += 1;
  fila = merge(fila, titulo, { bold: true, size: 12 });
  fila = merge(fila, subtitulo);
  fila += 1;
  return fila;
}

function filaSeccion(ws: ExcelJS.Worksheet, fila: number, titulo: string): number {
  ws.mergeCells(fila, 1, fila, 3);
  const cell = ws.getCell(fila, 1);
  cell.value = titulo;
  cell.font = { bold: true, size: 10 };
  cell.fill = FILL_SECCION;
  ws.getRow(fila).height = 18;
  return fila + 1;
}

function filaCuenta(ws: ExcelJS.Worksheet, fila: number, c: CuentaMonto): number {
  ws.getCell(fila, 1).value = c.codigo;
  ws.getCell(fila, 1).font = { color: { argb: 'FF888888' }, size: 9 };
  ws.getCell(fila, 2).value = c.nombre;
  ws.getCell(fila, 2).font = { size: 9 };
  const montoCell = ws.getCell(fila, 3);
  montoCell.value = c.saldo;
  montoCell.numFmt = FORMATO_MONEDA;
  montoCell.font = { size: 9 };
  return fila + 1;
}

function filaTotal(ws: ExcelJS.Worksheet, fila: number, etiqueta: string, monto: number, destacado = false): number {
  ws.mergeCells(fila, 1, fila, 2);
  const labelCell = ws.getCell(fila, 1);
  labelCell.value = etiqueta;
  labelCell.font = { bold: true, size: destacado ? 11 : 10 };
  labelCell.border = destacado ? BORDE_DOBLE : BORDE_FINO;
  const montoCell = ws.getCell(fila, 3);
  montoCell.value = monto;
  montoCell.numFmt = FORMATO_MONEDA;
  montoCell.font = { bold: true, size: destacado ? 11 : 10 };
  montoCell.border = destacado ? BORDE_DOBLE : BORDE_FINO;
  montoCell.fill = FILL_TOTAL;
  ws.getRow(fila).height = destacado ? 20 : 16;
  return fila + 1;
}

function firmas(ws: ExcelJS.Worksheet, fila: number): number {
  fila += 3;
  ws.mergeCells(fila, 1, fila, 1);
  ws.mergeCells(fila, 2, fila, 3);
  ws.getCell(fila, 1).border = { top: { style: 'thin' } };
  ws.getCell(fila, 2).border = { top: { style: 'thin' } };
  fila += 1;
  ws.getCell(fila, 1).value = 'GERENTE GENERAL';
  ws.getCell(fila, 1).font = { bold: true, size: 9 };
  ws.getCell(fila, 1).alignment = { horizontal: 'center' };
  ws.mergeCells(fila, 2, fila, 3);
  ws.getCell(fila, 2).value = 'CONTADOR';
  ws.getCell(fila, 2).font = { bold: true, size: 9 };
  ws.getCell(fila, 2).alignment = { horizontal: 'center' };
  fila += 1;
  ws.getCell(fila, 1).value = 'Nombre: ________________';
  ws.getCell(fila, 1).font = { size: 8, color: { argb: 'FF888888' } };
  ws.mergeCells(fila, 2, fila, 3);
  ws.getCell(fila, 2).value = 'Nombre: ________________';
  ws.getCell(fila, 2).font = { size: 8, color: { argb: 'FF888888' } };
  fila += 1;
  ws.getCell(fila, 1).value = 'C.I.: __________________';
  ws.getCell(fila, 1).font = { size: 8, color: { argb: 'FF888888' } };
  ws.mergeCells(fila, 2, fila, 3);
  ws.getCell(fila, 2).value = 'Reg. Contador: __________________';
  ws.getCell(fila, 2).font = { size: 8, color: { argb: 'FF888888' } };
  return fila + 1;
}

function nuevaHoja(wb: ExcelJS.Workbook, nombre: string): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nombre, { pageSetup: { paperSize: 9, orientation: 'portrait', fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 14 }, { width: 42 }, { width: 18 }];
  return ws;
}

export async function descargarBalanceGeneralExcel(d: DatosBalanceGeneralPDF) {
  const wb = new ExcelJS.Workbook();
  const ws = nuevaHoja(wb, 'Balance General');

  let fila = encabezado(ws, d.razonSocial, d.ruc, d.direccion, 'ESTADO DE SITUACIÓN FINANCIERA', `Al ${d.fechaCorte.toLocaleDateString('es-EC')}`);

  fila = filaSeccion(ws, fila, 'ACTIVOS');
  for (const c of d.activos) fila = filaCuenta(ws, fila, c);
  fila = filaTotal(ws, fila, 'TOTAL ACTIVOS', d.totalActivo, true);

  fila += 1;
  fila = filaSeccion(ws, fila, 'PASIVOS');
  for (const c of d.pasivos) fila = filaCuenta(ws, fila, c);
  fila = filaTotal(ws, fila, 'TOTAL PASIVOS', d.totalPasivo);

  fila += 1;
  fila = filaSeccion(ws, fila, 'PATRIMONIO');
  for (const c of d.patrimonio) fila = filaCuenta(ws, fila, c);
  fila = filaTotal(ws, fila, 'TOTAL PATRIMONIO', d.totalPatrimonio);

  fila += 1;
  fila = filaTotal(ws, fila, 'TOTAL PASIVO + PATRIMONIO', round2(d.totalPasivo + d.totalPatrimonio), true);

  firmas(ws, fila);

  const fecha = d.fechaCorte.toISOString().split('T')[0];
  await descargar(wb, `balance_general_${fecha}.xlsx`);
}

export async function descargarEstadoResultadosExcel(d: DatosEstadoResultadosPDF) {
  const wb = new ExcelJS.Workbook();
  const ws = nuevaHoja(wb, 'Estado Resultados');

  let fila = encabezado(
    ws, d.razonSocial, d.ruc, d.direccion, 'ESTADO DE RESULTADOS',
    `Del ${d.desde.toLocaleDateString('es-EC')} al ${d.hasta.toLocaleDateString('es-EC')}`
  );

  fila = filaSeccion(ws, fila, 'INGRESOS OPERACIONALES');
  for (const c of d.ingresos) fila = filaCuenta(ws, fila, c);
  fila = filaTotal(ws, fila, 'TOTAL INGRESOS', d.totalIngresos);

  fila += 1;
  fila = filaSeccion(ws, fila, 'COSTO DE VENTAS');
  for (const c of d.costos) fila = filaCuenta(ws, fila, c);
  fila = filaTotal(ws, fila, 'TOTAL COSTOS', d.totalCostos);

  fila += 1;
  fila = filaTotal(ws, fila, 'UTILIDAD BRUTA', d.utilidadBruta, true);

  fila += 1;
  fila = filaSeccion(ws, fila, 'GASTOS OPERACIONALES');
  if (d.gastos.length === 0) {
    ws.mergeCells(fila, 1, fila, 3);
    ws.getCell(fila, 1).value = 'Sin gastos registrados en el período';
    ws.getCell(fila, 1).font = { italic: true, size: 9, color: { argb: 'FF999999' } };
    fila += 1;
  } else {
    for (const c of d.gastos) fila = filaCuenta(ws, fila, c);
  }
  fila = filaTotal(ws, fila, 'TOTAL GASTOS', d.totalGastos);

  fila += 1;
  fila = filaTotal(ws, fila, 'UTILIDAD NETA DEL PERÍODO', d.utilidadNeta, true);

  firmas(ws, fila);

  const desde = d.desde.toISOString().split('T')[0];
  const hasta = d.hasta.toISOString().split('T')[0];
  await descargar(wb, `estado_resultados_${desde}_${hasta}.xlsx`);
}

function round2(v: number): number { return Math.round((v + Number.EPSILON) * 100) / 100; }
