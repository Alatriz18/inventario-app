'use client';

import { useAuth } from '@/context/AuthContext';
import {
  ShoppingCart, Package, AlertTriangle, FileText
} from 'lucide-react';

const stats = [
  { label: 'Ventas hoy',            value: '$0.00',  icon: ShoppingCart, color: 'text-blue-600',   bg: 'bg-blue-50' },
  { label: 'Productos activos',     value: '0',      icon: Package,      color: 'text-green-600',  bg: 'bg-green-50' },
  { label: 'Stock bajo mínimo',     value: '0',      icon: AlertTriangle,color: 'text-amber-600',  bg: 'bg-amber-50' },
  { label: 'Facturas pendientes',   value: '0',      icon: FileText,     color: 'text-purple-600', bg: 'bg-purple-50' },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Bienvenido, {user?.nombre} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Panel principal del sistema de inventario y ventas.
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

      <div className="bg-white rounded-xl border p-6 text-center text-slate-400">
        <p className="text-sm font-medium">Sprint 1 completado ✅</p>
        <p className="text-xs mt-1">Las métricas se llenarán cuando construyamos los módulos.</p>
      </div>
    </div>
  );
}