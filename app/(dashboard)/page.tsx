'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  ShoppingCart, Package, AlertTriangle, DollarSign,
} from 'lucide-react';

import { subscribeToProductos } from '@/lib/firebase/productos';
import { subscribeToVentas }    from '@/lib/firebase/ventas';
import { subscribeToCxC }       from '@/lib/firebase/cuentas-cobrar';
import { Producto, Venta, CuentaCobrar } from '@/types';

const toDate = (v: any): Date => v?.toDate?.() ?? new Date(v);
const currency = (v: number) => `$${(v ?? 0).toFixed(2)}`;

export default function DashboardPage() {
  const { user } = useAuth();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [ventas,    setVentas]    = useState<Venta[]>([]);
  const [cxc,       setCxc]       = useState<CuentaCobrar[]>([]);

  useEffect(() => {
    const u1 = subscribeToProductos(setProductos);
    const u2 = subscribeToVentas(setVentas);
    const u3 = subscribeToCxC(setCxc);
    return () => { u1(); u2(); u3(); };
  }, []);

  const stats = useMemo(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const ventasHoy = ventas
      .filter(v => v.estado === 'completada' && toDate(v.fecha) >= hoy)
      .reduce((s, v) => s + v.total, 0);
    const activos   = productos.filter(p => p.activo).length;
    const stockBajo = productos.filter(p => p.stockActual <= p.stockMinimo).length;
    const porCobrar = cxc
      .filter(c => c.estado !== 'pagada')
      .reduce((s, c) => s + (c.saldoPendiente ?? 0), 0);

    return [
      { label: 'Ventas hoy',        value: currency(ventasHoy), icon: ShoppingCart, color: 'text-blue-600',   bg: 'bg-blue-50' },
      { label: 'Productos activos', value: String(activos),     icon: Package,      color: 'text-green-600',  bg: 'bg-green-50' },
      { label: 'Stock bajo mínimo', value: String(stockBajo),   icon: AlertTriangle,color: 'text-amber-600',  bg: 'bg-amber-50' },
      { label: 'Por cobrar',        value: currency(porCobrar), icon: DollarSign,   color: 'text-purple-600', bg: 'bg-purple-50' },
    ];
  }, [productos, ventas, cxc]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Bienvenido, {user?.nombre} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Panel principal del sistema de inventario, ventas y contabilidad.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border p-5 flex items-center gap-4">
            <div className={`${bg} p-3 rounded-lg`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-xl font-bold text-slate-700 mt-0.5">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
