import { create } from 'xmlbuilder2';

export interface RazonXMLNotaDebito {
  descripcion: string;
  valor:       number;
}

export interface DatosNotaDebito {
  claveAcceso:         string;
  secuencial:          number;
  fechaEmision:        Date;
  ambiente:            '1' | '2';
  ruc:                 string;
  razonSocial:         string;
  nombreComercial?:    string;
  establecimiento:     string;
  puntoEmision:        string;
  direccionMatriz:     string;
  contribuyenteEspecial?: string;
  obligadoContabilidad?:  'SI' | 'NO';
  // Documento origen
  codDocModificado:    string;
  numDocModificado:    string;
  fechaEmisionDocSustento: Date;
  // Comprador
  tipoIdComprador:     string;
  identificacion:      string;
  razonSocialComprador:string;
  // Razones (motivos del cargo)
  razones:             RazonXMLNotaDebito[];
  // Totales
  subtotal15:          number;
  subtotal0:           number;
  iva:                 number;
  total:               number;
}

export function generarXMLNotaDebito(d: DatosNotaDebito): string {
  const secStr      = String(d.secuencial).padStart(9, '0');
  const estab       = d.establecimiento.padStart(3, '0');
  const ptoEmi      = d.puntoEmision.padStart(3, '0');
  const fechaStr    = fmtFecha(d.fechaEmision);
  const fechaDocStr = fmtFecha(d.fechaEmisionDocSustento);

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('notaDebito', { id: 'comprobante', version: '1.0.0' });

  const it = doc.ele('infoTributaria');
  it.ele('ambiente').txt(d.ambiente);
  it.ele('tipoEmision').txt('1');
  it.ele('razonSocial').txt(d.razonSocial);
  if (d.nombreComercial) it.ele('nombreComercial').txt(d.nombreComercial);
  it.ele('ruc').txt(d.ruc);
  it.ele('claveAcceso').txt(d.claveAcceso);
  it.ele('codDoc').txt('05');
  it.ele('estab').txt(estab);
  it.ele('ptoEmi').txt(ptoEmi);
  it.ele('secuencial').txt(secStr);
  it.ele('dirMatriz').txt(d.direccionMatriz);
  if (d.contribuyenteEspecial) it.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);

  const inf = doc.ele('infoNotaDebito');
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

  // Impuestos (estructura propia de la Nota de Débito: <impuestos><impuesto>)
  const impuestos = inf.ele('impuestos');
  if (d.subtotal0 > 0) {
    const imp = impuestos.ele('impuesto');
    imp.ele('codigo').txt('2');
    imp.ele('codigoPorcentaje').txt('0');
    imp.ele('tarifa').txt('0');
    imp.ele('baseImponible').txt(d.subtotal0.toFixed(2));
    imp.ele('valor').txt('0.00');
  }
  if (d.subtotal15 > 0) {
    const imp = impuestos.ele('impuesto');
    imp.ele('codigo').txt('2');
    imp.ele('codigoPorcentaje').txt('4');
    imp.ele('tarifa').txt('15');
    imp.ele('baseImponible').txt(d.subtotal15.toFixed(2));
    imp.ele('valor').txt(d.iva.toFixed(2));
  }

  inf.ele('valorTotal').txt(d.total.toFixed(2));

  const razones = doc.ele('motivos');
  for (const r of d.razones) {
    const m = razones.ele('motivo');
    m.ele('razon').txt(r.descripcion);
    m.ele('valor').txt(r.valor.toFixed(2));
  }

  return doc.end({ prettyPrint: false });
}

function fmtFecha(d: Date): string {
  const dd   = String(d.getDate()).padStart(2, '0');
  const MM   = String(d.getMonth() + 1).padStart(2, '0');
  const aaaa = String(d.getFullYear());
  return `${dd}/${MM}/${aaaa}`;
}
