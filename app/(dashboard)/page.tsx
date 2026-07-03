'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { format, subDays, startOfDay, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/context/AuthContext';
import {
  ShoppingCart, Package, AlertTriangle, DollarSign,
  TrendingUp, TrendingDown, ArrowRight,
  PackagePlus, FileText, Users, ReceiptText,
} from 'lucide-react';

import { subscribeToProductos } from '@/lib/firebase/productos';
import { subscribeToVentas }    from '@/lib/firebase/ventas';
import { subscribeToCxC }       from '@/lib/firebase/cuentas-cobrar';
import { Producto, Venta, CuentaCobrar } from '@/types';
import { tieneAccesoModulo, Modulo } from '@/lib/permisos';

const toDate  = (v: any): Date => v?.toDate?.() ?? new Date(v);
const currency = (v: number) => `$${(v ?? 0).toFixed(2)}`;

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
  credito: 'Crédito', deposito: 'Depósito', cheque: 'Cheque',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [ventas,    setVentas]    = useState<Venta[]>([]);
  const [cxc,       setCxc]       = useState<CuentaCobrar[]>([]);

  const verFinanzas = user ? tieneAccesoModulo(user.rol, 'historial_ventas') : false;
  const verCxC      = user ? tieneAccesoModulo(user.rol, 'cxc') : false;

  useEffect(() => {
    const u1 = subscribeToProductos(setProductos);
    const u2 = verFinanzas ? subscribeToVentas(setVentas) : () => {};
    const u3 = verCxC      ? subscribeToCxC(setCxc)       : () => {};
    return () => { u1(); u2(); u3(); };
  }, [verFinanzas, verCxC]);

  const data = useMemo(() => {
    const ahora    = new Date();
    const hoyStart = startOfDay(ahora);
    const ayerStart= startOfDay(subDays(ahora, 1));
    const mesStart = startOfMonth(ahora);

    const completadas = ventas.filter(v => v.estado === 'completada');

    const ventasHoy  = completadas.filter(v => toDate(v.fecha) >= hoyStart);
    const ventasAyer = completadas.filter(v => {
      const f = toDate(v.fecha);
      return f >= ayerStart && f < hoyStart;
    });
    const totalHoy  = ventasHoy.reduce((s, v) => s + v.total, 0);
    const totalAyer = ventasAyer.reduce((s, v) => s + v.total, 0);
    const totalMes  = completadas
      .filter(v => toDate(v.fecha) >= mesStart)
      .reduce((s, v) => s + v.total, 0);

    const semana = Array.from({ length: 7 }, (_, i) => {
      const desde = startOfDay(subDays(ahora, 6 - i));
      const hasta = startOfDay(subDays(ahora, 5 - i));
      const total = completadas
        .filter(v => { const f = toDate(v.fecha); return f >= desde && f < hasta; })
        .reduce((s, v) => s + v.total, 0);
      return { label: format(desde, 'EEE', { locale: es }), total, isToday: i === 6 };
    });
    const maxSemana = Math.max(...semana.map(d => d.total), 1);

    const ultimasVentas = [...completadas]
      .sort((a, b) => toDate(b.fecha).getTime() - toDate(a.fecha).getTime())
      .slice(0, 5);

    const stockBajo = productos.filter(p => p.activo && p.stockActual <= p.stockMinimo);
    const activos   = productos.filter(p => p.activo).length;

    const porCobrar = cxc
      .filter(c => c.estado !== 'pagada')
      .reduce((s, c) => s + (c.saldoPendiente ?? 0), 0);

    const diffPct = totalAyer > 0 ? ((totalHoy - totalAyer) / totalAyer) * 100 : null;

    return { totalHoy, totalAyer, totalMes, ventasHoyCount: ventasHoy.length,
             semana, maxSemana, ultimasVentas, stockBajo, activos, porCobrar, diffPct };
  }, [productos, ventas, cxc]);

  const hora    = new Date().getHours();
  const saludo  = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre  = user?.nombre?.split(' ')[0] ?? '';
  const fechaHoy = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  const accesoRapido: { href: string; icon: React.ElementType; label: string; modulo: Modulo }[] = [
    { href: '/ventas/pos',            icon: ShoppingCart, label: 'Punto de Venta',   modulo: 'pos' },
    { href: '/entradas',              icon: PackagePlus,  label: 'Nueva Entrada',    modulo: 'entradas' },
    { href: '/facturacion/emitir',    icon: FileText,     label: 'Emitir Factura',   modulo: 'facturacion_emitir' },
    { href: '/cuentas-por-cobrar',    icon: DollarSign,   label: 'Cuentas por Cobrar', modulo: 'cxc' },
    { href: '/clientes',              icon: Users,        label: 'Clientes',         modulo: 'clientes' },
    { href: '/cuentas-por-pagar/pagos', icon: ReceiptText, label: 'Pagos pendientes', modulo: 'cxp_pagos' },
  ].filter(a => user && tieneAccesoModulo(user.rol, a.modulo));

  return (
    <div className="space-y-5">

      {/* ── Cabecera ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            {saludo}, {nombre} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-0.5 capitalize">{fechaHoy}</p>
        </div>
        {user && tieneAccesoModulo(user.rol, 'pos') && (
          <Link href="/ventas/pos"
            className="inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-colors self-start sm:self-auto shrink-0">
            <ShoppingCart className="h-4 w-4" />
            Ir al POS
          </Link>
        )}
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">

        {/* Ventas hoy */}
        {verFinanzas && (
          <div className="bg-white border rounded-xl p-4 col-span-2 sm:col-span-1">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-slate-500">Ventas hoy</p>
              <div className="bg-blue-50 p-2 rounded-lg">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{currency(data.totalHoy)}</p>
            <div className="flex items-center gap-1 mt-1">
              {data.diffPct !== null ? (
                <>
                  {data.diffPct >= 0
                    ? <TrendingUp  className="h-3 w-3 text-green-500" />
                    : <TrendingDown className="h-3 w-3 text-red-500" />}
                  <span className={`text-xs font-semibold ${data.diffPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {Math.abs(data.diffPct).toFixed(0)}%
                  </span>
                  <span className="text-xs text-slate-400">vs ayer</span>
                </>
              ) : (
                <span className="text-xs text-slate-400">{data.ventasHoyCount} venta(s)</span>
              )}
            </div>
          </div>
        )}

        {/* Ingresos del mes */}
        {verFinanzas && (
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-slate-500">Mes actual</p>
              <div className="bg-green-50 p-2 rounded-lg">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{currency(data.totalMes)}</p>
            <p className="text-xs text-slate-400 mt-1 capitalize">
              {format(new Date(), 'MMMM yyyy', { locale: es })}
            </p>
          </div>
        )}

        {/* Productos activos */}
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-slate-500">Productos</p>
            <div className="bg-slate-50 p-2 rounded-lg">
              <Package className="h-4 w-4 text-slate-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{data.activos}</p>
          <p className="text-xs text-slate-400 mt-1">activos en catálogo</p>
        </div>

        {/* Stock bajo / Por cobrar */}
        {verCxC ? (
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-slate-500">Por cobrar</p>
              <div className="bg-purple-50 p-2 rounded-lg">
                <DollarSign className="h-4 w-4 text-purple-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{currency(data.porCobrar)}</p>
            <p className="text-xs text-slate-400 mt-1">saldo pendiente CxC</p>
          </div>
        ) : (
          <div className={`border rounded-xl p-4 ${data.stockBajo.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium text-slate-500">Stock bajo</p>
              <div className="bg-amber-100 p-2 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{data.stockBajo.length}</p>
            <p className="text-xs text-slate-400 mt-1">productos bajo mínimo</p>
          </div>
        )}
      </div>

      {/* ── Cuerpo principal ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Gráfico 7 días */}
        {verFinanzas && (
          <div className="lg:col-span-2 bg-white border rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-semibold text-slate-800 text-sm">Ventas últimos 7 días</h2>
                <p className="text-xs text-slate-400 mt-0.5">Ingresos diarios</p>
              </div>
              <Link href="/ventas/historial"
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 font-medium">
                Historial <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Barras */}
            <div className="flex items-end gap-1.5 sm:gap-2.5 h-36">
              {data.semana.map((d, i) => {
                const pctH = data.maxSemana > 0
                  ? Math.max(4, (d.total / data.maxSemana) * 100)
                  : 4;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium h-4 flex items-end">
                      {d.total > 0 ? `$${d.total >= 1000 ? (d.total/1000).toFixed(1)+'k' : d.total.toFixed(0)}` : ''}
                    </span>
                    <div className="w-full flex items-end rounded-t-md overflow-hidden" style={{ height: '90px' }}>
                      <div
                        className={`w-full rounded-t-md transition-all duration-500 ${
                          d.isToday ? 'bg-slate-900' : 'bg-slate-200 hover:bg-slate-300'
                        }`}
                        style={{ height: `${pctH}%` }}
                      />
                    </div>
                    <span className={`text-[9px] sm:text-[10px] font-semibold capitalize ${
                      d.isToday ? 'text-slate-900' : 'text-slate-400'
                    }`}>
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Panel lateral: accesos + alertas */}
        <div className={`space-y-4 ${!verFinanzas ? 'lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 space-y-0' : ''}`}>

          {/* Accesos rápidos */}
          {accesoRapido.length > 0 && (
            <div className="bg-white border rounded-xl p-4">
              <h2 className="font-semibold text-slate-800 text-sm mb-3">Accesos rápidos</h2>
              <div className="space-y-1">
                {accesoRapido.slice(0, 5).map(({ href, icon: Icon, label }) => (
                  <Link key={href} href={href}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 transition-colors group">
                    <div className="bg-slate-100 p-1.5 rounded-md shrink-0 group-hover:bg-slate-200 transition-colors">
                      <Icon className="h-3.5 w-3.5 text-slate-600" />
                    </div>
                    <span className="text-sm text-slate-700 font-medium">{label}</span>
                    <ArrowRight className="h-3 w-3 text-slate-300 ml-auto group-hover:text-slate-500 transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Alertas stock bajo */}
          {data.stockBajo.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <h3 className="font-semibold text-amber-800 text-sm">
                  Stock bajo ({data.stockBajo.length})
                </h3>
              </div>
              <div className="space-y-2">
                {data.stockBajo.slice(0, 5).map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-amber-900 font-medium truncate">{p.nombre}</span>
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                      {p.stockActual} uds
                    </span>
                  </div>
                ))}
                {data.stockBajo.length > 5 && (
                  <Link href="/productos" className="text-xs text-amber-700 underline block pt-1">
                    +{data.stockBajo.length - 5} productos más
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Últimas ventas ── */}
      {verFinanzas && data.ultimasVentas.length > 0 && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b bg-slate-50">
            <h2 className="font-semibold text-slate-800 text-sm">Ventas recientes</h2>
            <Link href="/ventas/historial"
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 font-medium">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y">
            {data.ultimasVentas.map(v => {
              const fecha = toDate(v.fecha);
              return (
                <div key={v.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="bg-slate-100 p-2 rounded-lg shrink-0">
                    <ShoppingCart className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{v.clienteNombre}</p>
                    <p className="text-xs text-slate-400">
                      {format(fecha, 'dd/MM/yyyy HH:mm')}
                      {' · '}
                      {METODO_LABEL[v.metodoPago] ?? v.metodoPago}
                      {' · '}
                      {v.items.length} ítem(s)
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900">{currency(v.total)}</p>
                    <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-medium">
                      completada
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
