/**
 * Empareja las líneas de una factura de proveedor (XML) con el catálogo de productos
 * usando el código que ese proveedor le da a cada producto, para saber si cada línea
 * es inventario o gasto (y a qué cuenta).
 */

import { Producto } from '@/types';
import type { LineaCompraClasificada } from '@/lib/contabilidad/motor-asientos';

export interface DetalleFacturaXML {
  codigoPrincipal:        string;
  descripcion:            string;
  precioTotalSinImpuesto: number;
}

export interface LineaClasificada {
  indice:      number;
  codigo:      string;
  descripcion: string;
  monto:       number;
  producto?:   Producto; // undefined = sin emparejar (aplica la regla del proveedor)
}

const norm = (s: string) => s.trim().toUpperCase();

export function productoDeProveedor(
  productos: Producto[], rucProveedor: string, codigo: string
): Producto | undefined {
  if (!codigo.trim()) return undefined;
  return productos.find(p =>
    p.activo !== false &&
    (p.proveedores ?? []).some(v => v.proveedorRuc === rucProveedor && norm(v.codigoProveedor) === norm(codigo))
  );
}

export function clasificarDetalles(
  productos: Producto[], rucProveedor: string, detalles: DetalleFacturaXML[]
): LineaClasificada[] {
  return detalles.map((d, indice) => ({
    indice,
    codigo:      d.codigoPrincipal,
    descripcion: d.descripcion,
    monto:       d.precioTotalSinImpuesto,
    producto:    productoDeProveedor(productos, rucProveedor, d.codigoPrincipal),
  }));
}

/** Convierte las líneas clasificadas al formato que consume el motor de asientos. */
export function aLineasCompra(lineas: LineaClasificada[]): LineaCompraClasificada[] {
  return lineas.map(l => ({
    monto:       l.monto,
    descripcion: l.descripcion,
    destino:     l.producto ? (l.producto.tipoItem === 'gasto' ? 'gasto' : 'inventario') : undefined,
    cuentaGasto: l.producto?.tipoItem === 'gasto' ? l.producto.cuentaGasto : undefined,
  }));
}
