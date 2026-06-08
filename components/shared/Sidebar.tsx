'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Package, Tags, Truck, PackagePlus, PackageMinus,
  ArrowLeftRight, ShoppingCart, Receipt, Users, FileText, ClipboardList,
  FileCheck, CreditCard, BarChart3, Settings, UserCog, ChevronDown,
  ChevronRight, PackageCheck, Warehouse, BookOpen, Scale, FileSpreadsheet,
  Calculator, TrendingUp, BookMarked, Landmark, FileMinus, FilePlus,
  FileSearch, Coins, ReceiptText, X, Building2, Layers, ClipboardCheck,
  DollarSign, ListChecks,
} from 'lucide-react';

interface NavItem {
  label:     string;
  href?:     string;
  icon:      React.ElementType;
  roles?:    string[];
  children?: NavItem[];
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  {
    label: 'Inventario', icon: Package,
    children: [
      { label: 'Productos',   href: '/productos',           icon: Package },
      { label: 'Categorías',  href: '/categorias',          icon: Tags },
      { label: 'Bodegas',     href: '/bodegas',             icon: Warehouse },
      { label: 'Proveedores', href: '/proveedores',         icon: Truck },
      { label: 'Entradas',    href: '/entradas',            icon: PackagePlus },
      { label: 'Despachos',   href: '/despachos',           icon: PackageMinus },
      { label: 'Movimientos', href: '/movimientos',         icon: ArrowLeftRight },
      { label: 'Kardex',      href: '/inventario/kardex',  icon: ListChecks },
    ],
  },
  {
    label: 'Ventas', icon: ShoppingCart,
    children: [
      { label: 'Punto de Venta', href: '/ventas/pos',       icon: ShoppingCart },
      { label: 'Historial',      href: '/ventas/historial', icon: Receipt },
      { label: 'Recibos Internos', href: '/ventas/recibo',  icon: FileText },
      { label: 'Clientes',       href: '/clientes',         icon: Users },
    ],
  },
  {
    label: 'Facturación SRI', icon: FileText,
    children: [
      { label: 'Emitir Comprobante', href: '/facturacion/emitir',         icon: FileText },
      { label: 'Comprobantes',       href: '/facturacion/comprobantes',   icon: ClipboardList },
      { label: 'Notas de Crédito',   href: '/facturacion/notas-credito',  icon: FileMinus },
      { label: 'Notas de Débito',    href: '/facturacion/notas-debito',   icon: FilePlus },
      { label: 'Configuración SRI',  href: '/facturacion/configuracion',  icon: Settings, roles: ['admin'] },
    ],
  },
  {
    label: 'Cuentas por Cobrar', icon: DollarSign,
    children: [
      { label: 'Saldos y Cobros', href: '/cuentas-por-cobrar', icon: DollarSign },
    ],
  },
  {
    label: 'Cuentas por Pagar', icon: CreditCard,
    children: [
      { label: 'Facturas Proveedores', href: '/cuentas-por-pagar/facturas', icon: FileCheck },
      { label: 'Pagos Pendientes',     href: '/cuentas-por-pagar/pagos',    icon: CreditCard },
    ],
  },
  {
    label: 'Contabilidad', icon: BookOpen,
    children: [
      { label: 'Plan de Cuentas',      href: '/contabilidad/plan-cuentas',     icon: BookMarked },
      { label: 'Centros de Costo',     href: '/contabilidad/centros-costo',    icon: Landmark },
      { label: 'Config. Contable',     href: '/contabilidad/configuracion',    icon: Settings, roles: ['admin','contador'] },
      { label: 'Asientos Contables',   href: '/contabilidad/asientos',         icon: BookOpen },
      { label: 'Libro Diario',         href: '/contabilidad/libro-diario',     icon: FileSpreadsheet },
      { label: 'Libro Mayor',          href: '/contabilidad/libro-mayor',      icon: Scale },
      { label: 'Balance Comprobación', href: '/contabilidad/balance-comp',     icon: Calculator },
      { label: 'Balance General',      href: '/contabilidad/balance-general',  icon: TrendingUp },
      { label: 'Estado Resultados',    href: '/contabilidad/estado-resultados',icon: BarChart3 },
      { label: 'Períodos Contables',   href: '/contabilidad/periodos',         icon: Receipt, roles: ['admin','contador'] },
    ],
  },
  {
    label: 'Tributario', icon: ReceiptText,
    children: [
      { label: 'Retenciones (config)', href: '/tributario/retenciones',           icon: FileMinus },
      { label: 'Ret. Emitidas',        href: '/tributario/retenciones-emitidas', icon: ClipboardCheck },
      { label: 'Ret. Recibidas',       href: '/tributario/retenciones-recibidas',icon: FileCheck },
      { label: 'ICE',                  href: '/tributario/ice',                  icon: Coins },
      { label: 'ATS (DIMM)',           href: '/tributario/ats',                  icon: FileSearch },
      { label: 'Form. 104 – IVA',      href: '/tributario/form-104',             icon: FileSpreadsheet },
      { label: 'Form. 103 – Ret.',     href: '/tributario/form-103',             icon: FileSpreadsheet },
      { label: 'Form. 105 – ICE',      href: '/tributario/form-105',             icon: FileSpreadsheet },
      { label: 'Form. RIMPE',          href: '/tributario/form-rimpe',           icon: FileSpreadsheet },
      { label: 'Form. 101 – IR Anual', href: '/tributario/form-101',             icon: FileSpreadsheet, roles: ['admin','contador'] },
    ],
  },
  { label: 'Activos Fijos',         href: '/activos-fijos',          icon: Layers },
  { label: 'Conciliación Bancaria', href: '/conciliacion-bancaria',  icon: Building2 },
  { label: 'Reportes',              href: '/reportes',               icon: BarChart3 },
  { label: 'Usuarios',     href: '/usuarios',     icon: UserCog,  roles: ['admin'] },
  { label: 'Configuración',href: '/configuracion',icon: Settings, roles: ['admin'] },
];

function NavItemComponent({
  item, depth = 0, onNavigate,
}: {
  item: NavItem; depth?: number; onNavigate: () => void;
}) {
  const pathname    = usePathname();
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(() => {
    if (!item.children) return false;
    return item.children.some(c => c.href && pathname.startsWith(c.href));
  });

  if (item.roles && !hasRole(item.roles as any)) return null;

  const Icon = item.icon;

  if (item.children) {
    const anyActive = item.children.some(
      c => c.href && (c.href === '/' ? pathname === '/' : pathname.startsWith(c.href))
    );
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            'text-slate-300 hover:text-white hover:bg-slate-700/60',
            (open || anyActive) && 'text-white'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {open
            ? <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
        </button>
        {open && (
          <div className="ml-4 mt-0.5 border-l border-slate-700 pl-3 space-y-0.5">
            {item.children.map(child => (
              <NavItemComponent key={child.label} item={child} depth={depth + 1} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = item.href === '/'
    ? pathname === '/'
    : pathname.startsWith(item.href!);

  return (
    <Link
      href={item.href!}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        isActive
          ? 'bg-slate-700 text-white'
          : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

interface SidebarProps {
  onClose: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  return (
    <aside className="w-64 h-full bg-slate-900 flex flex-col">

      {/* Logo + botón cerrar en móvil */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-slate-700/60 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-slate-700 p-1.5 rounded-lg">
            <PackageCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">InventaPro</p>
            <p className="text-slate-400 text-[10px] mt-0.5">Inventario & Ventas</p>
          </div>
        </div>
        {/* Botón cerrar — solo visible en móvil */}
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(item => (
          <NavItemComponent key={item.label} item={item} onNavigate={onClose} />
        ))}
      </nav>

      {/* Version */}
      <div className="px-4 py-3 border-t border-slate-700/60 shrink-0">
        <p className="text-slate-500 text-[10px]">v2.0.0 — Sistema Completo</p>
      </div>
    </aside>
  );
}