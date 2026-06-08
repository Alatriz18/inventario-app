/**
 * Motor de asientos contables automáticos.
 *
 * Cada operación del sistema (venta, compra, pago, ajuste) llama a una función
 * de este archivo para crear o recalcular el asiento contable correspondiente.
 *
 * Sincronización bidireccional:
 *  - Cuando se CREA una operación → crearAsiento*()
 *  - Cuando se EDITA una operación → recalcularAsientoVenta/Compra/Pago()
 *  - Cuando se EDITA el asiento directamente → editarAsiento() en lib/firebase/asientos.ts
 *    y se marca editadoManualmente=true (no se propaga al documento origen)
 */

import { getOrCreateConfigContable } from '@/lib/firebase/config-contable';
import { getCuentas }                from '@/lib/firebase/plan-cuentas';
import {
  createAsiento,
  recalcularAsientoDeDocumento,
} from '@/lib/firebase/asientos';
import { CuentaContable, AsientoLinea, TipoAsiento } from '@/types';

// ── Cache de cuentas (se invalida en cada llamada para seguridad) ─────────

async function getCuentasCached(): Promise<CuentaContable[]> {
  return await getCuentas();
}

async function getConfigSegura() {
  try { return await getOrCreateConfigContable(); }
  catch { return null; }
}

// ── Helper para construir una línea ──────────────────────────────────────

function buildLinea(
  cuentas:     CuentaContable[],
  codigo:      string,
  debe:        number,
  haber:       number,
  descripcion: string
): AsientoLinea {
  const cuenta = cuentas.find(c => c.codigo === codigo);
  return {
    id:           `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    cuentaId:     cuenta?.id     ?? codigo,
    cuentaCodigo: cuenta?.codigo ?? codigo,
    cuentaNombre: cuenta?.nombre ?? `Cuenta ${codigo}`,
    debe,
    haber,
    descripcion,
  };
}

// ── Tipos de parámetros compartidos ──────────────────────────────────────

interface ParamsBase {
  usuarioId:    string;
  usuarioNombre:string;
}

// ─────────────────────────────────────────────────────────────────────────
// VENTAS
// ─────────────────────────────────────────────────────────────────────────

interface ParamsVenta extends ParamsBase {
  ventaId:       string;
  fecha:         Date;
  clienteNombre: string;
  tieneIVA:      boolean;
  subtotal:      number;
  iva:           number;
  total:         number;
  costoVenta:    number;
  esCxC?:        boolean;  // true si es venta a crédito → debita CxC en vez de Caja
}

function buildLineasVenta(
  cuentas: CuentaContable[],
  config:  Awaited<ReturnType<typeof getOrCreateConfigContable>>,
  p:       ParamsVenta
): AsientoLinea[] {
  const lineas: AsientoLinea[] = [];

  // DB: Caja o CxC Clientes
  const cuentaDebito = p.esCxC ? config.cuentaCxCClientes : config.cuentaCaja;
  lineas.push(buildLinea(cuentas, cuentaDebito, p.total, 0,
    p.esCxC ? `CxC ${p.clienteNombre}` : `Cobro venta ${p.clienteNombre}`));

  // CR: Ventas
  const cuentaVentas = p.tieneIVA ? config.cuentaVentas12 : config.cuentaVentas0;
  lineas.push(buildLinea(cuentas, cuentaVentas, 0, p.subtotal, 'Ingresos por ventas'));

  // CR: IVA Ventas
  if (p.tieneIVA && p.iva > 0) {
    lineas.push(buildLinea(cuentas, config.cuentaIVAVentas, 0, p.iva, 'IVA cobrado 15%'));
  }

  // DB: Costo de ventas / CR: Inventario
  if (p.costoVenta > 0) {
    lineas.push(buildLinea(cuentas, config.cuentaCostoVentas,
      p.costoVenta, 0, 'Costo de mercaderías vendidas'));
    lineas.push(buildLinea(cuentas, config.cuentaInventario,
      0, p.costoVenta, 'Salida de inventario'));
  }

  return lineas;
}

export async function crearAsientoVenta(p: ParamsVenta): Promise<string | null> {
  try {
    const config = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();
    const lineas  = buildLineasVenta(cuentas, config, p);
    const tipo: TipoAsiento = p.tieneIVA ? 'venta_factura' : 'venta_nota';

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Venta a ${p.clienteNombre}`,
      tipo,
      referenciaId:   p.ventaId,
      referenciaTipo: 'venta',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

/**
 * Llamar cuando se edita una venta (cambia total, IVA, costo, etc.)
 * Recalcula las líneas y actualiza el asiento vinculado.
 */
export async function recalcularAsientoVenta(
  p: ParamsVenta & { forzar?: boolean }
): Promise<{ actualizado: boolean; advertencia?: string }> {
  try {
    const config = await getConfigSegura();
    if (!config) return { actualizado: false, advertencia: 'Sin configuración contable' };
    const cuentas  = await getCuentasCached();
    const lineas   = buildLineasVenta(cuentas, config, p);

    return await recalcularAsientoDeDocumento({
      referenciaId:   p.ventaId,
      referenciaTipo: 'venta',
      nuevasLineas:   lineas,
      nuevoConcepto:  `Venta a ${p.clienteNombre}`,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      forzar:         p.forzar,
    });
  } catch (e: any) {
    return { actualizado: false, advertencia: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// COMPRAS
// ─────────────────────────────────────────────────────────────────────────

interface ParamsCompra extends ParamsBase {
  entradaId:       string;
  fecha:           Date;
  proveedorNombre: string;
  subtotal:        number;
  iva:             number;
  total:           number;
}

function buildLineasCompra(
  cuentas: CuentaContable[],
  config:  Awaited<ReturnType<typeof getOrCreateConfigContable>>,
  p:       ParamsCompra
): AsientoLinea[] {
  const lineas: AsientoLinea[] = [];
  lineas.push(buildLinea(cuentas, config.cuentaInventario,
    p.subtotal, 0, 'Compra de mercaderías'));
  if (p.iva > 0) {
    lineas.push(buildLinea(cuentas, config.cuentaIVACompras,
      p.iva, 0, 'IVA en compras 15%'));
  }
  lineas.push(buildLinea(cuentas, config.cuentaCxPProveedores,
    0, p.total, `CxP ${p.proveedorNombre}`));
  return lineas;
}

export async function crearAsientoCompra(p: ParamsCompra): Promise<string | null> {
  try {
    const config  = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();
    const lineas  = buildLineasCompra(cuentas, config, p);

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Compra a ${p.proveedorNombre}`,
      tipo:           'compra_proveedor',
      referenciaId:   p.entradaId,
      referenciaTipo: 'entrada',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

export async function recalcularAsientoCompra(
  p: ParamsCompra & { forzar?: boolean }
): Promise<{ actualizado: boolean; advertencia?: string }> {
  try {
    const config  = await getConfigSegura();
    if (!config) return { actualizado: false, advertencia: 'Sin configuración contable' };
    const cuentas = await getCuentasCached();
    const lineas  = buildLineasCompra(cuentas, config, p);

    return await recalcularAsientoDeDocumento({
      referenciaId:   p.entradaId,
      referenciaTipo: 'entrada',
      nuevasLineas:   lineas,
      nuevoConcepto:  `Compra a ${p.proveedorNombre}`,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      forzar:         p.forzar,
    });
  } catch (e: any) {
    return { actualizado: false, advertencia: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PAGOS A PROVEEDORES
// ─────────────────────────────────────────────────────────────────────────

interface ParamsPago extends ParamsBase {
  facturaId:       string;
  fecha:           Date;
  proveedorNombre: string;
  monto:           number;
  usaBanco?:       boolean; // false → usa Caja
}

function buildLineasPago(
  cuentas: CuentaContable[],
  config:  Awaited<ReturnType<typeof getOrCreateConfigContable>>,
  p:       ParamsPago
): AsientoLinea[] {
  const cuentaSalida = p.usaBanco ? config.cuentaBancos : config.cuentaCaja;
  return [
    buildLinea(cuentas, config.cuentaCxPProveedores,
      p.monto, 0, `Pago a ${p.proveedorNombre}`),
    buildLinea(cuentas, cuentaSalida,
      0, p.monto, p.usaBanco ? 'Pago desde banco' : 'Pago en efectivo'),
  ];
}

export async function crearAsientoPago(p: ParamsPago): Promise<string | null> {
  try {
    const config  = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();
    const lineas  = buildLineasPago(cuentas, config, p);

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Pago a ${p.proveedorNombre}`,
      tipo:           'pago_proveedor',
      referenciaId:   p.facturaId,
      referenciaTipo: 'factura_proveedor',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

export async function recalcularAsientoPago(
  p: ParamsPago & { forzar?: boolean }
): Promise<{ actualizado: boolean; advertencia?: string }> {
  try {
    const config  = await getConfigSegura();
    if (!config) return { actualizado: false, advertencia: 'Sin configuración contable' };
    const cuentas = await getCuentasCached();
    const lineas  = buildLineasPago(cuentas, config, p);

    return await recalcularAsientoDeDocumento({
      referenciaId:   p.facturaId,
      referenciaTipo: 'factura_proveedor',
      nuevasLineas:   lineas,
      nuevoConcepto:  `Pago a ${p.proveedorNombre}`,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      forzar:         p.forzar,
    });
  } catch (e: any) {
    return { actualizado: false, advertencia: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// COBRO A CLIENTE (CxC)
// ─────────────────────────────────────────────────────────────────────────

interface ParamsCobro extends ParamsBase {
  cxcId:        string;
  fecha:        Date;
  clienteNombre:string;
  monto:        number;
  usaBanco?:    boolean;
  retFuente?:   number;
  retIVA?:      number;
}

export async function crearAsientoCobro(p: ParamsCobro): Promise<string | null> {
  try {
    const config  = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();

    const cuentaEntrada = p.usaBanco ? config.cuentaBancos : config.cuentaCaja;
    const lineas: AsientoLinea[] = [];

    // DB: Caja o Banco (neto cobrado)
    const netoCobrado = p.monto - (p.retFuente ?? 0) - (p.retIVA ?? 0);
    lineas.push(buildLinea(cuentas, cuentaEntrada, netoCobrado, 0, `Cobro cliente ${p.clienteNombre}`));

    // DB: Retención fuente recibida
    if ((p.retFuente ?? 0) > 0) {
      lineas.push(buildLinea(cuentas, config.cuentaRetFuenteClientes,
        p.retFuente!, 0, `Ret. fuente recibida de ${p.clienteNombre}`));
    }

    // DB: Retención IVA recibida
    if ((p.retIVA ?? 0) > 0) {
      lineas.push(buildLinea(cuentas, config.cuentaRetIVAClientes,
        p.retIVA!, 0, `Ret. IVA recibida de ${p.clienteNombre}`));
    }

    // CR: CxC Clientes
    lineas.push(buildLinea(cuentas, config.cuentaCxCClientes, 0, p.monto,
      `Cancelación CxC ${p.clienteNombre}`));

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Cobro a cliente ${p.clienteNombre}`,
      tipo:           'cobro_cliente',
      referenciaId:   p.cxcId,
      referenciaTipo: 'cxc',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// NOTA DE CRÉDITO
// ─────────────────────────────────────────────────────────────────────────

interface ParamsNotaCredito extends ParamsBase {
  notaCreditoId: string;
  fecha:         Date;
  clienteNombre: string;
  tieneIVA:      boolean;
  subtotal:      number;
  iva:           number;
  total:         number;
  costoDevolucion?: number;
}

export async function crearAsientoNotaCredito(p: ParamsNotaCredito): Promise<string | null> {
  try {
    const config  = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();

    const lineas: AsientoLinea[] = [];

    // DB: Devolución ventas (reverso de la venta)
    const cuentaVentas = p.tieneIVA ? config.cuentaVentas12 : config.cuentaVentas0;
    lineas.push(buildLinea(cuentas, cuentaVentas, p.subtotal, 0, 'Devolución en ventas'));

    if (p.tieneIVA && p.iva > 0) {
      lineas.push(buildLinea(cuentas, config.cuentaIVAVentas, p.iva, 0, 'IVA devolución'));
    }

    // CR: CxC o Caja (se devuelve al cliente)
    lineas.push(buildLinea(cuentas, config.cuentaCxCClientes, 0, p.total,
      `NC emitida a ${p.clienteNombre}`));

    // Reverso costo (si aplica)
    if ((p.costoDevolucion ?? 0) > 0) {
      lineas.push(buildLinea(cuentas, config.cuentaInventario,
        p.costoDevolucion!, 0, 'Retorno mercadería'));
      lineas.push(buildLinea(cuentas, config.cuentaCostoVentas,
        0, p.costoDevolucion!, 'Reverso costo de ventas'));
    }

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Nota de crédito a ${p.clienteNombre}`,
      tipo:           'manual',
      referenciaId:   p.notaCreditoId,
      referenciaTipo: 'nota_credito',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// RETENCIÓN EMITIDA (a proveedor)
// ─────────────────────────────────────────────────────────────────────────

interface ParamsRetencionEmitida extends ParamsBase {
  retencionId:     string;
  fecha:           Date;
  proveedorNombre: string;
  totalRetenido:   number;
  retFuente:       number;
  retIVA:          number;
}

export async function crearAsientoRetencionEmitida(p: ParamsRetencionEmitida): Promise<string | null> {
  try {
    const config  = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();

    const CUENTA_RET_FUENTE = '2.1.07.01';
    const CUENTA_RET_IVA    = '2.1.07.02';

    const lineas: AsientoLinea[] = [];

    // DB: CxP Proveedores (reduce la deuda en el monto retenido)
    lineas.push(buildLinea(cuentas, config.cuentaCxPProveedores,
      p.totalRetenido, 0, `Retención emitida a ${p.proveedorNombre}`));

    if (p.retFuente > 0) {
      lineas.push(buildLinea(cuentas, CUENTA_RET_FUENTE,
        0, p.retFuente, 'Retención en la fuente por pagar'));
    }
    if (p.retIVA > 0) {
      lineas.push(buildLinea(cuentas, CUENTA_RET_IVA,
        0, p.retIVA, 'Retención de IVA por pagar'));
    }

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Retención emitida a ${p.proveedorNombre}`,
      tipo:           'manual',
      referenciaId:   p.retencionId,
      referenciaTipo: 'retencion_emitida',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// DEPRECIACIÓN ACTIVO FIJO
// ─────────────────────────────────────────────────────────────────────────

interface ParamsDepreciacion extends ParamsBase {
  activoId:            string;
  activoDescripcion:   string;
  fecha:               Date;
  cuota:               number;
  cuentaActivoCodigo:  string;
  cuentaDepAcumCodigo: string;
  cuentaGastoDepCodigo:string;
}

export async function crearAsientoDepreciacion(p: ParamsDepreciacion): Promise<string | null> {
  try {
    const cuentas = await getCuentasCached();

    const lineas: AsientoLinea[] = [
      buildLinea(cuentas, p.cuentaGastoDepCodigo, p.cuota, 0,
        `Gasto depreciación ${p.activoDescripcion}`),
      buildLinea(cuentas, p.cuentaDepAcumCodigo, 0, p.cuota,
        `Dep. acumulada ${p.activoDescripcion}`),
    ];

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Depreciación ${p.activoDescripcion}`,
      tipo:           'manual',
      referenciaId:   p.activoId,
      referenciaTipo: 'activo_fijo',
      lineas,
      totalDebe:      p.cuota,
      totalHaber:     p.cuota,
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// RETENCIÓN RECIBIDA (cliente nos retiene)
// ─────────────────────────────────────────────────────────────────────────

interface ParamsRetencionRecibida extends ParamsBase {
  retencionId:   string;
  fecha:         Date;
  clienteNombre: string;
  retFuente:     number;
  retIVA:        number;
  totalRetenido: number;
}

export async function crearAsientoRetencionRecibida(p: ParamsRetencionRecibida): Promise<string | null> {
  try {
    const config  = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();

    const cuentaRetFuente = (config as any).cuentaRetFuenteProveedores ?? '1.1.06.01';
    const cuentaRetIVA    = (config as any).cuentaRetIVAProveedores    ?? '1.1.06.02';

    const lineas: AsientoLinea[] = [];

    if (p.retFuente > 0) {
      lineas.push(buildLinea(cuentas, cuentaRetFuente,
        p.retFuente, 0, `Ret. fuente recibida de ${p.clienteNombre}`));
    }
    if (p.retIVA > 0) {
      lineas.push(buildLinea(cuentas, cuentaRetIVA,
        p.retIVA, 0, `Ret. IVA recibida de ${p.clienteNombre}`));
    }
    // CR: CxC Clientes (reduce la cuenta por cobrar)
    lineas.push(buildLinea(cuentas, config.cuentaCxCClientes,
      0, p.totalRetenido, `Retención comprobante ${p.clienteNombre}`));

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Retención recibida de ${p.clienteNombre}`,
      tipo:           'manual',
      referenciaId:   p.retencionId,
      referenciaTipo: 'retencion_recibida',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// PROVISIÓN DE CARTERA INCOBRABLE
// ─────────────────────────────────────────────────────────────────────────

interface ParamsProvisionCartera extends ParamsBase {
  provisionId: string;
  fecha:       Date;
  monto:       number;
  descripcion: string;
}

export async function crearAsientoProvisionCartera(p: ParamsProvisionCartera): Promise<string | null> {
  try {
    const config  = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();

    const cuentaGasto    = (config as any).cuentaGastoProvision    ?? '5.2.04';
    const cuentaProvision = (config as any).cuentaProvisionCartera ?? '1.2.01';

    const lineas: AsientoLinea[] = [
      buildLinea(cuentas, cuentaGasto,    p.monto, 0, p.descripcion),
      buildLinea(cuentas, cuentaProvision, 0, p.monto, 'Provisión cuentas incobrables'),
    ];

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       p.descripcion,
      tipo:           'manual',
      referenciaId:   p.provisionId,
      referenciaTipo: 'provision_cartera',
      lineas,
      totalDebe:      p.monto,
      totalHaber:     p.monto,
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// ASIENTO DE APERTURA (inicio de período)
// ─────────────────────────────────────────────────────────────────────────

export interface LineaApertura {
  cuentaCodigo: string;
  debe:         number;
  haber:        number;
}

interface ParamsApertura extends ParamsBase {
  periodoId:  string;
  fecha:      Date;
  anio:       number;
  lineas:     LineaApertura[];
}

export async function crearAsientoApertura(p: ParamsApertura): Promise<string | null> {
  try {
    const cuentas = await getCuentasCached();

    const lineas: AsientoLinea[] = p.lineas.map(l =>
      buildLinea(cuentas, l.cuentaCodigo, l.debe, l.haber, 'Saldo inicial')
    );

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Asiento de apertura ${p.anio}`,
      tipo:           'apertura',
      referenciaId:   p.periodoId,
      referenciaTipo: 'periodo',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// ASIENTO DE CIERRE (fin de período — cierra ingresos y gastos a utilidad)
// ─────────────────────────────────────────────────────────────────────────

interface ParamsCierre extends ParamsBase {
  periodoId:        string;
  fecha:            Date;
  anio:             number;
  totalIngresos:    number;
  totalGastos:      number;
  utilidad:         number; // puede ser negativo (pérdida)
}

export async function crearAsientoCierre(p: ParamsCierre): Promise<string | null> {
  try {
    const config  = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();

    const cuentaIngresos  = config.cuentaVentas12;
    const cuentaGastos    = config.cuentaCostoVentas;
    const cuentaUtilidad  = (config as any).cuentaUtilidadEjercicio ?? '3.4.01';

    const lineas: AsientoLinea[] = [];

    // Cierra Ingresos: DB Ingresos / CR Utilidad
    lineas.push(buildLinea(cuentas, cuentaIngresos,
      p.totalIngresos, 0, `Cierre ingresos ${p.anio}`));

    // Cierra Gastos: CR Gastos / DB Utilidad
    lineas.push(buildLinea(cuentas, cuentaGastos,
      0, p.totalGastos, `Cierre gastos ${p.anio}`));

    // Resultado neto a Utilidad/Pérdida del ejercicio
    if (p.utilidad >= 0) {
      lineas.push(buildLinea(cuentas, cuentaUtilidad,
        0, p.utilidad, `Utilidad del ejercicio ${p.anio}`));
    } else {
      lineas.push(buildLinea(cuentas, cuentaUtilidad,
        Math.abs(p.utilidad), 0, `Pérdida del ejercicio ${p.anio}`));
    }

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       `Asiento de cierre ${p.anio}`,
      tipo:           'cierre',
      referenciaId:   p.periodoId,
      referenciaTipo: 'periodo',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// AJUSTE DE INVENTARIO
// ─────────────────────────────────────────────────────────────────────────

interface ParamsAjuste extends ParamsBase {
  ajusteId:    string;
  fecha:       Date;
  descripcion: string;
  monto:       number;
  esPositivo:  boolean;
}

export async function crearAsientoAjusteInventario(p: ParamsAjuste): Promise<string | null> {
  try {
    const config  = await getConfigSegura();
    if (!config) return null;
    const cuentas = await getCuentasCached();

    // Cuenta de ajuste (contra-cuenta genérica de ajustes de inventario)
    const CUENTA_AJUSTE = '5.3.01'; // Ajustes de inventario — debe existir en el plan

    const lineas: AsientoLinea[] = p.esPositivo
      ? [
          buildLinea(cuentas, config.cuentaInventario, p.monto, 0, p.descripcion),
          buildLinea(cuentas, CUENTA_AJUSTE,            0, p.monto, 'Ajuste positivo inventario'),
        ]
      : [
          buildLinea(cuentas, CUENTA_AJUSTE,            p.monto, 0, 'Ajuste negativo inventario'),
          buildLinea(cuentas, config.cuentaInventario,  0, p.monto, p.descripcion),
        ];

    return await createAsiento({
      fecha:          p.fecha,
      concepto:       p.descripcion,
      tipo:           'ajuste_inventario',
      referenciaId:   p.ajusteId,
      referenciaTipo: 'ajuste',
      lineas,
      totalDebe:      lineas.reduce((s, l) => s + l.debe,  0),
      totalHaber:     lineas.reduce((s, l) => s + l.haber, 0),
      estado:         'confirmado',
      bloqueado:      false,
      editadoManualmente: false,
      usuarioId:      p.usuarioId,
      usuarioNombre:  p.usuarioNombre,
      createdAt:      new Date(),
    });
  } catch { return null; }
}
