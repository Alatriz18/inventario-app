import { XMLParser } from 'fast-xml-parser';
import { FacturaSRIData } from '@/types';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
  trimValues: true,
});

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