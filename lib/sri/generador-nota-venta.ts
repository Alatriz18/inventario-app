import { create } from 'xmlbuilder2';

export interface ItemNotaVenta {
  codigoPrincipal: string;
  descripcion:     string;
  cantidad:        number;
  precioUnitario:  number;
  descuento:       number;
  precioTotal:     number;
}

export interface DatosNotaVenta {
  claveAcceso:     string;
  secuencial:      number;
  fechaEmision:    Date;
  ambiente:        '1' | '2';
  ruc:             string;
  razonSocial:     string;
  nombreComercial?:      string;
  establecimiento:       string;
  puntoEmision:          string;
  direccionMatriz:       string;
  obligadoContabilidad?: 'SI' | 'NO';
  contribuyenteEspecial?: string;
  // Comprador
  tipoIdComprador:      string;
  identificacion:       string;
  razonSocialComprador: string;
  // Items
  items:           ItemNotaVenta[];
  // Totales
  totalSinImpuestos: number;
  totalDescuento:    number;
  importeTotal:      number;
  // Pago
  formaPago: string;
}

export function generarXMLNotaVenta(d: DatosNotaVenta): string {
  const secStr   = String(d.secuencial).padStart(9, '0');
  const estab    = d.establecimiento.padStart(3, '0');
  const ptoEmi   = d.puntoEmision.padStart(3, '0');
  const dd       = String(d.fechaEmision.getDate()).padStart(2, '0');
  const MM       = String(d.fechaEmision.getMonth() + 1).padStart(2, '0');
  const aaaa     = String(d.fechaEmision.getFullYear());
  const fechaStr = `${dd}/${MM}/${aaaa}`;

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('notaVenta', { id: 'comprobante', version: '1.1.0' });

  const it = doc.ele('infoTributaria');
  it.ele('ambiente').txt(d.ambiente);
  it.ele('tipoEmision').txt('1');
  it.ele('razonSocial').txt(d.razonSocial);
  if (d.nombreComercial) it.ele('nombreComercial').txt(d.nombreComercial);
  it.ele('ruc').txt(d.ruc);
  it.ele('claveAcceso').txt(d.claveAcceso);
  it.ele('codDoc').txt('18');
  it.ele('estab').txt(estab);
  it.ele('ptoEmi').txt(ptoEmi);
  it.ele('secuencial').txt(secStr);
  it.ele('dirMatriz').txt(d.direccionMatriz);
  if (d.contribuyenteEspecial) it.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);

  const inf = doc.ele('infoNotaVenta');
  inf.ele('fechaEmision').txt(fechaStr);
  inf.ele('dirEstablecimiento').txt(d.direccionMatriz);
  inf.ele('obligadoContabilidad').txt(d.obligadoContabilidad ?? 'NO');
  inf.ele('tipoIdentificacionComprador').txt(d.tipoIdComprador);
  inf.ele('razonSocialComprador').txt(d.razonSocialComprador);
  inf.ele('identificacionComprador').txt(d.identificacion);
  if (d.contribuyenteEspecial) inf.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);
  inf.ele('totalSinImpuestos').txt(d.totalSinImpuestos.toFixed(2));
  inf.ele('totalDescuento').txt(d.totalDescuento.toFixed(2));
  inf.ele('valRetBien10').txt('0.00');
  inf.ele('valRetServ20').txt('0.00');
  inf.ele('valorRetBienes').txt('0.00');
  inf.ele('valorRetServicios').txt('0.00');
  inf.ele('valRetServ100').txt('0.00');
  inf.ele('importeTotal').txt(d.importeTotal.toFixed(2));
  inf.ele('moneda').txt('DOLAR');

  const pagos = inf.ele('pagos');
  const pago  = pagos.ele('pago');
  pago.ele('formaPago').txt(d.formaPago);
  pago.ele('total').txt(d.importeTotal.toFixed(2));

  const dets = doc.ele('detalles');
  for (const item of d.items) {
    const det = dets.ele('detalle');
    det.ele('codigoPrincipal').txt(item.codigoPrincipal);
    det.ele('descripcion').txt(item.descripcion);
    det.ele('cantidad').txt(item.cantidad.toFixed(6));
    det.ele('precioUnitario').txt(item.precioUnitario.toFixed(6));
    det.ele('descuento').txt(item.descuento.toFixed(2));
    det.ele('precioTotal').txt(item.precioTotal.toFixed(2));
  }

  return doc.end({ prettyPrint: false });
}