import { create } from 'xmlbuilder2';

export interface LineaXMLRetencion {
  tipo:         'fuente_ir' | 'iva';
  codigo:       string;
  porcentaje:   number;
  baseImponible:number;
  valorRetenido:number;
  // Referencia al comprobante que origina la retención
  codDocSustento:  string;  // '01' = factura
  numDocSustento:  string;  // ej: 001-001-000000123
  fechaEmisionDocSustento: string; // dd/MM/yyyy
  ejercicioFiscal: string;  // AAAA/MM
}

export interface DatosRetencion {
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
  // Sujeto al que se retiene
  tipoIdSujetoRetenido:string;  // 04=RUC 05=cédula 06=pasaporte
  identificacionSujeto:string;
  razonSocialSujeto:   string;
  periodoFiscal:       string;  // MM/AAAA
  // Líneas de retención
  lineas:              LineaXMLRetencion[];
}

export function generarXMLRetencion(d: DatosRetencion): string {
  const secStr   = String(d.secuencial).padStart(9, '0');
  const estab    = d.establecimiento.padStart(3, '0');
  const ptoEmi   = d.puntoEmision.padStart(3, '0');
  const fechaStr = fmtFecha(d.fechaEmision);

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('comprobanteRetencion', { id: 'comprobante', version: '1.0.0' });

  const it = doc.ele('infoTributaria');
  it.ele('ambiente').txt(d.ambiente);
  it.ele('tipoEmision').txt('1');
  it.ele('razonSocial').txt(d.razonSocial);
  if (d.nombreComercial) it.ele('nombreComercial').txt(d.nombreComercial);
  it.ele('ruc').txt(d.ruc);
  it.ele('claveAcceso').txt(d.claveAcceso);
  it.ele('codDoc').txt('07');
  it.ele('estab').txt(estab);
  it.ele('ptoEmi').txt(ptoEmi);
  it.ele('secuencial').txt(secStr);
  it.ele('dirMatriz').txt(d.direccionMatriz);
  if (d.contribuyenteEspecial) it.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);

  const inf = doc.ele('infoCompRetencion');
  inf.ele('fechaEmision').txt(fechaStr);
  inf.ele('dirEstablecimiento').txt(d.direccionMatriz);
  inf.ele('obligadoContabilidad').txt(d.obligadoContabilidad ?? 'NO');
  if (d.contribuyenteEspecial) inf.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);
  inf.ele('tipoIdentificacionSujetoRetenido').txt(d.tipoIdSujetoRetenido);
  inf.ele('razonSocialSujetoRetenido').txt(d.razonSocialSujeto);
  inf.ele('identificacionSujetoRetenido').txt(d.identificacionSujeto);
  inf.ele('periodoFiscal').txt(d.periodoFiscal);

  const impuestos = doc.ele('impuestos');
  for (const l of d.lineas) {
    const imp = impuestos.ele('impuesto');
    imp.ele('codigo').txt(l.tipo === 'fuente_ir' ? '1' : '2');
    imp.ele('codigoRetencion').txt(l.codigo);
    imp.ele('baseImponible').txt(l.baseImponible.toFixed(2));
    imp.ele('porcentajeRetener').txt(l.porcentaje.toFixed(2));
    imp.ele('valorRetenido').txt(l.valorRetenido.toFixed(2));
    imp.ele('codDocSustento').txt(l.codDocSustento);
    imp.ele('numDocSustento').txt(l.numDocSustento);
    imp.ele('fechaEmisionDocSustento').txt(l.fechaEmisionDocSustento);
  }

  return doc.end({ prettyPrint: false });
}

function fmtFecha(d: Date): string {
  const dd   = String(d.getDate()).padStart(2, '0');
  const MM   = String(d.getMonth() + 1).padStart(2, '0');
  const aaaa = String(d.getFullYear());
  return `${dd}/${MM}/${aaaa}`;
}
