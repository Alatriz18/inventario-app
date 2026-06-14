import { create } from 'xmlbuilder2';

export interface ItemXMLNotaCredito {
  codigoPrincipal:        string;
  descripcion:            string;
  cantidad:               number;
  precioUnitario:         number;
  descuento:              number;
  precioTotalSinImpuesto: number;
  tieneIVA:               boolean;
}

export interface DatosNotaCredito {
  // Comprobante
  claveAcceso:         string;
  secuencial:          number;
  fechaEmision:        Date;
  ambiente:            '1' | '2';
  // Emisor
  ruc:                 string;
  razonSocial:         string;
  nombreComercial?:    string;
  establecimiento:     string;
  puntoEmision:        string;
  direccionMatriz:     string;
  contribuyenteEspecial?: string;
  obligadoContabilidad?:  'SI' | 'NO';
  // Documento origen (factura que se está modificando)
  codDocModificado:    string;  // '01' factura
  numDocModificado:    string;  // ej: 001-001-000000123
  fechaEmisionDocSustento: Date;
  // Comprador
  tipoIdComprador:     string;
  identificacion:      string;
  razonSocialComprador:string;
  // Motivo
  motivo:              string;
  // Ítems
  items:               ItemXMLNotaCredito[];
  // Totales
  subtotal15:          number;
  subtotal0:           number;
  totalDescuento:      number;
  iva:                 number;
  total:               number;
}

export function generarXMLNotaCredito(d: DatosNotaCredito): string {
  const secStr   = String(d.secuencial).padStart(9, '0');
  const estab    = d.establecimiento.padStart(3, '0');
  const ptoEmi   = d.puntoEmision.padStart(3, '0');
  const fechaStr = fmtFecha(d.fechaEmision);
  const fechaDocStr = fmtFecha(d.fechaEmisionDocSustento);

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('notaCredito', { id: 'comprobante', version: '1.1.0' });

  // ── infoTributaria ──
  const it = doc.ele('infoTributaria');
  it.ele('ambiente').txt(d.ambiente);
  it.ele('tipoEmision').txt('1');
  it.ele('razonSocial').txt(d.razonSocial);
  if (d.nombreComercial) it.ele('nombreComercial').txt(d.nombreComercial);
  it.ele('ruc').txt(d.ruc);
  it.ele('claveAcceso').txt(d.claveAcceso);
  it.ele('codDoc').txt('04');
  it.ele('estab').txt(estab);
  it.ele('ptoEmi').txt(ptoEmi);
  it.ele('secuencial').txt(secStr);
  it.ele('dirMatriz').txt(d.direccionMatriz);
  if (d.contribuyenteEspecial) it.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);

  // ── infoNotaCredito ──
  const inf = doc.ele('infoNotaCredito');
  inf.ele('fechaEmision').txt(fechaStr);
  inf.ele('dirEstablecimiento').txt(d.direccionMatriz);
  inf.ele('tipoIdentificacionComprador').txt(d.tipoIdComprador);
  inf.ele('razonSocialComprador').txt(d.razonSocialComprador);
  inf.ele('identificacionComprador').txt(d.identificacion);
  if (d.contribuyenteEspecial) inf.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);
  inf.ele('obligadoContabilidad').txt(d.obligadoContabilidad ?? 'NO');
  inf.ele('codDocModificado').txt(d.codDocModificado);
  inf.ele('numDocModificado').txt(d.numDocModificado);
  inf.ele('fechaEmisionDocSustento').txt(fechaDocStr);
  inf.ele('totalSinImpuestos').txt((d.subtotal15 + d.subtotal0).toFixed(2));
  inf.ele('valorModificacion').txt(d.total.toFixed(2));
  inf.ele('moneda').txt('DOLAR');

  const totImp = inf.ele('totalConImpuestos');
  if (d.subtotal0 > 0) {
    const ti = totImp.ele('totalImpuesto');
    ti.ele('codigo').txt('2');
    ti.ele('codigoPorcentaje').txt('0');
    ti.ele('baseImponible').txt(d.subtotal0.toFixed(2));
    ti.ele('valor').txt('0.00');
  }
  if (d.subtotal15 > 0) {
    const ti = totImp.ele('totalImpuesto');
    ti.ele('codigo').txt('2');
    ti.ele('codigoPorcentaje').txt('4');
    ti.ele('baseImponible').txt(d.subtotal15.toFixed(2));
    ti.ele('valor').txt(d.iva.toFixed(2));
  }

  inf.ele('motivo').txt(d.motivo);

  // ── detalles ──
  const dets = doc.ele('detalles');
  for (const item of d.items) {
    const det = dets.ele('detalle');
    det.ele('codigoPrincipal').txt(item.codigoPrincipal);
    det.ele('descripcion').txt(item.descripcion);
    det.ele('cantidad').txt(item.cantidad.toFixed(6));
    det.ele('precioUnitario').txt(item.precioUnitario.toFixed(6));
    det.ele('descuento').txt(item.descuento.toFixed(2));
    det.ele('precioTotalSinImpuesto').txt(item.precioTotalSinImpuesto.toFixed(2));

    const imps = det.ele('impuestos');
    const imp  = imps.ele('impuesto');
    imp.ele('codigo').txt('2');
    imp.ele('codigoPorcentaje').txt(item.tieneIVA ? '4' : '0');
    imp.ele('tarifa').txt(item.tieneIVA ? '15' : '0');
    imp.ele('baseImponible').txt(item.precioTotalSinImpuesto.toFixed(2));
    imp.ele('valor').txt(item.tieneIVA
      ? (item.precioTotalSinImpuesto * 0.15).toFixed(2)
      : '0.00');
  }

  return doc.end({ prettyPrint: false });
}

function fmtFecha(d: Date): string {
  const dd   = String(d.getDate()).padStart(2, '0');
  const MM   = String(d.getMonth() + 1).padStart(2, '0');
  const aaaa = String(d.getFullYear());
  return `${dd}/${MM}/${aaaa}`;
}
