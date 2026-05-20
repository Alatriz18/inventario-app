'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, TrendingUp, ShoppingCart, Package, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { Venta, Producto } from '@/types';
import { subscribeToVentas }   from '@/lib/firebase/ventas';
import { subscribeToProductos } from '@/lib/firebase/productos';

// ─── Colores ────────────────────────────────────────────────────────────────
const COLORS = ['#1A3C5E', '#2E75B6', '#00A896', '#F59E0B', '#EF4444', '#8B5CF6'];

function currency(v: number) { return `$${v.toFixed(2)}`; }

// ─── Presets de fecha ────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Hoy',        from: () => format(new Date(), 'yyyy-MM-dd'),              to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: '7 días',     from: () => format(subDays(new Date(), 6), 'yyyy-MM-dd'),  to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Este mes',   from: () => format(startOfMonth(new Date()), 'yyyy-MM-dd'),to: () => format(endOfMonth(new Date()), 'yyyy-MM-dd') },
  { label: 'Este año',   from: () => format(startOfYear(new Date()), 'yyyy-MM-dd'), to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Todo',       from: () => '2020-01-01',                                  to: () => format(new Date(), 'yyyy-MM-dd') },
];

export default function ReportesPage() {
  const [ventas,    setVentas]    = useState<Venta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [dateFrom,  setDateFrom]  = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo,    setDateTo]    = useState(format(new Date(), 'yyyy-MM-dd'));
  const [preset,    setPreset]    = useState('Este mes');

  useEffect(() => {
    const u1 = subscribeToVentas((d) => { setVentas(d); setLoading(false); });
    const u2 = subscribeToProductos(setProductos);
    return () => { u1(); u2(); };
  }, []);

  const applyPreset = (p: typeof PRESETS[0]) => {
    setDateFrom(p.from());
    setDateTo(p.to());
    setPreset(p.label);
  };

  // ── Filtrar ventas por período ──
  const ventasFiltradas = useMemo(() => {
    const from = new Date(dateFrom + 'T00:00:00');
    const to   = new Date(dateTo   + 'T23:59:59');
    return ventas.filter(v => {
      if (v.estado === 'anulada') return false;
      const fecha = (v.fecha as any)?.toDate?.() ?? new Date(v.fecha);
      return fecha >= from && fecha <= to;
    });
  }, [ventas, dateFrom, dateTo]);

  // ── KPIs ──
  const kpis = useMemo(() => ({
    totalVentas:    ventasFiltradas.reduce((s, v) => s + v.total, 0),
    totalGanancias: ventasFiltradas.reduce((s, v) => s + v.gananciaTotal, 0),
    numVentas:      ventasFiltradas.length,
    ticketPromedio: ventasFiltradas.length
      ? ventasFiltradas.reduce((s, v) => s + v.total, 0) / ventasFiltradas.length
      : 0,
  }), [ventasFiltradas]);

  // ── Ventas por día ──
  const ventasPorDia = useMemo(() => {
    const map = new Map<string, { ventas: number; ganancia: number }>();
    ventasFiltradas.forEach(v => {
      const fecha = format((v.fecha as any)?.toDate?.() ?? new Date(v.fecha), 'dd/MM');
      const prev  = map.get(fecha) ?? { ventas: 0, ganancia: 0 };
      map.set(fecha, { ventas: prev.ventas + v.total, ganancia: prev.ganancia + v.gananciaTotal });
    });
    return Array.from(map.entries())
      .map(([fecha, data]) => ({ fecha, ...data }))
      .slice(-30); // últimos 30 días
  }, [ventasFiltradas]);

  // ── Top productos ──
  const topProductos = useMemo(() => {
    const map = new Map<string, { nombre: string; cantidad: number; total: number; ganancia: number }>();
    ventasFiltradas.forEach(v => {
      v.items.forEach(item => {
        const prev = map.get(item.productoId) ?? { nombre: item.nombre, cantidad: 0, total: 0, ganancia: 0 };
        map.set(item.productoId, {
          nombre:   item.nombre,
          cantidad: prev.cantidad + item.cantidad,
          total:    prev.total    + item.subtotal,
          ganancia: prev.ganancia + item.ganancia,
        });
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [ventasFiltradas]);

  // ── Métodos de pago ──
  const metodosPago = useMemo(() => {
    const map = new Map<string, number>();
    ventasFiltradas.forEach(v => {
      map.set(v.metodoPago, (map.get(v.metodoPago) ?? 0) + v.total);
    });
    return Array.from(map.entries()).map(([name, value]) => ({
      name: name === 'efectivo' ? 'Efectivo' : name === 'tarjeta' ? 'Tarjeta' : 'Transferencia',
      value: parseFloat(value.toFixed(2)),
    }));
  }, [ventasFiltradas]);

  // ── Inventario valorizado ──
  const inventario = useMemo(() => {
    return productos
      .filter(p => p.activo)
      .map(p => ({
        ...p,
        valorTotal: p.stockActual * p.precioCompra,
        bajoMinimo: p.stockActual <= p.stockMinimo,
      }))
      .sort((a, b) => b.valorTotal - a.valorTotal);
  }, [productos]);

  const valorTotalInventario = inventario.reduce((s, p) => s + p.valorTotal, 0);
  const productosBajoMinimo  = inventario.filter(p => p.bajoMinimo).length;

  // ── Exportar Excel ──
  const exportVentas = () => {
    const rows = ventasFiltradas.map(v => ({
      Fecha:         format((v.fecha as any)?.toDate?.() ?? new Date(v.fecha), 'dd/MM/yyyy HH:mm'),
      Cliente:       v.clienteNombre,
      Identificacion:v.clienteIdentificacion,
      Items:         v.items.length,
      Subtotal:      v.subtotal,
      Descuento:     v.descuentoGlobal,
      Total:         v.total,
      Ganancia:      v.gananciaTotal,
      MetodoPago:    v.metodoPago,
      Vendedor:      v.usuarioNombre,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
    XLSX.writeFile(wb, `reporte_ventas_${dateFrom}_${dateTo}.xlsx`);
  };

  const exportInventario = () => {
    const rows = inventario.map(p => ({
      SKU:           p.sku,
      Nombre:        p.nombre,
      Categoria:     p.categoriaNombre,
      StockActual:   p.stockActual,
      StockMinimo:   p.stockMinimo,
      BajoMinimo:    p.bajoMinimo ? 'SÍ' : 'NO',
      PrecioCompra:  p.precioCompra,
      PrecioVenta:   p.precioVenta,
      ValorInventario:p.valorTotal,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `reporte_inventario_${format(new Date(),'yyyy-MM-dd')}.xlsx`);
  };

  const exportGanancias = () => {
    const rows = topProductos.map(p => ({
      Producto:        p.nombre,
      CantidadVendida: p.cantidad,
      TotalVentas:     p.total,
      Ganancia:        p.ganancia,
      MargenPct:       p.total > 0 ? ((p.ganancia / p.total) * 100).toFixed(1) + '%' : '0%',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ganancias');
    XLSX.writeFile(wb, `reporte_ganancias_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Reportes" description="Análisis de ventas, inventario y rentabilidad" />

      {/* ── Selector de período ── */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Período de análisis</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                preset === p.label
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Desde</span>
            <Input type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPreset(''); }}
              className="w-36 h-8 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Hasta</span>
            <Input type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPreset(''); }}
              className="w-36 h-8 text-sm" />
          </div>
          <Badge variant="outline" className="text-xs">
            {ventasFiltradas.length} venta(s) en el período
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="resumen">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="resumen">📊 Resumen</TabsTrigger>
          <TabsTrigger value="ventas">💰 Ventas</TabsTrigger>
          <TabsTrigger value="inventario">📦 Inventario</TabsTrigger>
          <TabsTrigger value="ganancias">📈 Ganancias</TabsTrigger>
        </TabsList>

        {/* ══ TAB RESUMEN ══════════════════════════════════════════════════ */}
        <TabsContent value="resumen" className="space-y-5 mt-4">

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {loading ? Array.from({length:4}).map((_,i) => (
              <div key={i} className="bg-white rounded-xl border p-4"><Skeleton className="h-12 w-full" /></div>
            )) : [
              { label: 'Ingresos',       value: currency(kpis.totalVentas),    color: 'text-slate-900', icon: ShoppingCart, bg: 'bg-blue-50' },
              { label: 'Ganancia neta',  value: currency(kpis.totalGanancias), color: 'text-green-600', icon: TrendingUp,   bg: 'bg-green-50' },
              { label: 'Nº de ventas',   value: kpis.numVentas,               color: 'text-slate-700', icon: ShoppingCart, bg: 'bg-slate-100' },
              { label: 'Ticket promedio',value: currency(kpis.ticketPromedio), color: 'text-purple-600',icon: TrendingUp,   bg: 'bg-purple-50' },
            ].map(({ label, value, color, icon: Icon, bg }) => (
              <div key={label} className="bg-white rounded-xl border p-4 flex items-center gap-3">
                <div className={`${bg} p-2.5 rounded-lg`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Gráfico ventas por día */}
          <div className="bg-white rounded-xl border p-5">
            <p className="font-semibold text-slate-700 mb-4">Ventas y Ganancias por día</p>
            {ventasPorDia.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                Sin datos en el período seleccionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={ventasPorDia}>
                  <defs>
                    <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2E75B6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2E75B6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorGanancia" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#00A896" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00A896" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? currency(v) : v} />
                  <Legend />
                  <Area type="monotone" dataKey="ventas"   name="Ventas"   stroke="#2E75B6" fill="url(#colorVentas)"   strokeWidth={2} />
                  <Area type="monotone" dataKey="ganancia" name="Ganancia" stroke="#00A896" fill="url(#colorGanancia)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Fila inferior: Top productos + Métodos de pago */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Top 5 productos */}
            <div className="bg-white rounded-xl border p-5">
              <p className="font-semibold text-slate-700 mb-4">Top 5 productos más vendidos</p>
              {topProductos.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topProductos.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={80}
                      tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                    <Tooltip formatter={(v: any) => typeof v === 'number' ? currency(v) : v} />
                    <Bar dataKey="total" name="Ventas" fill="#1A3C5E" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Métodos de pago */}
            <div className="bg-white rounded-xl border p-5">
              <p className="font-semibold text-slate-700 mb-4">Ventas por método de pago</p>
              {metodosPago.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="60%" height={180}>
                    <PieChart>
                      <Pie data={metodosPago} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                        dataKey="value" nameKey="name">
                        {metodosPago.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => typeof v === 'number' ? currency(v) : v} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {metodosPago.map((m, i) => (
                      <div key={m.name} className="flex items-center gap-2 text-sm">
                        <div className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <div>
                          <p className="font-medium text-slate-700">{m.name}</p>
                          <p className="text-xs text-slate-400">{currency(m.value)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ══ TAB VENTAS ═══════════════════════════════════════════════════ */}
        <TabsContent value="ventas" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">
              {ventasFiltradas.length} venta(s) —
              Total: <span className="font-bold text-slate-800">{currency(kpis.totalVentas)}</span>
            </p>
            <Button variant="outline" size="sm" onClick={exportVentas} disabled={ventasFiltradas.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-center">Ítems</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Ganancia</TableHead>
                  <TableHead className="text-center">Método</TableHead>
                  <TableHead>Vendedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({length:5}).map((_,i) => (
                    <TableRow key={i}>{Array.from({length:7}).map((_,j) =>
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : ventasFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-400">
                      No hay ventas en el período seleccionado.
                    </TableCell>
                  </TableRow>
                ) : ventasFiltradas.map(v => {
                  const fecha = (v.fecha as any)?.toDate?.() ?? new Date(v.fecha);
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="text-sm text-slate-500">
                        {format(fecha, 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{v.clienteNombre}</p>
                        <p className="text-xs text-slate-400">{v.clienteIdentificacion}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">{v.items.length}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold">{currency(v.total)}</TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-semibold ${v.gananciaTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {currency(v.gananciaTotal)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs capitalize">{v.metodoPago}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">{v.usuarioNombre}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {ventasFiltradas.length > 0 && (
              <div className="px-4 py-3 border-t bg-slate-50 flex justify-between text-sm">
                <span className="text-slate-400">{ventasFiltradas.length} ventas</span>
                <div className="flex gap-6">
                  <span className="text-slate-600">Total: <strong>{currency(kpis.totalVentas)}</strong></span>
                  <span className="text-green-600">Ganancia: <strong>{currency(kpis.totalGanancias)}</strong></span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══ TAB INVENTARIO ═══════════════════════════════════════════════ */}
        <TabsContent value="inventario" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Productos activos', value: inventario.length,         color: 'text-slate-700' },
              { label: 'Bajo mínimo',       value: productosBajoMinimo,       color: 'text-red-600' },
              { label: 'Valorización total',value: currency(valorTotalInventario), color: 'text-slate-900' },
              { label: 'Sin stock',         value: inventario.filter(p => p.stockActual === 0).length, color: 'text-orange-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border p-4">
                <p className="text-xs text-slate-400">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {productosBajoMinimo > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span><strong>{productosBajoMinimo} producto(s)</strong> están por debajo del stock mínimo.</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportInventario}>
              <Download className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead className="text-center">Mínimo</TableHead>
                  <TableHead className="text-right">P. Compra</TableHead>
                  <TableHead className="text-right">P. Venta</TableHead>
                  <TableHead className="text-right">Valorización</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({length:5}).map((_,i) => (
                    <TableRow key={i}>{Array.from({length:9}).map((_,j) =>
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : inventario.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-slate-400">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No hay productos registrados.
                    </TableCell>
                  </TableRow>
                ) : inventario.map(p => (
                  <TableRow key={p.id} className={p.bajoMinimo ? 'bg-red-50/40' : ''}>
                    <TableCell className="font-mono text-xs text-slate-500">{p.sku}</TableCell>
                    <TableCell className="font-medium text-sm">{p.nombre}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {p.categoriaNombre || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold text-sm ${p.stockActual === 0 ? 'text-orange-600' : p.bajoMinimo ? 'text-red-600' : 'text-slate-700'}`}>
                        {p.stockActual}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-500">{p.stockMinimo}</TableCell>
                    <TableCell className="text-right text-sm">{currency(p.precioCompra)}</TableCell>
                    <TableCell className="text-right text-sm">{currency(p.precioVenta)}</TableCell>
                    <TableCell className="text-right font-semibold">{currency(p.valorTotal)}</TableCell>
                    <TableCell className="text-center">
                      {p.stockActual === 0
                        ? <Badge variant="destructive" className="text-xs">Sin stock</Badge>
                        : p.bajoMinimo
                        ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Bajo mín.</span>
                        : <Badge variant="default" className="text-xs">OK</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {inventario.length > 0 && (
              <div className="px-4 py-3 border-t bg-slate-50 flex justify-between text-sm">
                <span className="text-slate-400">{inventario.length} productos</span>
                <span className="font-bold text-slate-700">Valor total: {currency(valorTotalInventario)}</span>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══ TAB GANANCIAS ════════════════════════════════════════════════ */}
        <TabsContent value="ganancias" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Ganancia bruta',   value: currency(kpis.totalGanancias), color: 'text-green-600' },
              { label: 'Margen promedio',  value: kpis.totalVentas > 0 ? ((kpis.totalGanancias / kpis.totalVentas) * 100).toFixed(1) + '%' : '0%', color: 'text-blue-600' },
              { label: 'Costo de ventas',  value: currency(kpis.totalVentas - kpis.totalGanancias), color: 'text-slate-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border p-4">
                <p className="text-xs text-slate-400">{label}</p>
                <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Gráfico ganancias por producto */}
          {topProductos.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <p className="font-semibold text-slate-700 mb-4">Ganancia por producto (top 8)</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topProductos.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 10 }}
                    tickFormatter={v => v.length > 10 ? v.slice(0, 10) + '…' : v} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? currency(v) : v} />
                  <Legend />
                  <Bar dataKey="total"    name="Ventas"   fill="#1A3C5E" radius={[4,4,0,0]} />
                  <Bar dataKey="ganancia" name="Ganancia" fill="#00A896" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportGanancias} disabled={topProductos.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Exportar Excel
            </Button>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-center">Cant. vendida</TableHead>
                  <TableHead className="text-right">Total ventas</TableHead>
                  <TableHead className="text-right">Ganancia</TableHead>
                  <TableHead className="text-center">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProductos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                      No hay ventas en el período.
                    </TableCell>
                  </TableRow>
                ) : topProductos.map((p, i) => {
                  const margen = p.total > 0 ? (p.ganancia / p.total) * 100 : 0;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{p.cantidad} uds.</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{currency(p.total)}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${p.ganancia >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {currency(p.ganancia)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          margen >= 30 ? 'bg-green-100 text-green-700' :
                          margen >= 10 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'}`}>
                          {margen.toFixed(1)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}