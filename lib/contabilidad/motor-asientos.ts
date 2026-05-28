import { getOrCreateConfigContable } from '@/lib/firebase/config-contable';
import { getCuentas }                from '@/lib/firebase/plan-cuentas';
import { createAsiento, confirmarAsiento } from '@/lib/firebase/asientos';
import { CuentaContable, AsientoLinea, TipoAsiento } from '@/types';

let cuentasCache: CuentaContable[] = [];

async function getCuentasCached(): Promise<CuentaContable[]> {
  if (cuentasCache.length === 0) cuentasCache = await getCuentas();
  return cuentasCache;
}

function buildLinea(
  cuentas:     CuentaContable[],
  codigo:      string,
  debe:        number,
  haber:       number,
  descripcion: string
): AsientoLinea {
  const cuenta = cuentas.find(c => c.codigo === codigo);
  return {
    id:          Date.now().toString() + Math.random().toString(36).slice(2),
    cuentaId:    cuenta?.id    ?? codigo,
    cuentaCodigo:cuenta?.codigo ?? codigo,
    cuentaNombre:cuenta?.nombre ?? codigo,
    debe,
    haber,
    descripcion,
  };
}

// ── Asiento de venta ──────────────────────────────────────────────────────
export async function crearAsientoVenta(params: {
  ventaId:      string;
  fecha:        Date;
  clienteNombre:string;
  tieneIVA:     boolean;
  subtotal:     number;
  iva:          number;
  total:        number;
  costoVenta:   number;
  usuarioId:    string;
  usuarioNombre:string;
}): Promise<string> {
  const config  = await getOrCreateConfigContable();
  const cuentas = await getCuentasCached();
  const lineas:  AsientoLinea[] = [];

  // Débito: Caja / CxC
  lineas.push(buildLinea(cuentas, config.cuentaCaja, params.total, 0,
    `Cobro venta ${params.clienteNombre}`));

  // Crédito: Ventas
  lineas.push(buildLinea(cuentas,
    params.tieneIVA ? config.cuentaVentas12 : config.cuentaVentas0,
    0, params.subtotal, 'Ingresos por ventas'));

  // Crédito: IVA Ventas (si aplica)
  if (params.tieneIVA && params.iva > 0) {
    lineas.push(buildLinea(cuentas, config.cuentaIVAVentas, 0, params.iva, 'IVA cobrado 15%'));
  }

  // Débito: Costo de ventas / Crédito: Inventario
  if (params.costoVenta > 0) {
    lineas.push(buildLinea(cuentas, config.cuentaCostoVentas, params.costoVenta, 0, 'Costo de mercaderías vendidas'));
    lineas.push(buildLinea(cuentas, config.cuentaInventario, 0, params.costoVenta, 'Salida de inventario'));
  }

  const totalDebe  = lineas.reduce((s, l) => s + l.debe,  0);
  const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);

  const tipo: TipoAsiento = params.tieneIVA ? 'venta_factura' : 'venta_nota';
  const id = await createAsiento({
    fecha:          params.fecha,
    concepto:       `Venta a ${params.clienteNombre}`,
    tipo,
    referenciaId:   params.ventaId,
    referenciaTipo: 'venta',
    lineas,
    totalDebe,
    totalHaber,
    estado:        'confirmado',
    usuarioId:     params.usuarioId,
    usuarioNombre: params.usuarioNombre,
    createdAt:     new Date(),
  });
  return id;
}

// ── Asiento de compra a proveedor ─────────────────────────────────────────
export async function crearAsientoCompra(params: {
  entradaId:      string;
  fecha:          Date;
  proveedorNombre:string;
  subtotal:       number;
  iva:            number;
  total:          number;
  usuarioId:      string;
  usuarioNombre:  string;
}): Promise<string> {
  const config  = await getOrCreateConfigContable();
  const cuentas = await getCuentasCached();
  const lineas:  AsientoLinea[] = [];

  lineas.push(buildLinea(cuentas, config.cuentaInventario, params.subtotal, 0, 'Compra de mercaderías'));
  if (params.iva > 0) {
    lineas.push(buildLinea(cuentas, config.cuentaIVACompras, params.iva, 0, 'IVA en compras 15%'));
  }
  lineas.push(buildLinea(cuentas, config.cuentaCxPProveedores, 0, params.total,
    `CxP ${params.proveedorNombre}`));

  const totalDebe  = lineas.reduce((s, l) => s + l.debe,  0);
  const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);

  const id = await createAsiento({
    fecha:          params.fecha,
    concepto:       `Compra a ${params.proveedorNombre}`,
    tipo:           'compra_proveedor',
    referenciaId:   params.entradaId,
    referenciaTipo: 'entrada',
    lineas,
    totalDebe,
    totalHaber,
    estado:        'confirmado',
    usuarioId:     params.usuarioId,
    usuarioNombre: params.usuarioNombre,
    createdAt:     new Date(),
  });
  return id;
}

// ── Asiento de pago a proveedor ───────────────────────────────────────────
export async function crearAsientoPago(params: {
  facturaId:      string;
  fecha:          Date;
  proveedorNombre:string;
  monto:          number;
  usuarioId:      string;
  usuarioNombre:  string;
}): Promise<string> {
  const config  = await getOrCreateConfigContable();
  const cuentas = await getCuentasCached();
  const lineas: AsientoLinea[] = [
    buildLinea(cuentas, config.cuentaCxPProveedores, params.monto, 0, `Pago a ${params.proveedorNombre}`),
    buildLinea(cuentas, config.cuentaBancos, 0, params.monto, 'Pago desde banco'),
  ];

  const id = await createAsiento({
    fecha:          params.fecha,
    concepto:       `Pago a ${params.proveedorNombre}`,
    tipo:           'pago_proveedor',
    referenciaId:   params.facturaId,
    referenciaTipo: 'factura_proveedor',
    lineas,
    totalDebe:      params.monto,
    totalHaber:     params.monto,
    estado:        'confirmado',
    usuarioId:     params.usuarioId,
    usuarioNombre: params.usuarioNombre,
    createdAt:     new Date(),
  });
  return id;
}