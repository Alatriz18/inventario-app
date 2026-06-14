/**
 * Generador de RIDE (Representación Impresa del Documento Electrónico)
 * Sigue el formato oficial del SRI Ecuador: cajas bordeadas en blanco y negro,
 * cabecera dividida (emisor / documento), clave de acceso con código de barras,
 * datos del comprador, detalle y totales.
 *
 * Soporta:
 *  - Factura (01)
 *  - Nota de venta (18)
 *  - Nota de crédito (04)
 *  - Nota de débito (05)
 *  - Comprobante de retención (07)
 *  - Recibo interno (sin validez tributaria)
 */

import jsPDF from 'jspdf';

// ── Tipos ─────────────────────────────────────────────────────────────────

export type TipoDocRIDE =
  | 'factura' | 'nota_venta' | 'nota_credito' | 'nota_debito'
  | 'retencion' | 'recibo_interno';

export interface ItemRIDE {
  codigo:        string;
  descripcion:   string;
  cantidad:      number;
  precioUnitario:number;
  descuento:     number;
  subtotal:      number;
  tieneIVA:      boolean;
}

/** Una línea de la tabla de retenciones (solo tipoDocumento='retencion') */
export interface LineaRetencionRIDE {
  comprobante:    string; // ej. "01 001-001-000000123"
  fechaEmision:   string; // dd/MM/yyyy
  ejercicioFiscal:string; // MM/AAAA
  impuesto:       string; // "RENTA" | "IVA"
  codigo:         string;
  baseImponible:  number;
  porcentaje:     number;
  valorRetenido:  number;
}

/** Motivo de una nota de débito */
export interface MotivoRIDE {
  razon: string;
  valor: number;
}

export interface DatosRIDE {
  tipoDocumento: TipoDocRIDE;

  // Emisor
  razonSocial:      string;
  nombreComercial?: string;
  ruc:              string;
  direccionMatriz:  string;
  direccionSucursal?: string;
  establecimiento:  string;
  puntoEmision:     string;
  contribuyenteEspecial?: string;
  obligadoContabilidad:   'SI' | 'NO';
  ambiente:         '1' | '2';  // 1=pruebas 2=producción

  // Numeración
  secuencial:       number;
  claveAcceso?:     string;

  // Autorización SRI (opcional)
  numeroAutorizacion?: string;
  fechaAutorizacion?:  string;

  // Fecha de emisión
  fechaEmision: Date;

  // Comprador / sujeto retenido
  tipoIdComprador:      string;
  identificacionComprador: string;
  razonSocialComprador: string;
  direccionComprador?:  string;
  emailComprador?:      string;

  // Documento modificado (notas de crédito / débito)
  docModificado?: { tipo: string; numero: string; fecha: string };
  motivoModificacion?: string;      // nota de crédito
  motivos?:            MotivoRIDE[]; // nota de débito

  // Retención
  periodoFiscal?:     string;
  retenciones?:       LineaRetencionRIDE[];

  // Ítems (factura / nota de venta / NC / ND con detalle)
  items: ItemRIDE[];

  // Totales
  subtotal0:      number;
  subtotal15:     number;
  totalDescuento: number;
  iva:            number;
  total:          number;

  // Pago
  formaPago: string;

  // Mensaje adicional
  mensajeAdicional?: string;
}

// ── Constantes de diseño ──────────────────────────────────────────────────

const MARGIN = 12;
const PW     = 210;
const COLW   = PW - MARGIN * 2;
const FONT   = 'helvetica';

const BLACK  = '#000000';
const GRAY   = '#555555';
const LIGHT  = '#f0f0f0';
const ORANGE = '#c2410c';

// ── Helpers ─────────────────────────────────────────────────────────────────

function hex(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function box(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...hex(BLACK));
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, 'S');
}

function label(doc: jsPDF, text: string, x: number, y: number, size = 7) {
  doc.setFont(FONT, 'bold'); doc.setFontSize(size); doc.setTextColor(...hex(BLACK));
  doc.text(text, x, y);
}

function value(doc: jsPDF, text: string, x: number, y: number, size = 7) {
  doc.setFont(FONT, 'normal'); doc.setFontSize(size); doc.setTextColor(...hex(BLACK));
  doc.text(text, x, y);
}

function wrap(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text ?? '', maxWidth);
}

function usd(v: number): string { return `${(v ?? 0).toFixed(2)}`; }
function num(v: number, d = 2): string { return (v ?? 0).toFixed(d); }

function formatFecha(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const FORMA_PAGO_LABEL: Record<string, string> = {
  efectivo: 'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO', tarjeta: 'TARJETA DE CRÉDITO/DÉBITO',
  transferencia: 'TRANSFERENCIA / DÉBITO', cheque: 'CHEQUE',
  '01': 'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO', '16': 'TARJETA DE CRÉDITO/DÉBITO',
  '19': 'TRANSFERENCIA / DÉBITO', '20': 'CHEQUE',
};

const TITULO: Record<TipoDocRIDE, string> = {
  factura: 'FACTURA', nota_venta: 'NOTA DE VENTA', nota_credito: 'NOTA DE CRÉDITO',
  nota_debito: 'NOTA DE DÉBITO', retencion: 'COMPROBANTE DE RETENCIÓN', recibo_interno: 'RECIBO INTERNO',
};

const COD_DOC: Record<TipoDocRIDE, string> = {
  factura: '01', nota_venta: '18', nota_credito: '04',
  nota_debito: '05', retencion: '07', recibo_interno: '00',
};

/**
 * Tabla de patrones Code128 (valores 0-106). Cada patrón son los anchos de
 * 6 módulos alternando barra-espacio-barra-espacio-barra-espacio (la parada
 * tiene 7). 103=Start A, 104=Start B, 105=Start C, 106=Stop.
 */
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
];

/**
 * Calcula los codewords Code128-C para una cadena numérica. Si la longitud es
 * impar, el último dígito se codifica conmutando a Code B (codeword 100).
 */
function code128cCodewords(data: string): number[] {
  const codes: number[] = [105]; // Start C
  let i = 0;
  while (i + 1 < data.length) {
    codes.push(parseInt(data.substr(i, 2), 10));
    i += 2;
  }
  if (i < data.length) {
    codes.push(100);                        // Code B
    codes.push(data.charCodeAt(i) - 32);    // dígito como ASCII en Code B
  }
  let sum = codes[0];
  for (let k = 1; k < codes.length; k++) sum += codes[k] * k;
  codes.push(sum % 103);                     // checksum
  codes.push(106);                           // Stop
  return codes;
}

/**
 * Dibuja un código de barras Code128 escaneable de la clave de acceso (49
 * dígitos numéricos). El ancho de módulo se ajusta para llenar el espacio.
 */
function drawCode128(doc: jsPDF, clave: string, x: number, y: number, w: number, h: number) {
  const data     = (clave || '').replace(/\D/g, '');
  const codes    = code128cCodewords(data);
  const patterns = codes.map(c => CODE128_PATTERNS[c]);

  let totalModules = 0;
  patterns.forEach(p => { for (const ch of p) totalModules += parseInt(ch, 10); });
  const mw = w / totalModules;

  doc.setFillColor(...hex(BLACK));
  let cx = x;
  patterns.forEach(p => {
    for (let j = 0; j < p.length; j++) {
      const bw = parseInt(p[j], 10) * mw;
      if (j % 2 === 0) doc.rect(cx, y, bw, h, 'F'); // índice par = barra
      cx += bw;
    }
  });
}

/**
 * Barras decorativas (no escaneables) para comprobantes aún no autorizados.
 */
function drawBarcodePlaceholder(doc: jsPDF, clave: string, x: number, y: number, w: number, h: number) {
  doc.setFillColor(...hex(GRAY));
  let cx = x;
  const digits = (clave || '').replace(/\D/g, '');
  for (let i = 0; i < digits.length && cx < x + w; i++) {
    const d = parseInt(digits[i], 10);
    const bw = 0.25 + (d % 3) * 0.12;
    doc.rect(cx, y, bw, h, 'F');
    cx += bw + 0.35;
  }
}

// ── Función principal ─────────────────────────────────────────────────────

export function generarRIDE(datos: DatosRIDE): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const estab = datos.establecimiento.padStart(3, '0');
  const pto   = datos.puntoEmision.padStart(3, '0');
  const sec   = String(datos.secuencial).padStart(9, '0');
  const serie = `${estab}-${pto}-${sec}`;
  const esRecibo = datos.tipoDocumento === 'recibo_interno';
  const esRetencion = datos.tipoDocumento === 'retencion';
  const autorizado = !!datos.numeroAutorizacion && !esRecibo;

  // ── CABECERA: emisor (izq) + documento (der) ─────────────────────────────
  const headH = 46;
  const leftW = COLW * 0.52;
  const rightX = MARGIN + leftW + 2;
  const rightW = COLW - leftW - 2;

  box(doc, MARGIN, y, leftW, headH);
  box(doc, rightX, y, rightW, headH);

  // Emisor
  let ly = y + 6;
  doc.setFont(FONT, 'bold'); doc.setFontSize(11); doc.setTextColor(...hex(BLACK));
  const nombre = datos.nombreComercial || datos.razonSocial;
  wrap(doc, nombre, leftW - 8).slice(0, 2).forEach(l => { doc.text(l, MARGIN + 4, ly); ly += 5; });

  doc.setFont(FONT, 'normal'); doc.setFontSize(7.5);
  if (datos.nombreComercial && datos.nombreComercial !== datos.razonSocial) {
    wrap(doc, datos.razonSocial, leftW - 8).slice(0, 1).forEach(l => { doc.text(l, MARGIN + 4, ly); ly += 4; });
  }
  ly += 1;
  doc.setFontSize(7);
  label(doc, 'Dir. Matriz:', MARGIN + 4, ly);
  wrap(doc, datos.direccionMatriz, leftW - 26).slice(0, 2).forEach((l, i) => {
    value(doc, l, MARGIN + 24, ly + i * 3.5); });
  ly += 4 + (wrap(doc, datos.direccionMatriz, leftW - 26).slice(0, 2).length - 1) * 3.5;

  if (datos.direccionSucursal) {
    label(doc, 'Dir. Sucursal:', MARGIN + 4, ly);
    value(doc, datos.direccionSucursal.slice(0, 50), MARGIN + 26, ly);
    ly += 4;
  }
  label(doc, 'OBLIGADO A LLEVAR CONTABILIDAD:', MARGIN + 4, ly);
  value(doc, datos.obligadoContabilidad ?? 'NO', MARGIN + 60, ly);
  ly += 4;
  if (datos.contribuyenteEspecial) {
    label(doc, 'Contribuyente Especial Nro:', MARGIN + 4, ly);
    value(doc, datos.contribuyenteEspecial, MARGIN + 52, ly);
    ly += 4;
  }

  // Documento (derecha)
  let ry = y + 5;
  label(doc, `R.U.C.: ${datos.ruc}`, rightX + 3, ry, 8); ry += 6;
  doc.setFont(FONT, 'bold'); doc.setFontSize(12);
  doc.text(TITULO[datos.tipoDocumento], rightX + 3, ry); ry += 6;
  doc.setFontSize(8);
  label(doc, 'No.', rightX + 3, ry);
  value(doc, serie, rightX + 12, ry, 8); ry += 6;

  doc.setFontSize(6.5);
  label(doc, 'NÚMERO DE AUTORIZACIÓN', rightX + 3, ry); ry += 3.5;
  doc.setFont(FONT, 'normal'); doc.setFontSize(6);
  const auth = autorizado ? (datos.numeroAutorizacion as string)
             : esRecibo ? 'SIN VALIDEZ TRIBUTARIA' : 'PENDIENTE DE AUTORIZACIÓN';
  wrap(doc, auth, rightW - 6).forEach(l => { doc.text(l, rightX + 3, ry); ry += 3; });
  ry += 1;

  doc.setFontSize(6.5);
  label(doc, 'FECHA Y HORA DE AUTORIZACIÓN', rightX + 3, ry); ry += 3.5;
  value(doc, datos.fechaAutorizacion ?? '—', rightX + 3, ry, 6); ry += 4.5;

  label(doc, 'AMBIENTE:', rightX + 3, ry);
  value(doc, datos.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS', rightX + 22, ry, 6.5);
  label(doc, 'EMISIÓN:', rightX + rightW / 2 + 2, ry);
  value(doc, 'NORMAL', rightX + rightW / 2 + 18, ry, 6.5);
  ry += 5;

  if (datos.claveAcceso) {
    label(doc, 'CLAVE DE ACCESO', rightX + 3, ry); ry += 2;
    // Code128 escaneable solo cuando el comprobante ya está autorizado por el SRI
    if (autorizado) drawCode128(doc, datos.claveAcceso, rightX + 3, ry, rightW - 6, 7);
    else            drawBarcodePlaceholder(doc, datos.claveAcceso, rightX + 3, ry, rightW - 6, 6);
    ry += 9;
    doc.setFont(FONT, 'normal'); doc.setFontSize(6);
    doc.text(datos.claveAcceso, rightX + rightW / 2, ry, { align: 'center' });
  }

  y += headH + 3;

  // Banda de estado (no autorizado)
  if (!autorizado && !esRecibo) {
    doc.setFillColor(...hex('#fff7ed'));
    doc.rect(MARGIN, y, COLW, 6, 'F');
    box(doc, MARGIN, y, COLW, 6);
    doc.setFont(FONT, 'bold'); doc.setFontSize(7); doc.setTextColor(...hex(ORANGE));
    doc.text('DOCUMENTO PENDIENTE DE AUTORIZACIÓN — NO VÁLIDO COMO COMPROBANTE TRIBUTARIO',
      MARGIN + COLW / 2, y + 4, { align: 'center' });
    y += 9;
  }

  // ── DATOS DEL COMPRADOR / SUJETO ─────────────────────────────────────────
  const compH = esRetencion ? 18 : 14;
  box(doc, MARGIN, y, COLW, compH);
  let cy = y + 5;
  const sujetoLabel = esRetencion ? 'Razón Social / Nombres y Apellidos:' : 'Razón Social / Nombres y Apellidos:';
  label(doc, sujetoLabel, MARGIN + 3, cy);
  value(doc, datos.razonSocialComprador, MARGIN + 52, cy);
  label(doc, 'Identificación:', MARGIN + COLW * 0.7, cy);
  value(doc, datos.identificacionComprador, MARGIN + COLW * 0.7 + 22, cy);
  cy += 5;
  label(doc, 'Fecha Emisión:', MARGIN + 3, cy);
  value(doc, formatFecha(datos.fechaEmision), MARGIN + 26, cy);
  if (esRetencion && datos.periodoFiscal) {
    label(doc, 'Ejercicio Fiscal:', MARGIN + COLW * 0.7, cy);
    value(doc, datos.periodoFiscal, MARGIN + COLW * 0.7 + 24, cy);
  } else if (datos.direccionComprador) {
    label(doc, 'Dirección:', MARGIN + COLW * 0.45, cy);
    value(doc, datos.direccionComprador.slice(0, 45), MARGIN + COLW * 0.45 + 16, cy);
  }
  y += compH + 3;

  // ── DOCUMENTO MODIFICADO (NC / ND) ───────────────────────────────────────
  if (datos.docModificado) {
    box(doc, MARGIN, y, COLW, 9);
    label(doc, 'Comprobante que se modifica:', MARGIN + 3, y + 4);
    value(doc, `Tipo: ${datos.docModificado.tipo}`, MARGIN + 50, y + 4);
    value(doc, `No.: ${datos.docModificado.numero}`, MARGIN + 90, y + 4);
    value(doc, `Fecha: ${datos.docModificado.fecha}`, MARGIN + 140, y + 4);
    if (datos.motivoModificacion) {
      label(doc, 'Motivo:', MARGIN + 3, y + 7.5);
      value(doc, datos.motivoModificacion.slice(0, 110), MARGIN + 18, y + 7.5);
    }
    y += 12;
  }

  // ── CUERPO ───────────────────────────────────────────────────────────────
  if (esRetencion) {
    y = renderTablaRetenciones(doc, datos, y);
  } else {
    if (datos.items.length) y = renderTablaItems(doc, datos, y);
    y = renderTotales(doc, datos, y);
  }

  // ── MOTIVOS (Nota de débito) ─────────────────────────────────────────────
  if (datos.tipoDocumento === 'nota_debito' && datos.motivos?.length) {
    y += 2;
    const c1 = COLW - 30;
    doc.setFillColor(...hex(LIGHT)); doc.rect(MARGIN, y, COLW, 5, 'F'); box(doc, MARGIN, y, COLW, 5);
    label(doc, 'Razón', MARGIN + 3, y + 3.5); label(doc, 'Valor', MARGIN + c1 + 3, y + 3.5);
    y += 5;
    datos.motivos.forEach(m => {
      box(doc, MARGIN, y, COLW, 5);
      value(doc, m.razon.slice(0, 90), MARGIN + 3, y + 3.5);
      doc.text(usd(m.valor), MARGIN + COLW - 3, y + 3.5, { align: 'right' });
      y += 5;
    });
  }

  // ── INFORMACIÓN ADICIONAL ────────────────────────────────────────────────
  y += 3;
  if (datos.mensajeAdicional || datos.emailComprador) {
    box(doc, MARGIN, y, COLW, 12);
    label(doc, 'Información Adicional', MARGIN + 3, y + 4);
    doc.setFont(FONT, 'normal'); doc.setFontSize(6.5);
    if (datos.emailComprador) doc.text(`Email: ${datos.emailComprador}`, MARGIN + 3, y + 8);
    if (datos.mensajeAdicional)
      wrap(doc, datos.mensajeAdicional, COLW - 6).slice(0, 1).forEach(l => doc.text(l, MARGIN + 3, y + 11));
    y += 15;
  }

  // ── Nota de recibo interno / borrador ────────────────────────────────────
  if (esRecibo) {
    doc.setFont(FONT, 'bold'); doc.setFontSize(7); doc.setTextColor(...hex(ORANGE));
    doc.text('DOCUMENTO SIN VALIDEZ TRIBUTARIA — SOLO PARA CONTROL INTERNO', MARGIN, y + 3);
    y += 6;
  }

  // Pie
  doc.setDrawColor(...hex(GRAY)); doc.setLineWidth(0.15);
  doc.line(MARGIN, y + 3, PW - MARGIN, y + 3);
  doc.setFont(FONT, 'normal'); doc.setFontSize(5.5); doc.setTextColor(...hex(GRAY));
  doc.text('Representación Impresa del Documento Electrónico (RIDE)', PW / 2, y + 7, { align: 'center' });

  return new Uint8Array(doc.output('arraybuffer'));
}

// ── Tabla de ítems (factura / nota de venta / NC / ND) ──────────────────────

function renderTablaItems(doc: jsPDF, datos: DatosRIDE, y: number): number {
  const cols = [
    { label: 'Cód.',        x: MARGIN,       w: 18, align: 'left'  as const },
    { label: 'Cant.',       x: MARGIN + 18,  w: 14, align: 'right' as const },
    { label: 'Descripción', x: MARGIN + 32,  w: 78, align: 'left'  as const },
    { label: 'P. Unit.',    x: MARGIN + 110, w: 22, align: 'right' as const },
    { label: 'Desc.',       x: MARGIN + 132, w: 20, align: 'right' as const },
    { label: 'Total',       x: MARGIN + 152, w: COLW - 152, align: 'right' as const },
  ];
  const ROW = 5;

  doc.setFillColor(...hex(LIGHT)); doc.rect(MARGIN, y, COLW, ROW, 'F'); box(doc, MARGIN, y, COLW, ROW);
  cols.forEach(c => {
    doc.setFont(FONT, 'bold'); doc.setFontSize(6.5); doc.setTextColor(...hex(BLACK));
    const px = c.align === 'right' ? c.x + c.w - 2 : c.x + 2;
    doc.text(c.label, px, y + 3.5, { align: c.align });
  });
  y += ROW;

  datos.items.forEach(it => {
    box(doc, MARGIN, y, COLW, ROW);
    doc.setFont(FONT, 'normal'); doc.setFontSize(7); doc.setTextColor(...hex(BLACK));
    doc.text((it.codigo || '-').slice(0, 9), cols[0].x + 2, y + 3.5);
    doc.text(num(it.cantidad, 0), cols[1].x + cols[1].w - 2, y + 3.5, { align: 'right' });
    doc.text(wrap(doc, it.descripcion, cols[2].w - 3)[0] ?? '', cols[2].x + 2, y + 3.5);
    doc.text(usd(it.precioUnitario), cols[3].x + cols[3].w - 2, y + 3.5, { align: 'right' });
    doc.text(usd(it.descuento), cols[4].x + cols[4].w - 2, y + 3.5, { align: 'right' });
    doc.text(usd(it.subtotal), cols[5].x + cols[5].w - 2, y + 3.5, { align: 'right' });
    y += ROW;
  });
  return y;
}

// ── Totales (lado derecho) ──────────────────────────────────────────────────

function renderTotales(doc: jsPDF, datos: DatosRIDE, y: number): number {
  y += 2;
  const totX = MARGIN + COLW * 0.55;
  const totW = COLW * 0.45;
  const labW = totW * 0.62;

  function row(lbl: string, val: string, bold = false) {
    box(doc, totX, y, totW, 5);
    doc.setFont(FONT, bold ? 'bold' : 'normal'); doc.setFontSize(7.5);
    doc.setTextColor(...hex(BLACK));
    doc.text(lbl, totX + labW - 2, y + 3.5, { align: 'right' });
    doc.text(val, totX + totW - 2, y + 3.5, { align: 'right' });
    y += 5;
  }

  const esFactura = datos.tipoDocumento === 'factura' || datos.tipoDocumento === 'nota_credito'
                  || datos.tipoDocumento === 'nota_debito';

  if (esFactura) {
    if (datos.subtotal15 > 0) row('SUBTOTAL 15%', usd(datos.subtotal15));
    if (datos.subtotal0  > 0) row('SUBTOTAL 0%', usd(datos.subtotal0));
    row('SUBTOTAL SIN IMPUESTOS', usd(datos.subtotal0 + datos.subtotal15));
    if (datos.totalDescuento > 0) row('TOTAL DESCUENTO', usd(datos.totalDescuento));
    row('IVA 15%', usd(datos.iva));
  } else {
    // Nota de venta: sin desglose de IVA
    if (datos.totalDescuento > 0) row('TOTAL DESCUENTO', usd(datos.totalDescuento));
    row('SUBTOTAL', usd(datos.subtotal0 + datos.subtotal15));
  }
  row('VALOR TOTAL', usd(datos.total), true);

  // Forma de pago (lado izquierdo)
  if (datos.tipoDocumento === 'factura' || datos.tipoDocumento === 'nota_venta') {
    const fpY = y - (esFactura ? 25 : 15);
    const fpW = COLW * 0.5;
    box(doc, MARGIN, fpY, fpW, 10);
    label(doc, 'Forma de Pago', MARGIN + 3, fpY + 4, 6.5);
    label(doc, 'Valor', MARGIN + fpW - 18, fpY + 4, 6.5);
    value(doc, (FORMA_PAGO_LABEL[datos.formaPago] ?? datos.formaPago).slice(0, 32), MARGIN + 3, fpY + 8, 6.5);
    doc.text(usd(datos.total), MARGIN + fpW - 3, fpY + 8, { align: 'right' });
  }

  return y;
}

// ── Tabla de retenciones ────────────────────────────────────────────────────

function renderTablaRetenciones(doc: jsPDF, datos: DatosRIDE, y: number): number {
  const cols = [
    { label: 'Comprobante',    x: MARGIN,       w: 40, align: 'left'  as const },
    { label: 'Fecha Emisión',  x: MARGIN + 40,  w: 22, align: 'left'  as const },
    { label: 'Ejerc. Fiscal',  x: MARGIN + 62,  w: 20, align: 'left'  as const },
    { label: 'Impuesto',       x: MARGIN + 82,  w: 20, align: 'left'  as const },
    { label: 'Código',         x: MARGIN + 102, w: 16, align: 'center'as const },
    { label: 'Base Imp.',      x: MARGIN + 118, w: 22, align: 'right' as const },
    { label: '% Ret.',         x: MARGIN + 140, w: 16, align: 'right' as const },
    { label: 'Valor Ret.',     x: MARGIN + 156, w: COLW - 156, align: 'right' as const },
  ];
  const ROW = 5;

  doc.setFillColor(...hex(LIGHT)); doc.rect(MARGIN, y, COLW, ROW, 'F'); box(doc, MARGIN, y, COLW, ROW);
  cols.forEach(c => {
    doc.setFont(FONT, 'bold'); doc.setFontSize(6); doc.setTextColor(...hex(BLACK));
    const px = c.align === 'right' ? c.x + c.w - 1.5 : c.align === 'center' ? c.x + c.w / 2 : c.x + 1.5;
    doc.text(c.label, px, y + 3.5, { align: c.align });
  });
  y += ROW;

  let totalRet = 0;
  (datos.retenciones ?? []).forEach(r => {
    box(doc, MARGIN, y, COLW, ROW);
    doc.setFont(FONT, 'normal'); doc.setFontSize(6); doc.setTextColor(...hex(BLACK));
    doc.text(r.comprobante.slice(0, 22), cols[0].x + 1.5, y + 3.5);
    doc.text(r.fechaEmision, cols[1].x + 1.5, y + 3.5);
    doc.text(r.ejercicioFiscal, cols[2].x + 1.5, y + 3.5);
    doc.text(r.impuesto, cols[3].x + 1.5, y + 3.5);
    doc.text(r.codigo, cols[4].x + cols[4].w / 2, y + 3.5, { align: 'center' });
    doc.text(usd(r.baseImponible), cols[5].x + cols[5].w - 1.5, y + 3.5, { align: 'right' });
    doc.text(num(r.porcentaje), cols[6].x + cols[6].w - 1.5, y + 3.5, { align: 'right' });
    doc.text(usd(r.valorRetenido), cols[7].x + cols[7].w - 1.5, y + 3.5, { align: 'right' });
    totalRet += r.valorRetenido;
    y += ROW;
  });

  // Total retenido
  y += 2;
  const totX = MARGIN + COLW * 0.6, totW = COLW * 0.4;
  box(doc, totX, y, totW, 5);
  doc.setFont(FONT, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...hex(BLACK));
  doc.text('TOTAL RETENIDO', totX + totW * 0.6, y + 3.5, { align: 'right' });
  doc.text(usd(totalRet), totX + totW - 2, y + 3.5, { align: 'right' });
  y += 5;
  return y;
}

// ── Descarga / apertura ─────────────────────────────────────────────────────

export function descargarRIDE(datos: DatosRIDE, nombreArchivo?: string): void {
  const bytes  = generarRIDE(datos);
  const blob   = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url    = URL.createObjectURL(blob);
  const estab  = datos.establecimiento.padStart(3, '0');
  const pto    = datos.puntoEmision.padStart(3, '0');
  const sec    = String(datos.secuencial).padStart(9, '0');
  const nombre = nombreArchivo ?? `RIDE-${COD_DOC[datos.tipoDocumento]}-${estab}-${pto}-${sec}.pdf`;
  const a      = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
}

export function abrirRIDEenNuevaPestana(datos: DatosRIDE): void {
  const bytes = generarRIDE(datos);
  const blob  = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
