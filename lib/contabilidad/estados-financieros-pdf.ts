/**
 * Generador de PDF formal para estados financieros (Balance General / Estado
 * de Situación Financiera y Estado de Resultados) — formato de documento
 * para imprimir y firmar (gerente / contador), no un volcado de datos.
 */
import jsPDF from 'jspdf';

const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

function currency(v: number): string {
  const n = Math.abs(v).toFixed(2);
  return v < 0 ? `(${n})` : n;
}

function nuevaPagina(doc: jsPDF): number {
  doc.addPage();
  return MARGIN;
}

function asegurarEspacio(doc: jsPDF, y: number, necesario = 8): number {
  if (y + necesario > PAGE_H - 35) return nuevaPagina(doc);
  return y;
}

function encabezado(doc: jsPDF, razonSocial: string, ruc: string, direccion: string | undefined, titulo: string, subtitulo: string): number {
  let y = MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(razonSocial || 'EMPRESA', PAGE_W / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`RUC: ${ruc || '-'}`, PAGE_W / 2, y, { align: 'center' });
  y += 5;
  if (direccion) {
    doc.text(direccion, PAGE_W / 2, y, { align: 'center' });
    y += 5;
  }
  y += 3;
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(titulo, PAGE_W / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(subtitulo, PAGE_W / 2, y, { align: 'center' });
  y += 9;
  return y;
}

function seccionHeader(doc: jsPDF, y: number, titulo: string): number {
  doc.setFillColor(235, 235, 235);
  doc.rect(MARGIN, y - 4.5, CONTENT_W, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0);
  doc.text(titulo, MARGIN + 2, y);
  return y + 7;
}

function filaCuenta(doc: jsPDF, y: number, codigo: string, nombre: string, monto: number): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(codigo, MARGIN + 2, y);
  doc.setTextColor(30);
  doc.text(nombre, MARGIN + 25, y);
  doc.text(`$${currency(monto)}`, PAGE_W - MARGIN - 2, y, { align: 'right' });
  return y + 5.5;
}

function filaTotal(doc: jsPDF, y: number, etiqueta: string, monto: number, destacar = false): number {
  doc.setDrawColor(150);
  doc.setLineWidth(0.2);
  doc.line(PAGE_W - MARGIN - 45, y - 3.8, PAGE_W - MARGIN, y - 3.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(destacar ? 10.5 : 9.5);
  doc.setTextColor(0);
  doc.text(etiqueta, MARGIN + 2, y);
  doc.text(`$${currency(monto)}`, PAGE_W - MARGIN - 2, y, { align: 'right' });
  return y + (destacar ? 8 : 7);
}

function firmas(doc: jsPDF, y: number): number {
  if (y + 35 > PAGE_H - 20) y = nuevaPagina(doc);
  y += 15;
  const colW = (CONTENT_W - 20) / 2;
  const x1 = MARGIN;
  const x2 = MARGIN + colW + 20;

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x1 + colW, y);
  doc.line(x2, y, x2 + colW, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text('GERENTE GENERAL', x1 + colW / 2, y, { align: 'center' });
  doc.text('CONTADOR', x2 + colW / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text('Nombre: _______________________', x1, y);
  doc.text('Nombre: _______________________', x2, y);
  y += 5;
  doc.text('C.I.: __________________________', x1, y);
  doc.text('Reg. Contador: _________________', x2, y);
  return y;
}

function piePagina(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(
      `Generado por el sistema el ${new Date().toLocaleString('es-EC')} — Página ${i} de ${total}`,
      PAGE_W / 2, PAGE_H - 10, { align: 'center' }
    );
  }
}

// ── Balance General ─────────────────────────────────────────────────────

export interface CuentaMonto { codigo: string; nombre: string; saldo: number }

export interface DatosBalanceGeneralPDF {
  razonSocial: string;
  ruc: string;
  direccion?: string;
  fechaCorte: Date;
  activos: CuentaMonto[];
  pasivos: CuentaMonto[];
  patrimonio: CuentaMonto[];
  totalActivo: number;
  totalPasivo: number;
  totalPatrimonio: number;
}

export function generarBalanceGeneralPDF(d: DatosBalanceGeneralPDF): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = encabezado(
    doc, d.razonSocial, d.ruc, d.direccion,
    'ESTADO DE SITUACIÓN FINANCIERA',
    `Al ${d.fechaCorte.toLocaleDateString('es-EC')}`
  );

  y = seccionHeader(doc, y, 'ACTIVOS');
  for (const r of d.activos) { y = asegurarEspacio(doc, y); y = filaCuenta(doc, y, r.codigo, r.nombre, r.saldo); }
  y = filaTotal(doc, y + 1, 'TOTAL ACTIVOS', d.totalActivo, true);

  y += 4;
  y = asegurarEspacio(doc, y);
  y = seccionHeader(doc, y, 'PASIVOS');
  for (const r of d.pasivos) { y = asegurarEspacio(doc, y); y = filaCuenta(doc, y, r.codigo, r.nombre, r.saldo); }
  y = filaTotal(doc, y + 1, 'TOTAL PASIVOS', d.totalPasivo);

  y += 4;
  y = asegurarEspacio(doc, y);
  y = seccionHeader(doc, y, 'PATRIMONIO');
  for (const r of d.patrimonio) { y = asegurarEspacio(doc, y); y = filaCuenta(doc, y, r.codigo, r.nombre, r.saldo); }
  y = filaTotal(doc, y + 1, 'TOTAL PATRIMONIO', d.totalPatrimonio);

  y += 2;
  y = asegurarEspacio(doc, y, 14);
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;
  y = filaTotal(doc, y, 'TOTAL PASIVO + PATRIMONIO', round2(d.totalPasivo + d.totalPatrimonio), true);

  firmas(doc, y);
  piePagina(doc);
  return doc;
}

export function descargarBalanceGeneralPDF(d: DatosBalanceGeneralPDF) {
  const doc = generarBalanceGeneralPDF(d);
  const fecha = d.fechaCorte.toISOString().split('T')[0];
  doc.save(`balance_general_${fecha}.pdf`);
}

// ── Estado de Resultados ────────────────────────────────────────────────

export interface DatosEstadoResultadosPDF {
  razonSocial: string;
  ruc: string;
  direccion?: string;
  desde: Date;
  hasta: Date;
  ingresos: CuentaMonto[];
  costos: CuentaMonto[];
  gastos: CuentaMonto[];
  totalIngresos: number;
  totalCostos: number;
  totalGastos: number;
  utilidadBruta: number;
  utilidadNeta: number;
}

export function generarEstadoResultadosPDF(d: DatosEstadoResultadosPDF): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = encabezado(
    doc, d.razonSocial, d.ruc, d.direccion,
    'ESTADO DE RESULTADOS',
    `Del ${d.desde.toLocaleDateString('es-EC')} al ${d.hasta.toLocaleDateString('es-EC')}`
  );

  y = seccionHeader(doc, y, 'INGRESOS OPERACIONALES');
  for (const r of d.ingresos) { y = asegurarEspacio(doc, y); y = filaCuenta(doc, y, r.codigo, r.nombre, r.saldo); }
  y = filaTotal(doc, y + 1, 'TOTAL INGRESOS', d.totalIngresos);

  y += 4;
  y = asegurarEspacio(doc, y);
  y = seccionHeader(doc, y, 'COSTO DE VENTAS');
  for (const r of d.costos) { y = asegurarEspacio(doc, y); y = filaCuenta(doc, y, r.codigo, r.nombre, r.saldo); }
  y = filaTotal(doc, y + 1, 'TOTAL COSTOS', d.totalCostos);

  y += 2;
  y = filaTotal(doc, y, 'UTILIDAD BRUTA', d.utilidadBruta, true);

  y += 4;
  y = asegurarEspacio(doc, y);
  y = seccionHeader(doc, y, 'GASTOS OPERACIONALES');
  if (d.gastos.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(140);
    doc.text('Sin gastos registrados en el período', MARGIN + 2, y);
    y += 6;
  } else {
    for (const r of d.gastos) { y = asegurarEspacio(doc, y); y = filaCuenta(doc, y, r.codigo, r.nombre, r.saldo); }
  }
  y = filaTotal(doc, y + 1, 'TOTAL GASTOS', d.totalGastos);

  y += 2;
  y = asegurarEspacio(doc, y, 14);
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;
  y = filaTotal(doc, y, 'UTILIDAD NETA DEL PERÍODO', d.utilidadNeta, true);

  firmas(doc, y);
  piePagina(doc);
  return doc;
}

export function descargarEstadoResultadosPDF(d: DatosEstadoResultadosPDF) {
  const doc = generarEstadoResultadosPDF(d);
  const desde = d.desde.toISOString().split('T')[0];
  const hasta = d.hasta.toISOString().split('T')[0];
  doc.save(`estado_resultados_${desde}_${hasta}.pdf`);
}

function round2(v: number): number { return Math.round((v + Number.EPSILON) * 100) / 100; }
