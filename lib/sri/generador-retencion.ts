import { create } from 'xmlbuilder2';

export interface LineaXMLRetencion {
  tipo:         'fuente_ir' | 'iva';
  codigo:       string;        // codigoRetencion (ej. 303, 312, 721…)
  porcentaje:   number;
  baseImponible:number;
  valorRetenido:number;
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
  // Documento que origina la retención (factura del proveedor)
  codDocSustento:          string;  // '01' = factura
  numDocSustento:          string;  // 15 dígitos (estab+ptoEmi+secuencial, sin guiones)
  fechaEmisionDocSustento: string;  // dd/MM/yyyy
  totalSinImpuestos:       number;  // subtotal de la factura sustento
  importeTotal:            number;  // total de la factura sustento
  // Líneas de retención
  lineas:              LineaXMLRetencion[];
}

/**
 * Genera el XML del Comprobante de Retención en el esquema v2.0.0 (obligatorio
 * desde 2021). Estructura: infoCompRetencion + docsSustento/docSustento/retenciones.
 */
export function generarXMLRetencion(d: DatosRetencion): string {
  const secStr   = String(d.secuencial).padStart(9, '0');
  const estab    = d.establecimiento.padStart(3, '0');
  const ptoEmi   = d.puntoEmision.padStart(3, '0');
  const fechaStr = fmtFecha(d.fechaEmision);

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('comprobanteRetencion', { id: 'comprobante', version: '2.0.0' });

  // ── infoTributaria ──
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

  // ── infoCompRetencion ──
  const inf = doc.ele('infoCompRetencion');
  inf.ele('fechaEmision').txt(fechaStr);
  inf.ele('dirEstablecimiento').txt(d.direccionMatriz);
  if (d.contribuyenteEspecial) inf.ele('contribuyenteEspecial').txt(d.contribuyenteEspecial);
  inf.ele('obligadoContabilidad').txt(d.obligadoContabilidad ?? 'NO');
  inf.ele('tipoIdentificacionSujetoRetenido').txt(d.tipoIdSujetoRetenido);
  inf.ele('razonSocialSujetoRetenido').txt(d.razonSocialSujeto);
  inf.ele('identificacionSujetoRetenido').txt(d.identificacionSujeto);
  inf.ele('periodoFiscal').txt(d.periodoFiscal);

  // ── docsSustento ──
  const docs = doc.ele('docsSustento');
  const ds   = docs.ele('docSustento');
  ds.ele('codDocSustento').txt(d.codDocSustento);
  ds.ele('numDocSustento').txt(d.numDocSustento);
  ds.ele('fechaEmisionDocSustento').txt(d.fechaEmisionDocSustento);
  ds.ele('pagoLocExt').txt('01'); // 01 = pago a residente fiscal local
  ds.ele('totalSinImpuestos').txt(d.totalSinImpuestos.toFixed(2));
  ds.ele('importeTotal').txt(d.importeTotal.toFixed(2));

  const rets = ds.ele('retenciones');
  for (const l of d.lineas) {
    const ret = rets.ele('retencion');
    ret.ele('codigo').txt(l.tipo === 'fuente_ir' ? '1' : '2');
    ret.ele('codigoRetencion').txt(l.codigo);
    ret.ele('baseImponible').txt(l.baseImponible.toFixed(2));
    ret.ele('porcentajeRetener').txt(l.porcentaje.toFixed(2));
    ret.ele('valorRetenido').txt(l.valorRetenido.toFixed(2));
  }

  return doc.end({ prettyPrint: false });
}

function fmtFecha(d: Date): string {
  const dd   = String(d.getDate()).padStart(2, '0');
  const MM   = String(d.getMonth() + 1).padStart(2, '0');
  const aaaa = String(d.getFullYear());
  return `${dd}/${MM}/${aaaa}`;
}
