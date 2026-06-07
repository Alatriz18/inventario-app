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
