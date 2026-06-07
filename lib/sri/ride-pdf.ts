/**
 * Generador de RIDE (Representación Impresa del Documento Electrónico)
 * Cumple con el formato oficial exigido por el SRI Ecuador.
 *
 * Soporta:
 *  - Factura autorizada (con número de autorización de 49 dígitos)
 *  - Factura no autorizada / borrador (sin número, marca de agua)
 *  - Nota de venta autorizada
 *  - Nota de venta no autorizada
 *  - Recibo interno (sin validez tributaria — solo control interno)
 */

import jsPDF from 'jspdf';

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface ItemRIDE {
  codigo:        string;
  descripcion:   string;
  cantidad:      number;
  precioUnitario:number;
  descuento:     number;
  subtotal:      number;
  tieneIVA:      boolean;
}

export interface DatosRIDE {
  // Tipo de documento
  tipoDocumento: 'factura' | 'nota_venta' | 'recibo_interno';

  // Emisor
  razonSocial:      string;
  nombreComercial?: string;
  ruc:              string;
  direccionMatriz:  string;
  establecimiento:  string;
  puntoEmision:     string;
  contribuyenteEspecial?: string;
  obligadoContabilidad:   'SI' | 'NO';
  ambiente:         '1' | '2';  // 1=pruebas 2=producción

  // Numeración
  secuencial:       number;
  claveAcceso?:     string;

  // Autorización SRI (opcional — si no viene, se genera borrador)
  numeroAutorizacion?: string;
  fechaAutorizacion?:  string;

  // Fecha
  fechaEmision: Date;

  // Comprador
  tipoIdComprador:      string; // 04=RUC 05=cédula 07=consumidor final
  identificacionComprador: string;
  razonSocialComprador: string;
  direccionComprador?:  string;
  emailComprador?:      string;

  // Items
  items: ItemRIDE[];

  // Totales
  subtotal0:      number;
  subtotal15:     number;
  totalDescuento: number;
  iva:            number;
  total:          number;

  // Pago
  formaPago: string;  // 'efectivo' | 'tarjeta' | 'transferencia'

  // Mensaje adicional de pie de página (opcional)
  mensajeAdicional?: string;
}

// ── Constantes de diseño ──────────────────────────────────────────────────

const MARGIN   = 14;
const PW       = 210; // A4 width mm
const COLW     = PW - MARGIN * 2;
const FONT     = 'helvetica';

// Colores
const C_DARK   = '#1a1a2e';
const C_HEADER = '#0f3460';
const C_ACCENT = '#16213e';
const C_GRAY   = '#6b7280';
const C_LIGHT  = '#f3f4f6';
const C_BORDER = '#d1d5db';
const C_ORANGE = '#ea580c'; // para marca de agua / sin autorización
const C_GREEN  = '#166534'; // para autorizado

// ── Helper: hex a RGB ─────────────────────────────────────────────────────
function hex(h: string): [number, number, number] {
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return [r, g, b];
}

// ── Helper: wrap text ─────────────────────────────────────────────────────
function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth);
}

// ── Helper: línea horizontal ──────────────────────────────────────────────
function hline(doc: jsPDF, y: number, color = C_BORDER, lw = 0.2) {
  doc.setDrawColor(...hex(color));
  doc.setLineWidth(lw);
  doc.line(MARGIN, y, PW - MARGIN, y);
}

// ── Helper: celda de tabla ────────────────────────────────────────────────
function cell(
  doc:   jsPDF,
  text:  string,
  x:     number,
  y:     number,
  w:     number,
  h:     number,
  opts?: { align?: 'left'|'right'|'center'; bold?: boolean; size?: number; bg?: string; color?: string }
) {
  const align = opts?.align ?? 'left';
  const size  = opts?.size  ?? 8;
  const color = opts?.color ?? C_DARK;

  if (opts?.bg) {
    doc.setFillColor(...hex(opts.bg));
    doc.rect(x, y, w, h, 'F');
  }

  doc.setFont(FONT, opts?.bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...hex(color));

  const px = align === 'right'  ? x + w - 2
           : align === 'center' ? x + w / 2
           : x + 2;

  doc.text(text, px, y + h / 2 + size * 0.35, { align });
}

// ── Función principal ─────────────────────────────────────────────────────

export function generarRIDE(datos: DatosRIDE): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const estab  = datos.establecimiento.padStart(3, '0');
  const pto    = datos.puntoEmision.padStart(3, '0');
  const sec    = String(datos.secuencial).padStart(9, '0');
  const serie  = `${estab}-${pto}-${sec}`;
  const esRecibo = datos.tipoDocumento === 'recibo_interno';
  const tieneAutorizacion = !!datos.numeroAutorizacion && !esRecibo;

  const TITULO_DOC =
    datos.tipoDocumento === 'factura'       ? 'FACTURA'
    : datos.tipoDocumento === 'nota_venta'  ? 'NOTA DE VENTA'
    : 'RECIBO INTERNO';

  const COD_DOC =
    datos.tipoDocumento === 'factura'      ? '01'
    : datos.tipoDocumento === 'nota_venta' ? '18'
    : '00';

  // ── ENCABEZADO ───────────────────────────────────────────────────────────

  // Bloque izquierdo: datos del emisor
  const leftW = COLW * 0.55;
  doc.setFillColor(...hex(C_HEADER));
  doc.rect(MARGIN, y, leftW, 28, 'F');

  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  const nombrePrincipal = datos.nombreComercial || datos.razonSocial;
  doc.text(nombrePrincipal, MARGIN + 3, y + 7);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(200, 220, 255);
  const emisorLines = wrapText(doc, datos.razonSocial, leftW - 6);
  emisorLines.slice(0, 2).forEach((l, i) => doc.text(l, MARGIN + 3, y + 13 + i * 4));
  doc.text(`RUC: ${datos.ruc}`, MARGIN + 3, y + 22);

  const dirLines = wrapText(doc, datos.direccionMatriz, leftW - 6);
  doc.text(dirLines[0] ?? '', MARGIN + 3, y + 26);

  // Bloque derecho: tipo de documento + numeración
  const rightX = MARGIN + leftW + 2;
  const rightW = COLW - leftW - 2;

  doc.setFillColor(...hex(C_ACCENT));
  doc.rect(rightX, y, rightW, 28, 'F');

  doc.setFont(FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(TITULO_DOC, rightX + rightW / 2, y + 7, { align: 'center' });

  if (!esRecibo) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 200, 255);
    doc.text(`Cod. Doc: ${COD_DOC}`, rightX + 3, y + 13);
    doc.text(`No. ${serie}`, rightX + 3, y + 18);
    doc.text(`Fecha emisión: ${formatFecha(datos.fechaEmision)}`, rightX + 3, y + 23);
    const ambLabel = datos.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS';
    doc.text(`Ambiente: ${ambLabel}`, rightX + 3, y + 27);
  } else {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 200, 255);
    doc.text(`No. ${serie}`, rightX + 3, y + 16);
    doc.text(`Fecha: ${formatFecha(datos.fechaEmision)}`, rightX + 3, y + 22);
  }

  y += 31;

  // ── CLAVE DE ACCESO / AUTORIZACIÓN ──────────────────────────────────────
  if (!esRecibo) {
    if (tieneAutorizacion) {
      // Banda verde de autorización
      doc.setFillColor(...hex('#dcfce7'));
      doc.rect(MARGIN, y, COLW, 14, 'F');
      doc.setDrawColor(...hex('#16a34a'));
      doc.setLineWidth(0.4);
      doc.rect(MARGIN, y, COLW, 14, 'S');

      doc.setFont(FONT, 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...hex(C_GREEN));
      doc.text('AUTORIZADO POR EL SRI', MARGIN + 3, y + 4);
      doc.setFont(FONT, 'normal');
      doc.setFontSize(6.5);
      doc.text(`No. Autorización: ${datos.numeroAutorizacion}`, MARGIN + 3, y + 8);
      doc.text(`Fecha autorización: ${datos.fechaAutorizacion ?? ''}`, MARGIN + 3, y + 12);
    } else {
      // Banda naranja — no autorizado / borrador
      doc.setFillColor(...hex('#fff7ed'));
      doc.rect(MARGIN, y, COLW, 10, 'F');
      doc.setDrawColor(...hex('#ea580c'));
      doc.setLineWidth(0.4);
      doc.rect(MARGIN, y, COLW, 10, 'S');

      doc.setFont(FONT, 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...hex(C_ORANGE));
      doc.text('PENDIENTE DE AUTORIZACIÓN SRI — NO VÁLIDO COMO DOCUMENTO TRIBUTARIO', MARGIN + 3, y + 6);
    }

    if (datos.claveAcceso) {
      y += tieneAutorizacion ? 17 : 13;
      doc.setFillColor(...hex(C_LIGHT));
      doc.rect(MARGIN, y, COLW, 8, 'F');
      doc.setFont(FONT, 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...hex(C_GRAY));
      doc.text('CLAVE DE ACCESO:', MARGIN + 3, y + 5);
      doc.setFont(FONT, 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...hex(C_DARK));
      // Dividir clave en grupos de 8 para legibilidad
      const claveGrupos = datos.claveAcceso.match(/.{1,8}/g)?.join(' ') ?? datos.claveAcceso;
      doc.text(claveGrupos, MARGIN + 40, y + 5);
      y += 11;
    } else {
      y += tieneAutorizacion ? 17 : 13;
    }
  }

  // ── DATOS DEL COMPRADOR ──────────────────────────────────────────────────
  hline(doc, y, C_BORDER);
  y += 3;

  doc.setFillColor(...hex(C_LIGHT));
  doc.rect(MARGIN, y, COLW, 5, 'F');
  doc.setFont(FONT, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...hex(C_ACCENT));
  doc.text('DATOS DEL COMPRADOR', MARGIN + 3, y + 3.5);
  y += 7;

  const tipoIdLabel =
    datos.tipoIdComprador === '04' ? 'RUC'
    : datos.tipoIdComprador === '05' ? 'Cédula'
    : datos.tipoIdComprador === '06' ? 'Pasaporte'
    : datos.tipoIdComprador === '07' ? 'Cons. Final'
    : datos.tipoIdComprador;

  const col2 = COLW / 2;

  // Fila 1
  doc.setFont(FONT, 'bold'); doc.setFontSize(7); doc.setTextColor(...hex(C_GRAY));
  doc.text('Razón Social / Nombre:', MARGIN, y);
  doc.setFont(FONT, 'normal'); doc.setTextColor(...hex(C_DARK));
  doc.text(datos.razonSocialComprador, MARGIN + 38, y);

  doc.setFont(FONT, 'bold'); doc.setTextColor(...hex(C_GRAY));
  doc.text(`${tipoIdLabel}:`, MARGIN + col2 + 2, y);
  doc.setFont(FONT, 'normal'); doc.setTextColor(...hex(C_DARK));
  doc.text(datos.identificacionComprador, MARGIN + col2 + 20, y);
  y += 5;

  // Fila 2
  if (datos.direccionComprador) {
    doc.setFont(FONT, 'bold'); doc.setFontSize(7); doc.setTextColor(...hex(C_GRAY));
    doc.text('Dirección:', MARGIN, y);
    doc.setFont(FONT, 'normal'); doc.setTextColor(...hex(C_DARK));
    doc.text(datos.direccionComprador.slice(0, 60), MARGIN + 20, y);
    y += 5;
  }

  // Fila 3
  doc.setFont(FONT, 'bold'); doc.setFontSize(7); doc.setTextColor(...hex(C_GRAY));
  doc.text('Forma de pago:', MARGIN, y);
  doc.setFont(FONT, 'normal'); doc.setTextColor(...hex(C_DARK));
  doc.text(FORMA_PAGO_LABEL[datos.formaPago] ?? datos.formaPago, MARGIN + 28, y);

  if (datos.obligadoContabilidad) {
    doc.setFont(FONT, 'bold'); doc.setTextColor(...hex(C_GRAY));
    doc.text('Oblig. contabilidad:', MARGIN + col2 + 2, y);
    doc.setFont(FONT, 'normal'); doc.setTextColor(...hex(C_DARK));
    doc.text(datos.obligadoContabilidad, MARGIN + col2 + 38, y);
  }
  y += 7;

  // ── TABLA DE PRODUCTOS ───────────────────────────────────────────────────
  hline(doc, y, C_BORDER);
  y += 2;

  // Cabecera tabla
  const colsFactura = [
    { label: 'Cód.',       x: MARGIN,      w: 18, align: 'left'  as const },
    { label: 'Descripción',x: MARGIN + 18, w: 64, align: 'left'  as const },
    { label: 'Cant.',      x: MARGIN + 82, w: 14, align: 'right' as const },
    { label: 'P. Unit.',   x: MARGIN + 96, w: 22, align: 'right' as const },
    { label: 'Desc.',      x: MARGIN + 118,w: 18, align: 'right' as const },
    { label: 'Subtotal',   x: MARGIN + 136,w: 22, align: 'right' as const },
    { label: 'IVA',        x: MARGIN + 158,w: 10, align: 'center'as const },
  ];
  const colsNota = [
    { label: 'Cód.',       x: MARGIN,      w: 18, align: 'left'  as const },
    { label: 'Descripción',x: MARGIN + 18, w: 72, align: 'left'  as const },
    { label: 'Cant.',      x: MARGIN + 90, w: 16, align: 'right' as const },
    { label: 'P. Unit.',   x: MARGIN + 106,w: 24, align: 'right' as const },
    { label: 'Desc.',      x: MARGIN + 130,w: 18, align: 'right' as const },
    { label: 'Total',      x: MARGIN + 148,w: 24, align: 'right' as const },
  ];
  const cols = datos.tipoDocumento === 'factura' ? colsFactura : colsNota;
  const ROW_H = 5;

  // Fondo cabecera
  doc.setFillColor(...hex(C_HEADER));
  doc.rect(MARGIN, y, COLW, ROW_H + 1, 'F');
  cols.forEach(c => {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    const px = c.align === 'right'  ? c.x + c.w - 2
             : c.align === 'center' ? c.x + c.w / 2
             : c.x + 2;
    doc.text(c.label, px, y + ROW_H - 0.5, { align: c.align });
  });
  y += ROW_H + 2;

  // Filas de productos
  datos.items.forEach((item, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : C_LIGHT;
    doc.setFillColor(...hex(bg));
    doc.rect(MARGIN, y, COLW, ROW_H + 1, 'F');

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...hex(C_DARK));

    if (datos.tipoDocumento === 'factura') {
      const cf = colsFactura;
      doc.text(item.codigo.slice(0, 8),                  cf[0].x + 2,         y + ROW_H - 1);
      const descLines = wrapText(doc, item.descripcion, cf[1].w - 3);
      doc.text(descLines[0] ?? '',                       cf[1].x + 2,         y + ROW_H - 1);
      doc.text(fmt(item.cantidad, 0),                    cf[2].x + cf[2].w - 2, y + ROW_H - 1, { align: 'right' });
      doc.text(usd(item.precioUnitario),                 cf[3].x + cf[3].w - 2, y + ROW_H - 1, { align: 'right' });
      doc.text(usd(item.descuento),                      cf[4].x + cf[4].w - 2, y + ROW_H - 1, { align: 'right' });
      doc.text(usd(item.subtotal),                       cf[5].x + cf[5].w - 2, y + ROW_H - 1, { align: 'right' });
      doc.text(item.tieneIVA ? '15%' : '0%',            cf[6].x + cf[6].w / 2, y + ROW_H - 1, { align: 'center' });
    } else {
      const cn = colsNota;
      doc.text(item.codigo.slice(0, 8),                  cn[0].x + 2,         y + ROW_H - 1);
      const descLines = wrapText(doc, item.descripcion, cn[1].w - 3);
      doc.text(descLines[0] ?? '',                       cn[1].x + 2,         y + ROW_H - 1);
      doc.text(fmt(item.cantidad, 0),                    cn[2].x + cn[2].w - 2, y + ROW_H - 1, { align: 'right' });
      doc.text(usd(item.precioUnitario),                 cn[3].x + cn[3].w - 2, y + ROW_H - 1, { align: 'right' });
      doc.text(usd(item.descuento),                      cn[4].x + cn[4].w - 2, y + ROW_H - 1, { align: 'right' });
      doc.text(usd(item.subtotal),                       cn[5].x + cn[5].w - 2, y + ROW_H - 1, { align: 'right' });
    }

    y += ROW_H + 1;
  });

  hline(doc, y, C_BORDER);
  y += 3;

  // ── TOTALES ──────────────────────────────────────────────────────────────
  const totX  = MARGIN + COLW * 0.55;
  const totW1 = 40;
  const totW2 = COLW * 0.45 - totW1;

  function totRow(label: string, valor: string, bold = false, bgColor?: string) {
    if (bgColor) {
      doc.setFillColor(...hex(bgColor));
      doc.rect(totX, y - 3.5, totW1 + totW2, 5, 'F');
    }
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...hex(bold ? C_DARK : C_GRAY));
    doc.text(label, totX + totW1 - 2, y, { align: 'right' });
    doc.text(valor, totX + totW1 + totW2 - 2, y, { align: 'right' });
    y += 5;
  }

  if (datos.tipoDocumento === 'factura') {
    if (datos.subtotal0 > 0)
      totRow('Subtotal IVA 0%:', usd(datos.subtotal0));
    if (datos.subtotal15 > 0)
      totRow('Subtotal IVA 15%:', usd(datos.subtotal15));
    if (datos.totalDescuento > 0)
      totRow('Descuento total:', usd(datos.totalDescuento));
    totRow('IVA 15%:', usd(datos.iva));
  } else {
    if (datos.totalDescuento > 0)
      totRow('Descuento total:', usd(datos.totalDescuento));
    totRow('Subtotal:', usd(datos.subtotal0 + datos.subtotal15));
  }

  y += 1;
  totRow('VALOR TOTAL:', usd(datos.total), true, '#dbeafe');
  y += 2;

  // ── INFORMACIÓN ADICIONAL / PIE ──────────────────────────────────────────
  if (datos.mensajeAdicional) {
    hline(doc, y, C_BORDER);
    y += 4;
    doc.setFont(FONT, 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...hex(C_GRAY));
    const msgLines = wrapText(doc, datos.mensajeAdicional, COLW);
    msgLines.forEach(l => { doc.text(l, MARGIN, y); y += 4; });
  }

  // Nota legal para recibo interno
  if (esRecibo) {
    hline(doc, y, C_BORDER);
    y += 4;
    doc.setFillColor(...hex('#fef3c7'));
    doc.rect(MARGIN, y - 2, COLW, 10, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...hex('#92400e'));
    doc.text('DOCUMENTO SIN VALIDEZ TRIBUTARIA — SOLO PARA CONTROL INTERNO', MARGIN + 3, y + 2);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(6.5);
    doc.text('Este recibo no sustituye a una factura o nota de venta. No es deducible de impuestos.', MARGIN + 3, y + 6);
    y += 13;
  }

  // Nota legal SRI para documentos no autorizados
  if (!esRecibo && !tieneAutorizacion) {
    hline(doc, y, C_ORANGE, 0.3);
    y += 4;
    doc.setFont(FONT, 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(...hex(C_ORANGE));
    doc.text(
      'Este documento es un borrador. Para tener validez tributaria debe ser autorizado por el SRI.',
      MARGIN, y
    );
    y += 5;
  }

  // Pie de página
  hline(doc, y + 3, C_BORDER, 0.15);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...hex(C_GRAY));
  doc.text(
    'Documento generado por sistema de gestión · www.sri.gob.ec',
    PW / 2, y + 7, { align: 'center' }
  );

  return doc.output('arraybuffer') as unknown as Uint8Array;
}

// ── Helpers de formato ────────────────────────────────────────────────────

function usd(v: number): string {
  return `$${v.toFixed(2)}`;
}

function fmt(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

function formatFecha(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

const FORMA_PAGO_LABEL: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta de crédito/débito',
  transferencia: 'Transferencia bancaria',
  cheque:        'Cheque',
  '01':          'Efectivo',
  '16':          'Tarjeta',
  '19':          'Transferencia',
  '20':          'Cheque',
};

// ── Descarga en el browser ────────────────────────────────────────────────

export function descargarRIDE(datos: DatosRIDE, nombreArchivo?: string): void {
  const bytes  = generarRIDE(datos);
  const blob   = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url    = URL.createObjectURL(blob);
  const estab  = datos.establecimiento.padStart(3, '0');
  const pto    = datos.puntoEmision.padStart(3, '0');
  const sec    = String(datos.secuencial).padStart(9, '0');
  const nombre = nombreArchivo ?? `RIDE-${estab}-${pto}-${sec}.pdf`;
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export function abrirRIDEenNuevaPestana(datos: DatosRIDE): void {
  const bytes = generarRIDE(datos);
  const blob  = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
