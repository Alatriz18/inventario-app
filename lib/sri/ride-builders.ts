/**
 * Builders que convierten los documentos de Firestore (Nota de Crédito,
 * Nota de Débito, Retención) en la estructura DatosRIDE para generar el PDF
 * con el formato oficial del SRI.
 */

import { ConfigSRI } from '@/lib/firebase/config-sri';
import { NotaCredito, NotaDebito, RetencionEmitida } from '@/types';
import { DatosRIDE } from '@/lib/sri/ride-pdf';

function toDate(v: any): Date {
  return v?.toDate?.() ?? new Date(v);
}

function fmt(v: any): string {
  const d = toDate(v);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Extrae el número secuencial (últimos dígitos) de un "001-001-000000123" */
function secNum(secuencial: string): number {
  const last = secuencial.split('-').pop() ?? secuencial;
  return parseInt(last.replace(/\D/g, ''), 10) || 0;
}

function emisor(config: ConfigSRI) {
  return {
    razonSocial:           config.razonSocial,
    nombreComercial:       config.nombreComercial,
    ruc:                   config.ruc,
    direccionMatriz:       config.direccionMatriz,
    establecimiento:       config.establecimiento,
    puntoEmision:          config.puntoEmision,
    contribuyenteEspecial: config.contribuyenteEspecial,
    obligadoContabilidad:  config.obligadoContabilidad,
    ambiente:              config.ambiente,
  };
}

export function buildRIDENotaCredito(nc: NotaCredito, config: ConfigSRI): DatosRIDE {
  const items = (nc.items ?? []).map(i => ({
    codigo:         i.codigoPrincipal,
    descripcion:    i.descripcion,
    cantidad:       i.cantidad,
    precioUnitario: i.precioUnitario,
    descuento:      i.descuento ?? 0,
    subtotal:       i.precioTotalSinImpuesto,
    tieneIVA:       i.tieneIVA,
  }));
  const subtotal15 = items.filter(i => i.tieneIVA).reduce((s, i) => s + i.subtotal, 0);
  const subtotal0  = items.filter(i => !i.tieneIVA).reduce((s, i) => s + i.subtotal, 0);

  return {
    tipoDocumento: 'nota_credito',
    ...emisor(config),
    secuencial:        secNum(nc.secuencial),
    claveAcceso:       nc.claveAcceso,
    numeroAutorizacion:nc.numeroAutorizacion,
    fechaAutorizacion: nc.fechaAutorizacion ? fmt(nc.fechaAutorizacion) : undefined,
    fechaEmision:      toDate(nc.fechaEmision),
    tipoIdComprador:   nc.clienteIdentificacion.length === 13 ? '04' : '05',
    identificacionComprador: nc.clienteIdentificacion,
    razonSocialComprador:    nc.clienteNombre,
    docModificado: {
      tipo:   'Factura (01)',
      numero: nc.numeroComprobanteOrigen,
      fecha:  fmt(nc.fechaEmisionOrigen),
    },
    motivoModificacion: nc.descripcionMotivo,
    items,
    subtotal0,
    subtotal15,
    totalDescuento: 0,
    iva:            nc.iva,
    total:          nc.total,
    formaPago:      'efectivo',
  };
}

export function buildRIDENotaDebito(nd: NotaDebito, config: ConfigSRI): DatosRIDE {
  const tieneIVA = nd.iva > 0;
  return {
    tipoDocumento: 'nota_debito',
    ...emisor(config),
    secuencial:        secNum(nd.secuencial),
    claveAcceso:       nd.claveAcceso,
    numeroAutorizacion:nd.numeroAutorizacion,
    fechaAutorizacion: nd.fechaAutorizacion ? fmt(nd.fechaAutorizacion) : undefined,
    fechaEmision:      toDate(nd.fechaEmision),
    tipoIdComprador:   nd.clienteIdentificacion.length === 13 ? '04' : '05',
    identificacionComprador: nd.clienteIdentificacion,
    razonSocialComprador:    nd.clienteNombre,
    docModificado: {
      tipo:   'Factura (01)',
      numero: nd.numeroComprobanteOrigen,
      fecha:  fmt(nd.fechaEmisionOrigen),
    },
    motivos: (nd.razones ?? []).map(r => ({ razon: r.descripcion, valor: r.valor })),
    items: [],
    subtotal0:  tieneIVA ? 0 : nd.subtotal,
    subtotal15: tieneIVA ? nd.subtotal : 0,
    totalDescuento: 0,
    iva:   nd.iva,
    total: nd.total,
    formaPago: 'efectivo',
  };
}

export function buildRIDERetencion(ret: RetencionEmitida, config: ConfigSRI): DatosRIDE {
  return {
    tipoDocumento: 'retencion',
    ...emisor(config),
    secuencial:        secNum(ret.secuencial),
    claveAcceso:       ret.claveAcceso,
    numeroAutorizacion:ret.numeroAutorizacion,
    fechaAutorizacion: ret.fechaAutorizacion ? fmt(ret.fechaAutorizacion) : undefined,
    fechaEmision:      toDate(ret.fechaEmision),
    tipoIdComprador:   ret.proveedorRuc.length === 13 ? '04' : '05',
    identificacionComprador: ret.proveedorRuc,
    razonSocialComprador:    ret.proveedorNombre,
    periodoFiscal: ret.ejercicioFiscal,
    retenciones: (ret.lineas ?? []).map(l => ({
      comprobante:     `01 ${ret.numeroFacturaProveedor}`,
      fechaEmision:    fmt(ret.fechaFactura),
      ejercicioFiscal: ret.ejercicioFiscal,
      impuesto:        l.tipo === 'fuente_ir' ? 'RENTA' : 'IVA',
      codigo:          l.codigo,
      baseImponible:   l.baseImponible,
      porcentaje:      l.porcentaje,
      valorRetenido:   l.valorRetenido,
    })),
    items: [],
    subtotal0: 0,
    subtotal15: 0,
    totalDescuento: 0,
    iva: 0,
    total: ret.totalRetenido,
    formaPago: 'efectivo',
  };
}
