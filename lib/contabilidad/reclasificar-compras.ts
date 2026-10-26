/**
 * Reclasifica de Inventario a Gasto los asientos de compra de facturas de
 * proveedores que NO son de mercadería (ver esCompraInventario). Antes de que
 * existiera esa regla, toda factura importada debitaba Inventario.
 */

import { getFacturasProveedor } from '@/lib/firebase/facturas-proveedor';
import { getAsientos, reclasificarCuentaEnAsiento } from '@/lib/firebase/asientos';
import { getCuentas, createCuenta } from '@/lib/firebase/plan-cuentas';
import { getOrCreateConfigContable } from '@/lib/firebase/config-contable';
import { esCompraInventario, invalidarCacheCuentas } from '@/lib/contabilidad/motor-asientos';
import { PLAN_CUENTAS_ECUADOR, CUENTAS_POR_DEFECTO } from '@/lib/data/plan-cuentas-ecuador';
import { Proveedor } from '@/types';

export interface CompraAReclasificar {
  asientoId:       string;
  numero:          string;
  fecha:           Date;
  proveedorNombre: string;
  monto:           number;
  cuentaOrigen:    string;
  cuentaDestino:   string;
  bloqueado:       boolean;
}

export async function buscarComprasAReclasificar(
  proveedores: Proveedor[]
): Promise<CompraAReclasificar[]> {
  const [config, facturas, asientos] = await Promise.all([
    getOrCreateConfigContable(), getFacturasProveedor(), getAsientos(),
  ]);
  const facturaPorId = new Map(facturas.map(f => [f.id, f]));
  const provPorId    = new Map(proveedores.map(p => [p.id, p]));
  const provPorRuc   = new Map(proveedores.map(p => [p.ruc, p]));

  const gastoPorDefecto = config.cuentaGastoCompras || CUENTAS_POR_DEFECTO.cuentaGastoCompras;
  const res: CompraAReclasificar[] = [];
  for (const a of asientos) {
    if (a.tipo !== 'compra_proveedor' || a.referenciaTipo !== 'factura_proveedor') continue;
    if (a.clasificadoPorProducto) continue; // ya repartida por línea según el catálogo
    // Origen: Inventario (error original) o el gasto por defecto, por si el
    // proveedor ahora tiene una cuenta propia (combustible, etc.).
    const linea = a.lineas.find(l =>
      (l.cuentaCodigo === config.cuentaInventario || l.cuentaCodigo === gastoPorDefecto) && l.debe > 0);
    if (!linea) continue;
    const f = facturaPorId.get(a.referenciaId ?? '');
    if (!f || f.estado === 'anulada') continue;
    const prov = provPorId.get(f.proveedorId) ?? provPorRuc.get(f.proveedorRuc);
    const datos = prov ?? { nombre: f.proveedorNombre };
    if (esCompraInventario(datos)) continue;
    const cuentaDestino = prov?.cuentaGasto?.trim() || gastoPorDefecto;
    if (cuentaDestino === linea.cuentaCodigo) continue;
    res.push({
      asientoId: a.id, numero: a.numero ?? '', fecha: a.fecha,
      proveedorNombre: f.proveedorNombre, monto: linea.debe,
      cuentaOrigen: linea.cuentaCodigo, cuentaDestino,
      bloqueado: !!a.bloqueado,
    });
  }
  return res;
}

/** Garantiza que la cuenta de destino exista en el plan (la crea si falta, p. ej. 52022801). */
export async function asegurarCuenta(codigo: string) {
  const existente = (await getCuentas()).find(c => c.codigo === codigo);
  if (existente) return { codigo, nombre: existente.nombre, id: existente.id };
  const base = PLAN_CUENTAS_ECUADOR.find(c => c.codigo === codigo);
  if (!base) throw new Error(`La cuenta ${codigo} no existe en el plan de cuentas. Créala primero.`);
  const id = await createCuenta({ ...base, activa: true });
  invalidarCacheCuentas();
  return { codigo, nombre: base.nombre, id };
}

export async function reclasificarCompras(
  items: CompraAReclasificar[],
  usuario: { uid: string; nombre: string },
  onProgreso?: (hechos: number) => void
): Promise<{ ok: number; omitidos: number; errores: number }> {
  const destinos = new Map<string, { codigo: string; nombre: string; id: string }>();
  let ok = 0, omitidos = 0, errores = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      if (it.bloqueado) { omitidos++; continue; }
      if (!destinos.has(it.cuentaDestino)) destinos.set(it.cuentaDestino, await asegurarCuenta(it.cuentaDestino));
      const cambio = await reclasificarCuentaEnAsiento(
        it.asientoId, it.cuentaOrigen, destinos.get(it.cuentaDestino)!, usuario.uid, usuario.nombre
      );
      if (cambio) ok++; else omitidos++;
    } catch { errores++; }
    onProgreso?.(i + 1);
  }
  return { ok, omitidos, errores };
}
