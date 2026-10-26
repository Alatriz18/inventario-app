import { describe, it, expect } from 'vitest';
import { clasificarDetalles, aLineasCompra } from '@/lib/contabilidad/clasificar-compra';
import { Producto } from '@/types';

const base = { sku: 'X', categoriaId: 'c', precioCompra: 0, precioVenta: 0, stockActual: 0, stockMinimo: 0,
  activo: true, createdAt: new Date(), updatedAt: new Date() };

const productos: Producto[] = [
  { ...base, id: '1', nombre: 'COMBUSTIBLE', tipoItem: 'gasto', cuentaGasto: '520212',
    proveedores: [{ proveedorId: 'p', proveedorRuc: '0991285679001', proveedorNombre: 'SERVIENTREGA', codigoProveedor: ' 000000001 ' }] },
  { ...base, id: '2', nombre: 'Cigarrillos', proveedores: [{ proveedorId: 'q', proveedorRuc: '1790000000001', proveedorNombre: 'CELAYSA', codigoProveedor: 'ABC' }] },
];

const detalles = [
  { codigoPrincipal: '000000001', descripcion: 'MERCANCIA PREMIER', precioTotalSinImpuesto: 5.15 },
  { codigoPrincipal: 'abc', descripcion: 'Cigarrillos', precioTotalSinImpuesto: 10 },
  { codigoPrincipal: 'ZZZ', descripcion: 'Otro', precioTotalSinImpuesto: 3 },
];

describe('clasificarDetalles', () => {
  it('empareja por RUC del proveedor y código, sin distinguir mayúsculas ni espacios', () => {
    const r = clasificarDetalles(productos, '0991285679001', detalles);
    expect(r[0].producto?.id).toBe('1');
    expect(r[1].producto).toBeUndefined(); // ese código es de otro proveedor
    expect(r[2].producto).toBeUndefined();
  });

  it('convierte a líneas de compra: gasto con su cuenta, inventario, y sin emparejar', () => {
    const l = aLineasCompra(clasificarDetalles(productos, '1790000000001', detalles));
    expect(l[1]).toMatchObject({ destino: 'inventario', monto: 10 });
    const g = aLineasCompra(clasificarDetalles(productos, '0991285679001', detalles));
    expect(g[0]).toMatchObject({ destino: 'gasto', cuentaGasto: '520212' });
    expect(g[2].destino).toBeUndefined();
  });
});
