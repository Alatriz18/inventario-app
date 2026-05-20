import { create } from 'xmlbuilder2';

export interface ItemXMLFactura {
  codigoPrincipal:        string;
  descripcion:            string;
  cantidad:               number;
  precioUnitario:         number;
  descuento:              number;
  precioTotalSinImpuesto: number;
  tieneIVA:               boolean;
}

export interface DatosFactura {
  // Comprobante
  claveAcceso:     string;
  secuencial:      number;
  fechaEmision:    Date;
  ambiente:        '1' | '2';
  // Emisor
  ruc:             string;
  razonSocial:     string;
  nombreComercial?: string;
  establecimiento: string;
  puntoEmision:    string;
  direccionMatriz: string;
  contribuyenteEspecial?: string;
  obligadoContabilidad?:  'SI' | 'NO';
  // Comprador
  tipoIdComprador: string;  // 04=RUC 05=cédula 06=pasaporte 07=consumidor final
  identificacion:  string;
  razonSocialComprador: string;
  direccionComprador?:  string;
  // Ítems
  items:           ItemXMLFactura[];
  // Totales
  subtotal15:      number;  // base imponible IVA 15%
  subtotal0:       number;  // base imponible IVA 0%
  totalDescuento:  number;
  iva:             number;
  total:           number;
  // Pago
  formaPago: string;        // 01=efectivo 16=tarjeta 19=transferencia
}

export function generarXMLFactura(d: DatosFactura): string {
  const secStr    = String(d.secuencial).padStart(9, '0');
  const estab     = d.establecimiento.padStart(3, '0');
  const ptoEmi    = d.puntoEmision.padStart(3, '0');
  const dd        = String(d.fechaEmision.getDate()).padStart(2, '0');
  const MM        = String(d.fechaEmision.getMonth() + 1).padStart(2, '0');
  const aaaa      = String(d.fechaEmision.getFullYear());
  const fechaStr  = `${dd}/${MM}/${aaaa}`;

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('factura', { id: 'comprobante', version: '1.1.0' });

  // ── infoTributaria ──
  const it = doc.ele('infoTributaria');
  it.ele('ambiente').txt(d.ambiente);
  it.ele('tipoEmision').txt('1');
  it.ele('razonSocial').txt(d.razonSocial);
  if (d.nombreComercial) it.ele('nombreComercial').txt(d.nombreComercial);
  it.ele('ruc').txt(d.ruc);
  it.ele('claveAcceso').txt(d.claveAcceso);
  it.ele('codDoc').txt('01');
  it.ele('estab').txt(estab);
  it.ele('ptoEmi').txt(ptoEmi);
  it.ele('secuencial').txt(secStr);
  it.ele('dirMatriz').txt(d.direccionMatriz);
  if (d.contribuyenteEspecial) it.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);

  // ── infoFactura ──
  const inf = doc.ele('infoFactura');
  inf.ele('fechaEmision').txt(fechaStr);
  inf.ele('dirEstablecimiento').txt(d.direccionMatriz);
  if (d.contribuyenteEspecial) inf.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);
  inf.ele('obligadoContabilidad').txt(d.obligadoContabilidad ?? 'NO');
  inf.ele('tipoIdentificacionComprador').txt(d.tipoIdComprador);
  inf.ele('razonSocialComprador').txt(d.razonSocialComprador);
  inf.ele('identificacionComprador').txt(d.identificacion);
  if (d.direccionComprador) inf.ele('direccionComprador').txt(d.direccionComprador);
  inf.ele('totalSinImpuestos').txt((d.subtotal15 + d.subtotal0).toFixed(2));
  inf.ele('totalDescuento').txt(d.totalDescuento.toFixed(2));

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
    ti.ele('codigoPorcentaje').txt('4'); // 4 = 15% desde 2024
    ti.ele('baseImponible').txt(d.subtotal15.toFixed(2));
    ti.ele('valor').txt(d.iva.toFixed(2));
  }

  inf.ele('propina').txt('0.00');
  inf.ele('importeTotal').txt(d.total.toFixed(2));
  inf.ele('moneda').txt('DOLAR');

  const pagos = inf.ele('pagos');
  const pago  = pagos.ele('pago');
  pago.ele('formaPago').txt(d.formaPago);
  pago.ele('total').txt(d.total.toFixed(2));
  pago.ele('plazo').txt('0');
  pago.ele('unidadTiempo').txt('dias');

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