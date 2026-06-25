/**
 * Generador de ticket/recibo de venta en PDF
 * Optimizado para impresora Zebra ZQ320 (papel 72mm / ~204pt)
 *
 * El PDF se genera con ancho fijo de 72mm y alto dinámico según
 * la cantidad de ítems, para aprovechar el rollo térmico continuo.
 */

import jsPDF from 'jspdf';
import { Venta } from '@/types';

// ── Dimensiones Zebra ZQ320 ─────────────────────────────────────────────

const TICKET_W   = 72;   // mm — ancho del papel
const MARGIN     = 3;    // mm
const CW         = TICKET_W - MARGIN * 2; // contenido útil: 66mm
const FONT       = 'helvetica';
const LINE_H     = 3.5;  // altura de línea normal
const LINE_S     = 3;    // altura de línea pequeña

// ── Helpers ─────────────────────────────────────────────────────────────

function usd(v: number): string { return (v ?? 0).toFixed(2); }

function formatFecha(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

function dashedLine(doc: jsPDF, y: number) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.1);
  const step = 1.5;
  for (let x = MARGIN; x < TICKET_W - MARGIN; x += step * 2) {
    doc.line(x, y, Math.min(x + step, TICKET_W - MARGIN), y);
  }
}

const FORMA_PAGO_LABEL: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  transferencia: 'Transferencia',
  credito:       'Crédito',
};

// ── Datos que necesita el ticket ────────────────────────────────────────

export interface DatosTicket {
  // Emisor
  nombreNegocio:    string;
  ruc:              string;
  direccion:        string;
  telefono?:        string;

  // Venta
  venta:            Venta;
  numeracion?:      string; // ej. "NV-001-001-000000042"
}

// ── Generador ───────────────────────────────────────────────────────────

export function generarTicketVenta(datos: DatosTicket): Uint8Array {
  const { venta } = datos;
  const items = venta.items;

  // Calcular alto dinámico
  const headerH     = 28;
  const infoClientH = 14;
  const tableHeaderH = 5;
  const itemsH      = items.length * 8;
  const totalsH     = 30;
  const footerH     = 20;
  const extraH      = 10;
  const totalH      = headerH + infoClientH + tableHeaderH + itemsH + totalsH + footerH + extraH;

  const doc = new jsPDF({
    unit:       'mm',
    format:     [TICKET_W, Math.max(totalH, 80)],
    orientation:'portrait',
  });

  let y = MARGIN + 1;

  // ═══ CABECERA ═══
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(datos.nombreNegocio, TICKET_W / 2, y, { align: 'center' });
  y += LINE_H + 0.5;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(6);
  doc.text(`RUC: ${datos.ruc}`, TICKET_W / 2, y, { align: 'center' });
  y += LINE_S;

  const dirLines = doc.splitTextToSize(datos.direccion, CW);
  dirLines.forEach((line: string) => {
    doc.text(line, TICKET_W / 2, y, { align: 'center' });
    y += LINE_S;
  });

  if (datos.telefono) {
    doc.text(`Tel: ${datos.telefono}`, TICKET_W / 2, y, { align: 'center' });
    y += LINE_S;
  }

  y += 1;
  dashedLine(doc, y);
  y += 2;

  // ═══ TIPO DOC + NUMERACIÓN ═══
  doc.setFont(FONT, 'bold');
  doc.setFontSize(8);
  doc.text('NOTA DE VENTA', TICKET_W / 2, y, { align: 'center' });
  y += LINE_H;

  if (datos.numeracion) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(6);
    doc.text(datos.numeracion, TICKET_W / 2, y, { align: 'center' });
    y += LINE_S;
  }

  y += 1;
  dashedLine(doc, y);
  y += 2;

  // ═══ INFO VENTA ═══
  doc.setFontSize(6);
  const fecha = (venta.fecha as any)?.toDate?.() ?? new Date(venta.fecha);
  doc.setFont(FONT, 'bold');
  doc.text('Fecha:', MARGIN, y);
  doc.setFont(FONT, 'normal');
  doc.text(formatFecha(fecha), MARGIN + 12, y);
  y += LINE_S;

  doc.setFont(FONT, 'bold');
  doc.text('Cliente:', MARGIN, y);
  doc.setFont(FONT, 'normal');
  doc.text(venta.clienteNombre, MARGIN + 14, y);
  y += LINE_S;

  doc.setFont(FONT, 'bold');
  doc.text('CI/RUC:', MARGIN, y);
  doc.setFont(FONT, 'normal');
  doc.text(venta.clienteIdentificacion, MARGIN + 14, y);
  y += LINE_S;

  doc.setFont(FONT, 'bold');
  doc.text('Vendedor:', MARGIN, y);
  doc.setFont(FONT, 'normal');
  doc.text(venta.usuarioNombre, MARGIN + 16, y);
  y += LINE_S + 1;

  dashedLine(doc, y);
  y += 2;

  // ═══ TABLA DE ITEMS ═══
  // Encabezado
  doc.setFont(FONT, 'bold');
  doc.setFontSize(5.5);
  doc.text('Cant', MARGIN, y);
  doc.text('Descripción', MARGIN + 9, y);
  doc.text('P.U.', TICKET_W - MARGIN - 14, y, { align: 'right' });
  doc.text('Total', TICKET_W - MARGIN, y, { align: 'right' });
  y += 1;
  dashedLine(doc, y);
  y += 2;

  // Items
  doc.setFont(FONT, 'normal');
  doc.setFontSize(5.5);
  items.forEach(item => {
    const nombre = item.nombre.length > 22
      ? item.nombre.substring(0, 22) + '..'
      : item.nombre;

    doc.text(String(item.cantidad), MARGIN, y);
    doc.text(nombre, MARGIN + 9, y);
    doc.text(usd(item.precioUnitario), TICKET_W - MARGIN - 14, y, { align: 'right' });
    doc.text(usd(item.subtotal), TICKET_W - MARGIN, y, { align: 'right' });
    y += LINE_S;

    if (item.descuento > 0) {
      doc.setFontSize(5);
      doc.text(`  Desc: ${item.descuento}%`, MARGIN + 9, y);
      y += LINE_S;
      doc.setFontSize(5.5);
    }
  });

  y += 1;
  dashedLine(doc, y);
  y += 2;

  // ═══ TOTALES ═══
  doc.setFontSize(6);
  const rightCol = TICKET_W - MARGIN;
  const labelX   = MARGIN;

  doc.setFont(FONT, 'normal');
  doc.text('Subtotal:', labelX, y);
  doc.text(`$${usd(venta.subtotal)}`, rightCol, y, { align: 'right' });
  y += LINE_S;

  if (venta.descuentoGlobal > 0) {
    doc.text(`Descuento (${venta.descuentoGlobal}%):`, labelX, y);
    const montoDesc = venta.subtotal * (venta.descuentoGlobal / 100);
    doc.text(`-$${usd(montoDesc)}`, rightCol, y, { align: 'right' });
    y += LINE_S;
  }

  y += 1;
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  doc.text('TOTAL:', labelX, y);
  doc.text(`$${usd(venta.total)}`, rightCol, y, { align: 'right' });
  y += LINE_H + 1;

  doc.setFont(FONT, 'normal');
  doc.setFontSize(6);
  doc.text(`Forma de pago: ${FORMA_PAGO_LABEL[venta.metodoPago] ?? venta.metodoPago}`, labelX, y);
  y += LINE_S + 1;

  dashedLine(doc, y);
  y += 3;

  // ═══ PIE ═══
  doc.setFontSize(6);
  doc.setFont(FONT, 'normal');
  doc.text('*** GRACIAS POR SU COMPRA ***', TICKET_W / 2, y, { align: 'center' });
  y += LINE_S;
  doc.text('Este documento no tiene validez tributaria', TICKET_W / 2, y, { align: 'center' });
  y += LINE_S;
  doc.setFontSize(5);
  doc.text(`Impreso: ${formatFecha(new Date())}`, TICKET_W / 2, y, { align: 'center' });

  return doc.output('arraybuffer') as unknown as Uint8Array;
}

// ── Descargar ───────────────────────────────────────────────────────────

export function descargarTicket(datos: DatosTicket) {
  const bytes = generarTicketVenta(datos);
  const blob  = new Blob([bytes], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  const fecha = (datos.venta.fecha as any)?.toDate?.() ?? new Date(datos.venta.fecha);
  const dd    = String(fecha.getDate()).padStart(2, '0');
  const mm    = String(fecha.getMonth() + 1).padStart(2, '0');
  a.download  = `ticket-${dd}${mm}${fecha.getFullYear()}-${datos.venta.id.slice(-6)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function abrirTicketEnNuevaPestana(datos: DatosTicket) {
  const bytes = generarTicketVenta(datos);
  const blob  = new Blob([bytes], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
