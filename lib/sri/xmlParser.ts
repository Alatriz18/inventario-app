import { XMLParser } from 'fast-xml-parser';
import { FacturaSRIData } from '@/types';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
  trimValues: true,
});

export type TipoComprobanteXML =
  'factura' | 'nota_credito' | 'nota_debito' | 'retencion' | 'liquidacion' | 'desconocido';

/** Detecta el tipo de comprobante a partir del XML (con o sin sobre de autorización). */
export function detectarTipoComprobante(xmlString: string): TipoComprobanteXML {
  if (/<factura\b/.test(xmlString))              return 'factura';
  if (/<notaCredito\b/.test(xmlString))          return 'nota_credito';
  if (/<notaDebito\b/.test(xmlString))           return 'nota_debito';
  if (/<comprobanteRetencion\b/.test(xmlString)) return 'retencion';
  if (/<liquidacionCompra\b/.test(xmlString))    return 'liquidacion';
  return 'desconocido';
}

export function parsearFacturaXML(xmlString: string): FacturaSRIData | null {
  try {
    const parsed = parser.parse(xmlString);

    // El XML del SRI tiene esta estructura:
    // <factura> o dentro de <autorizacion><comprobante>
    let facturaNode = parsed?.factura;

    // Si viene con sobre de autorización
    if (!facturaNode && parsed?.autorizacion?.comprobante) {
      const inner = parsed.autorizacion.comprobante;
      const innerParsed = parser.parse(
        typeof inner === 'string' ? inner : JSON.stringify(inner)
      );
      facturaNode = innerParsed?.factura;
    }

    if (!facturaNode) return null;

    const infoTributaria = facturaNode.infoTributaria;
    const infoFactura    = facturaNode.infoFactura;
    const detalles       = facturaNode.detalles?.detalle;
    const infoAdicional  = facturaNode.infoAdicional?.campoAdicional;

    const detallesArray = Array.isArray(detalles) ? detalles : detalles ? [detalles] : [];
    const infoAdicionalArray = Array.isArray(infoAdicional)
      ? infoAdicional
      : infoAdicional
      ? [infoAdicional]
      : [];

    return {
      infoTributaria: {
        ruc:             String(infoTributaria?.ruc ?? ''),
        razonSocial:     String(infoTributaria?.razonSocial ?? ''),
        nombreComercial: infoTributaria?.nombreComercial
          ? String(infoTributaria.nombreComercial)
          : undefined,
        estab:           String(infoTributaria?.estab ?? ''),
        ptoEmi:          String(infoTributaria?.ptoEmi ?? ''),
        secuencial:      String(infoTributaria?.secuencial ?? ''),
        claveAcceso:     String(infoTributaria?.claveAcceso ?? ''),
        tipoEmision:     String(infoTributaria?.tipoEmision ?? ''),
      },
      infoFactura: {
        fechaEmision:              String(infoFactura?.fechaEmision ?? ''),
        razonSocialComprador:      String(infoFactura?.razonSocialComprador ?? ''),
        identificacionComprador:   String(infoFactura?.identificacionComprador ?? ''),
        totalSinImpuestos:         Number(infoFactura?.totalSinImpuestos ?? 0),
        totalDescuento:            Number(infoFactura?.totalDescuento ?? 0),
        importeTotal:              Number(infoFactura?.importeTotal ?? 0),
        moneda:                    String(infoFactura?.moneda ?? 'DOLAR'),
      },
      detalles: detallesArray.map((d: any) => ({
        codigoPrincipal:            String(d?.codigoPrincipal ?? ''),
        descripcion:                String(d?.descripcion ?? ''),
        cantidad:                   Number(d?.cantidad ?? 0),
        precioUnitario:             Number(d?.precioUnitario ?? 0),
        descuento:                  Number(d?.descuento ?? 0),
        precioTotalSinImpuesto:     Number(d?.precioTotalSinImpuesto ?? 0),
      })),
      infoAdicional: infoAdicionalArray.map((c: any) => ({
        nombre: String(c?.['@_nombre'] ?? c?.nombre ?? ''),
        valor:  typeof c === 'string' ? c : String(c?.['#text'] ?? ''),
      })),
    };
  } catch (error) {
    console.error('Error parsing XML SRI:', error);
    return null;
  }
}

// ── Parsers para otros comprobantes recibidos (NC / ND / Retención) ─────────

/** Devuelve el nodo del comprobante, desenvolviendo el sobre de autorización. */
function getNode(xmlString: string, rootKey: string): any {
  const parsed = parser.parse(xmlString);
  if (parsed?.[rootKey]) return parsed[rootKey];
  const inner = parsed?.autorizacion?.comprobante;
  if (inner) {
    const innerParsed = parser.parse(typeof inner === 'string' ? inner : String(inner));
    return innerParsed?.[rootKey] ?? null;
  }
  return null;
}

const toArr = (x: any): any[] => (Array.isArray(x) ? x : x ? [x] : []);

function ivaDeTotales(totalConImpuestos: any): number {
  const arr = toArr(totalConImpuestos?.totalImpuesto);
  const iva = arr.find(i => String(i?.codigo) === '2');
  return Number(iva?.valor ?? 0);
}

export interface DocRecibidoData {
  ruc:          string;
  razonSocial:  string;
  estab:        string;
  ptoEmi:       string;
  secuencial:   string;
  claveAcceso:  string;
  fechaEmision: string;   // dd/MM/yyyy
  docModificado?: string;
  subtotal:     number;
  iva:          number;
  total:        number;
}

export function parsearNotaCreditoXML(xmlString: string): DocRecibidoData | null {
  try {
    const n = getNode(xmlString, 'notaCredito');
    if (!n) return null;
    const it = n.infoTributaria, inf = n.infoNotaCredito;
    return {
      ruc:          String(it?.ruc ?? ''),
      razonSocial:  String(it?.razonSocial ?? ''),
      estab:        String(it?.estab ?? ''),
      ptoEmi:       String(it?.ptoEmi ?? ''),
      secuencial:   String(it?.secuencial ?? ''),
      claveAcceso:  String(it?.claveAcceso ?? ''),
      fechaEmision: String(inf?.fechaEmision ?? ''),
      docModificado:String(inf?.numDocModificado ?? ''),
      subtotal:     Number(inf?.totalSinImpuestos ?? 0),
      iva:          ivaDeTotales(inf?.totalConImpuestos),
      total:        Number(inf?.valorModificacion ?? 0),
    };
  } catch { return null; }
}

export function parsearNotaDebitoXML(xmlString: string): DocRecibidoData | null {
  try {
    const n = getNode(xmlString, 'notaDebito');
    if (!n) return null;
    const it = n.infoTributaria, inf = n.infoNotaDebito;
    // El IVA puede venir como <impuestos><impuesto> o <totalConImpuestos><totalImpuesto>
    let iva = 0;
    const imps = toArr(inf?.impuestos?.impuesto);
    if (imps.length) iva = imps.filter(i => String(i?.codigo) === '2').reduce((s, i) => s + Number(i?.valor ?? 0), 0);
    else iva = ivaDeTotales(inf?.totalConImpuestos);
    return {
      ruc:          String(it?.ruc ?? ''),
      razonSocial:  String(it?.razonSocial ?? ''),
      estab:        String(it?.estab ?? ''),
      ptoEmi:       String(it?.ptoEmi ?? ''),
      secuencial:   String(it?.secuencial ?? ''),
      claveAcceso:  String(it?.claveAcceso ?? ''),
      fechaEmision: String(inf?.fechaEmision ?? ''),
      docModificado:String(inf?.numDocModificado ?? ''),
      subtotal:     Number(inf?.totalSinImpuestos ?? 0),
      iva,
      total:        Number(inf?.valorTotal ?? 0),
    };
  } catch { return null; }
}

export interface RetencionRecibidaData {
  ruc:          string;  // emisor = cliente que retiene
  razonSocial:  string;
  estab:        string;
  ptoEmi:       string;
  secuencial:   string;
  claveAcceso:  string;
  fechaEmision: string;
  periodoFiscal:string;
  lineas: { tipo: 'fuente_ir' | 'iva'; codigo: string; baseImponible: number; porcentaje: number; valorRetenido: number }[];
  retFuente:    number;
  retIVA:       number;
  totalRetenido:number;
}

export function parsearRetencionXML(xmlString: string): RetencionRecibidaData | null {
  try {
    const n = getNode(xmlString, 'comprobanteRetencion');
    if (!n) return null;
    const it = n.infoTributaria, inf = n.infoCompRetencion;

    // Retenciones: v2.0.0 (docsSustento) o v1.0.0 (impuestos)
    let crudas: any[] = [];
    const docs = toArr(n?.docsSustento?.docSustento);
    if (docs.length) {
      for (const d of docs) crudas.push(...toArr(d?.retenciones?.retencion));
    } else {
      crudas = toArr(n?.impuestos?.impuesto);
    }

    const lineas = crudas.map(r => {
      const cod = String(r?.codigo ?? '');
      return {
        tipo:          cod === '1' ? 'fuente_ir' as const : 'iva' as const,
        codigo:        String(r?.codigoRetencion ?? ''),
        baseImponible: Number(r?.baseImponible ?? 0),
        porcentaje:    Number(r?.porcentajeRetener ?? 0),
        valorRetenido: Number(r?.valorRetenido ?? 0),
      };
    });

    const retFuente = lineas.filter(l => l.tipo === 'fuente_ir').reduce((s, l) => s + l.valorRetenido, 0);
    const retIVA    = lineas.filter(l => l.tipo === 'iva').reduce((s, l) => s + l.valorRetenido, 0);

    return {
      ruc:          String(it?.ruc ?? ''),
      razonSocial:  String(it?.razonSocial ?? ''),
      estab:        String(it?.estab ?? ''),
      ptoEmi:       String(it?.ptoEmi ?? ''),
      secuencial:   String(it?.secuencial ?? ''),
      claveAcceso:  String(it?.claveAcceso ?? ''),
      fechaEmision: String(inf?.fechaEmision ?? ''),
      periodoFiscal:String(inf?.periodoFiscal ?? ''),
      lineas,
      retFuente,
      retIVA,
      totalRetenido: retFuente + retIVA,
    };
  } catch { return null; }
}

// Extrae el IVA de los impuestos del XML
export function extraerIVAdeXML(xmlString: string): number {
  try {
    const parsed = parser.parse(xmlString);
    const facturaNode = parsed?.factura;
    if (!facturaNode) return 0;

    const totalImpuestos = facturaNode.infoFactura?.totalConImpuestos?.totalImpuesto;
    const impuestosArray = Array.isArray(totalImpuestos)
      ? totalImpuestos
      : totalImpuestos ? [totalImpuestos] : [];

    // código 2 = IVA en el SRI
    const ivaItem = impuestosArray.find((i: any) => String(i?.codigo) === '2');
    return Number(ivaItem?.valor ?? 0);
  } catch {
    return 0;
  }
}