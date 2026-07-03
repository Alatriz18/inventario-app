'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { tieneAccesoModulo, Modulo } from '@/lib/permisos';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Package, Tags, Truck, PackagePlus, PackageMinus,
  ArrowLeftRight, ShoppingCart, Receipt, Users, FileText, ClipboardList,
  FileCheck, CreditCard, BarChart3, Settings, UserCog, ChevronDown,
  ChevronRight, PackageCheck, Warehouse, BookOpen, Scale, FileSpreadsheet,
  Calculator, TrendingUp, BookMarked, Landmark, FileMinus, FilePlus,
  FileSearch, Coins, X, Building2, Layers, ClipboardCheck,
  DollarSign, ListChecks, Wallet,
} from 'lucide-react';

interface NavItem {
  label:     string;
  href?:     string;
  icon:      React.ElementType;
  modulo?:   Modulo;
  children?: NavItem[];
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, modulo: 'dashboard' },
  {
    label: 'Inventario', icon: Package,
    children: [
      { label: 'Productos',   href: '/productos',          icon: Package,        modulo: 'productos' },
      { label: 'Categorías',  href: '/categorias',         icon: Tags,           modulo: 'categorias' },
      { label: 'Bodegas',     href: '/bodegas',            icon: Warehouse,      modulo: 'bodegas' },
      { label: 'Proveedores', href: '/proveedores',        icon: Truck,          modulo: 'proveedores' },
      { label: 'Entradas',    href: '/entradas',           icon: PackagePlus,    modulo: 'entradas' },
      { label: 'Despachos',   href: '/despachos',          icon: PackageMinus,   modulo: 'despachos' },
      { label: 'Movimientos', href: '/movimientos',        icon: ArrowLeftRight, modulo: 'movimientos' },
      { label: 'Kardex',      href: '/inventario/kardex',  icon: ListChecks,     modulo: 'kardex' },
    ],
  },
  {
    label: 'Ventas', icon: ShoppingCart,
    children: [
      { label: 'Punto de Venta',  href: '/ventas/pos',       icon: ShoppingCart, modulo: 'pos' },
      { label: 'Historial',       href: '/ventas/historial', icon: Receipt,      modulo: 'historial_ventas' },
      { label: 'Recibos Internos',href: '/ventas/recibo',    icon: FileText,     modulo: 'recibos' },
      { label: 'Clientes',        href: '/clientes',         icon: Users,        modulo: 'clientes' },
    ],
  },
  {
    label: 'Facturación SRI', icon: FileText,
    children: [
      { label: 'Emitir Comprobante', href: '/facturacion/emitir',        icon: FileText,      modulo: 'facturacion_emitir' },
      { label: 'Comprobantes',       href: '/facturacion/comprobantes',  icon: ClipboardList,  modulo: 'facturacion_comprobantes' },
      { label: 'Notas de Crédito',   href: '/facturacion/notas-credito', icon: FileMinus,      modulo: 'notas_credito' },
      { label: 'Notas de Débito',    href: '/facturacion/notas-debito',  icon: FilePlus,       modulo: 'notas_debito' },
      { label: 'Configuración SRI',  href: '/facturacion/configuracion', icon: Settings,       modulo: 'config_sri' },
    ],
  },
  {
    label: 'Cuentas por Cobrar', icon: DollarSign,
    children: [
      { label: 'Saldos y Cobros',    href: '/cuentas-por-cobrar',         icon: DollarSign, modulo: 'cxc' },
      { label: 'Cartera (Facturas)', href: '/cuentas-por-cobrar/cartera', icon: Wallet,     modulo: 'cxc_cartera' },
    ],
  },
  {
    label: 'Cuentas por Pagar', icon: CreditCard,
    children: [
      { label: 'Facturas Proveedores', href: '/cuentas-por-pagar/facturas',             icon: FileCheck,  modulo: 'cxp_facturas' },
      { label: 'Documentos Recibidos', href: '/cuentas-por-pagar/documentos-recibidos', icon: FileCheck,  modulo: 'cxp_documentos' },
      { label: 'Pagos Pendientes',     href: '/cuentas-por-pagar/pagos',                icon: CreditCard, modulo: 'cxp_pagos' },
    ],
  },
  {
    label: 'Contabilidad', icon: BookOpen,
    children: [
      { label: 'Plan de Cuentas',      href: '/contabilidad/plan-cuentas',      icon: BookMarked,     modulo: 'plan_cuentas' },
      { label: 'Centros de Costo',     href: '/contabilidad/centros-costo',     icon: Landmark,       modulo: 'centros_costo' },
      { label: 'Config. Contable',     href: '/contabilidad/configuracion',     icon: Settings,       modulo: 'config_contable' },
      { label: 'Asientos Contables',   href: '/contabilidad/asientos',          icon: BookOpen,       modulo: 'asientos' },
      { label: 'Libro Diario',         href: '/contabilidad/libro-diario',      icon: FileSpreadsheet,modulo: 'libro_diario' },
      { label: 'Libro Mayor',          href: '/contabilidad/libro-mayor',       icon: Scale,          modulo: 'libro_mayor' },
      { label: 'Balance Comprobación', href: '/contabilidad/balance-comp',      icon: Calculator,     modulo: 'balance_comp' },
      { label: 'Balance General',      href: '/contabilidad/balance-general',   icon: TrendingUp,     modulo: 'balance_general' },
      { label: 'Estado Resultados',    href: '/contabilidad/estado-resultados', icon: BarChart3,      modulo: 'estado_resultados' },
      { label: 'Períodos Contables',   href: '/contabilidad/periodos',          icon: Receipt,        modulo: 'periodos' },
    ],
  },
  {
    label: 'Tributario', icon: Calculator,
    children: [
      { label: 'Retenciones (config)', href: '/tributario/retenciones',            icon: FileMinus,      modulo: 'retenciones_config' },
      { label: 'Ret. Emitidas',        href: '/tributario/retenciones-emitidas',  icon: ClipboardCheck, modulo: 'ret_emitidas' },
      { label: 'Ret. Recibidas',       href: '/tributario/retenciones-recibidas', icon: FileCheck,      modulo: 'ret_recibidas' },
      { label: 'ICE',                  href: '/tributario/ice',                   icon: Coins,          modulo: 'ice' },
      { label: 'ATS (DIMM)',           href: '/tributario/ats',                   icon: FileSearch,     modulo: 'ats' },
      { label: 'Form. 104 – IVA',      href: '/tributario/form-104',              icon: FileSpreadsheet,modulo: 'form_104' },
      { label: 'Form. 103 – Ret.',     href: '/tributario/form-103',              icon: FileSpreadsheet,modulo: 'form_103' },
      { label: 'Form. 105 – ICE',      href: '/tributario/form-105',              icon: FileSpreadsheet,modulo: 'form_105' },
      { label: 'Form. RIMPE',          href: '/tributario/form-rimpe',            icon: FileSpreadsheet,modulo: 'form_rimpe' },
      { label: 'Form. 101 – IR Anual', href: '/tributario/form-101',              icon: FileSpreadsheet,modulo: 'form_101' },
    ],
  },
  { label: 'Activos Fijos',         href: '/activos-fijos',         icon: Layers,   modulo: 'activos_fijos' },
  { label: 'Conciliación Bancaria', href: '/conciliacion-bancaria', icon: Building2,modulo: 'conciliacion_bancaria' },
  { label: 'Reportes',              href: '/reportes',              icon: BarChart3,modulo: 'reportes' },
  { label: 'Usuarios',     href: '/usuarios',     icon: UserCog, modulo: 'usuarios' },
  { label: 'Configuración',href: '/configuracion',icon: Settings,modulo: 'configuracion' },
];

function NavItemComponent({
  item, depth = 0, onNavigate,
}: {
  item: NavItem; depth?: number; onNavigate: () => void;
}) {
  const pathname   = usePathname();
  const { user }   = useAuth();
  const [open, setOpen] = useState(() => {
    if (!item.children) return false;
    return item.children.some(c => c.href && pathname.startsWith(c.href));
  });

  if (!user) return null;
  if (item.modulo && !tieneAccesoModulo(user.rol, item.modulo)) return null;

  const Icon = item.icon;

  if (item.children) {
    const visibleChildren = item.children.filter(
      c => !c.modulo || tieneAccesoModulo(user.rol, c.modulo)
    );
    if (visibleChildren.length === 0) return null;

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