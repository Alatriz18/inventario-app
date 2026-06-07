'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Download, Package, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { Producto, Movimiento } from '@/types';
import { subscribeToProductos }  from '@/lib/firebase/productos';
import { subscribeToMovimientos } from '@/lib/firebase/movimientos';

const currency = (v: number) => `$${v.toFixed(2)}`;

const TIPO_LABEL: Record<string, string> = {
  entrada:             'Entrada',
  salida:              'Salida',
  ajuste_positivo:     'Ajuste (+)',
  ajuste_negativo:     'Ajuste (−)',
  devolucion_cliente:  'Dev. Cliente',
  devolucion_proveedor:'Dev. Proveedor',
};

const TIPO_COLOR: Record<string, string> = {
  entrada:             'bg-green-100 text-green-700',
  salida:              'bg-red-100 text-red-700',
  ajuste_positivo:     'bg-blue-100 text-blue-700',
  ajuste_negativo:     'bg-orange-100 text-orange-700',
  devolucion_cliente:  'bg-purple-100 text-purple-700',
  devolucion_proveedor:'bg-yellow-100 text-yellow-700',
};

export default function KardexPage() {
  const [productos,    setProductos]    = useState<Producto[]>([]);
  const [movimientos,  setMovimientos]  = useState<Movimiento[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [productoId,   setProductoId]   = useState<string>('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  useEffect(() => {
    const u1 = subscribeToProductos(d => { setProductos(d); setLoading(false); });
    const u2 = subscribeToMovimientos(setMovimientos);
    return () => { u1(); u2(); };
  }, []);

  const productoSel = useMemo(
    () => productos.find(p => p.id === productoId) ?? null,
    [productos, productoId]
  );

  // Kardex: movimientos del producto seleccionado, filtrados por fecha
  const kardex = useMemo(() => {
    if (!productoId) return [];

    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
    const to   = dateTo   ? new Date(dateTo   + 'T23:59:59') : null;

    return movimientos
      .filter(m => {
        if (m.productoId !== productoId) return false;
        const fecha = (m.fecha as any)?.toDate?.() ?? new Date(m.fecha);
        if (from && fecha < from) return false;
        if (to   && fecha > to)   return false;
        return true;
      })
      .sort((a, b) => {
        const fa = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
        const fb = (b.fecha as any)?.toDate?.() ?? new Date(b.fecha);
        return fa.getTime() - fb.getTime();
      });
  }, [movimientos, productoId, dateFrom, dateTo]);

  // Resumen del kardex
  const resumen = useMemo(() => {
    let entradas = 0, salidas = 0, ajustes = 0;
    kardex.forEach(m => {
      if (m.tipo === 'entrada' || m.tipo === 'devolucion_cliente') entradas += m.cantidad;
      else if (m.tipo === 'salida' || m.tipo === 'devolucion_proveedor') salidas += m.cantidad;
      else if (m.tipo === 'ajuste_positivo') ajustes += m.cantidad;
      else if (m.tipo === 'ajuste_negativo') ajustes -= m.cantidad;
    });
    return { entradas, salidas, ajustes };
  }, [kardex]);

  const exportar = () => {
    if (!productoSel || kardex.length === 0) return;
    const rows = kardex.map(m => ({
      Fecha:          fmtDate(m.fecha),
      Tipo:           TIPO_LABEL[m.tipo] ?? m.tipo,
      Referencia:     m.referencia,
      Bodega:         m.bodegaNombre ?? '—',
      Cantidad:       m.tipo === 'salida' || m.tipo === 'ajuste_negativo' || m.tipo === 'devolucion_proveedor'
                        ? -m.cantidad : m.cantidad,
      StockAnterior:  m.stockAnterior,
      StockNuevo:     m.stockNuevo,
      Notas:          m.notas ?? '',
      Responsable:    m.usuarioNombre,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Kardex');
    XLSX.writeFile(wb, `kardex_${productoSel.sku}_${format(new Date(),'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kardex de Inventario"
        description="Historial de movimientos por producto con saldo acumulado"
        action={
          <Button variant="outline" size="sm" onClick={exportar}
            disabled={kardex.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-56">
          <Label className="text-xs">Producto *</Label>
          <Select value={productoId} onValueChange={setProductoId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Seleccionar producto…" />
            </SelectTrigger>
            <SelectContent>
              {productos.filter(p => p.activo).map(p => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="font-mono text-xs text-slate-400 mr-2">{p.sku}</span>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="mt-1 w-36 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="mt-1 w-36 h-9 text-sm" />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
            Limpiar fechas
          </Button>
        )}
      </div>

      {/* Info del producto */}
      {productoSel && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Stock actual',      value: productoSel.stockActual,              color: 'text-slate-900' },
            { label: 'Entradas período',  value: resumen.entradas,                    color: 'text-green-600' },
            { label: 'Salidas período',   value: resumen.salidas,                     color: 'text-red-600'   },
            { label: 'Precio compra',     value: currency(productoSel.precioCompra),  color: 'text-slate-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-400">{label}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla kardex */}
      {!productoId ? (
        <div className="bg-white rounded-xl border flex flex-col items-center justify-center py-20 text-slate-400">
          <Package className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Selecciona un producto para ver su kardex</p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl border p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : kardex.length === 0 ? (
        <div className="bg-white rounded-xl border flex flex-col items-center justify-center py-20 text-slate-400">
          <Search className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Sin movimientos en el período seleccionado</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          {/* Header con producto */}
          <div className="px-5 py-3 bg-slate-50 border-b flex items-center justify-between">
            <div>
              <span className="font-mono text-xs text-slate-400 mr-2">{productoSel?.sku}</span>
              <span className="font-semibold text-slate-800">{productoSel?.nombre}</span>
            </div>
            <Badge variant="outline" className="text-xs">{kardex.length} movimientos</Badge>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/60">
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Bodega</TableHead>
                <TableHead className="text-center">Entradas</TableHead>
                <TableHead className="text-center">Salidas</TableHead>
                <TableHead className="text-center">Saldo</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kardex.map((m, idx) => {
                const esEntrada = m.tipo === 'entrada' || m.tipo === 'devolucion_cliente' || m.tipo === 'ajuste_positivo';
                const esSalida  = m.tipo === 'salida'  || m.tipo === 'devolucion_proveedor' || m.tipo === 'ajuste_negativo';
                return (
                  <TableRow key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                    <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                      {fmtDate(m.fecha)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLOR[m.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
                        {TIPO_LABEL[m.tipo] ?? m.tipo}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 font-mono">
                      {m.referencia ? m.referencia.slice(0, 12) + '…' : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{m.bodegaNombre ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      {esEntrada && (
                        <span className="text-green-700 font-semibold">+{m.cantidad}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {esSalida && (
                        <span className="text-red-600 font-semibold">−{m.cantidad}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-bold text-slate-800">{m.stockNuevo}</span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{m.usuarioNombre}</TableCell>
                    <TableCell className="text-xs text-slate-400 max-w-32 truncate">
                      {m.notas ?? ''}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Totales */}
          <div className="px-4 py-3 border-t bg-slate-50 flex justify-between text-sm">
            <span className="text-slate-400">{kardex.length} movimientos</span>
            <div className="flex gap-6">
              <span className="text-green-600">
                Entradas: <strong>+{resumen.entradas}</strong>
              </span>
              <span className="text-red-600">
                Salidas: <strong>−{resumen.salidas}</strong>
              </span>
              <span className="text-slate-700">
                Saldo final: <strong>{productoSel?.stockActual ?? 0}</strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtDate(d: any): string {
  try {
    const date = d?.toDate?.() ?? new Date(d);
    return format(date, 'dd/MM/yyyy HH:mm');
  } catch { return '—'; }
}
