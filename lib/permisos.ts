/**
 * Configuración central de permisos por rol.
 *
 * Define qué módulos y acciones puede realizar cada rol.
 * El Sidebar y el guard de páginas consultan este archivo.
 */

import { UserRole } from '@/types';

// ── Módulos del sistema ─────────────────────────────────────────────────

export type Modulo =
  | 'dashboard'
  | 'productos'       | 'categorias'     | 'bodegas'
  | 'proveedores'     | 'entradas'       | 'despachos'
  | 'movimientos'     | 'kardex'
  | 'pos'             | 'historial_ventas' | 'recibos'   | 'clientes'
  | 'facturacion_emitir' | 'facturacion_comprobantes'
  | 'notas_credito'   | 'notas_debito'
  | 'config_sri'
  | 'cxc'             | 'cxc_cartera'
  | 'cxp_facturas'    | 'cxp_documentos' | 'cxp_pagos'
  | 'plan_cuentas'    | 'centros_costo'  | 'config_contable'
  | 'asientos'        | 'libro_diario'   | 'libro_mayor'
  | 'balance_comp'    | 'balance_general'| 'estado_resultados'
  | 'periodos'
  | 'retenciones_config' | 'ret_emitidas' | 'ret_recibidas'
  | 'ice'             | 'ats'            | 'form_104'   | 'form_103'
  | 'form_105'        | 'form_rimpe'     | 'form_101'
  | 'activos_fijos'   | 'conciliacion_bancaria'
  | 'reportes'
  | 'usuarios'        | 'configuracion';

// ── Acciones especiales ─────────────────────────────────────────────────

export type Accion =
  | 'editar_precios'
  | 'editar_productos'
  | 'ver_costos'
  | 'ver_ganancias'
  | 'anular_ventas'
  | 'editar_asientos'
  | 'cerrar_periodos';

// ── Permisos por rol ────────────────────────────────────────────────────

const PERMISOS_MODULO: Record<UserRole, Modulo[]> = {
  admin: [
    'dashboard',
    'productos', 'categorias', 'bodegas', 'proveedores',
    'entradas', 'despachos', 'movimientos', 'kardex',
    'pos', 'historial_ventas', 'recibos', 'clientes',
    'facturacion_emitir', 'facturacion_comprobantes',
    'notas_credito', 'notas_debito', 'config_sri',
    'cxc', 'cxc_cartera',
    'cxp_facturas', 'cxp_documentos', 'cxp_pagos',
    'plan_cuentas', 'centros_costo', 'config_contable',
    'asientos', 'libro_diario', 'libro_mayor',
    'balance_comp', 'balance_general', 'estado_resultados',
    'periodos',
    'retenciones_config', 'ret_emitidas', 'ret_recibidas',
    'ice', 'ats', 'form_104', 'form_103', 'form_105', 'form_rimpe', 'form_101',
    'activos_fijos', 'conciliacion_bancaria',
    'reportes',
    'usuarios', 'configuracion',
  ],

  vendedor: [
    'dashboard',
    'productos',
    'pos', 'historial_ventas', 'recibos', 'clientes',
    'facturacion_emitir', 'facturacion_comprobantes',
    'cxc', 'cxc_cartera',
  ],

  bodeguero: [
    'dashboard',
    'productos', 'categorias', 'bodegas',
    'proveedores', 'entradas', 'despachos', 'movimientos', 'kardex',
  ],

  contador: [
    'dashboard',
    'productos',
    'historial_ventas',
    'facturacion_comprobantes',
    'cxc', 'cxc_cartera',
    'cxp_facturas', 'cxp_documentos', 'cxp_pagos',
    'plan_cuentas', 'centros_costo', 'config_contable',
    'asientos', 'libro_diario', 'libro_mayor',
    'balance_comp', 'balance_general', 'estado_resultados',
    'periodos',
    'retenciones_config', 'ret_emitidas', 'ret_recibidas',
    'ice', 'ats', 'form_104', 'form_103', 'form_105', 'form_rimpe', 'form_101',
    'activos_fijos', 'conciliacion_bancaria',
    'reportes',
  ],

  finanzas: [
    'dashboard',
    // Inventario completo
    'productos', 'categorias', 'bodegas',
    'proveedores', 'entradas', 'despachos', 'movimientos', 'kardex',
    // Cuentas por pagar (facturas proveedores + pagos)
    'cxp_facturas', 'cxp_documentos', 'cxp_pagos',
    // Cuentas por cobrar (ver saldos y cobros)
    'cxc', 'cxc_cartera',
    // Clientes (necesario para gestión de cobranzas)
    'clientes',
    // Historial de ventas (solo lectura)
    'historial_ventas',
  ],
};

const PERMISOS_ACCION: Record<UserRole, Accion[]> = {
  admin: [
    'editar_precios', 'editar_productos', 'ver_costos', 'ver_ganancias',
    'anular_ventas', 'editar_asientos', 'cerrar_periodos',
  ],
  vendedor: [
    'anular_ventas', 'editar_precios',
  ],
  bodeguero: [
    'editar_productos', 'ver_costos',
  ],
  contador: [
    'ver_costos', 'ver_ganancias', 'editar_asientos', 'cerrar_periodos',
  ],
  finanzas: [
    'ver_costos', 'editar_productos',
  ],
};

// ── API pública ─────────────────────────────────────────────────────────

export function tieneAccesoModulo(rol: UserRole, modulo: Modulo): boolean {
  return PERMISOS_MODULO[rol]?.includes(modulo) ?? false;
}

export function tieneAccesoAccion(rol: UserRole, accion: Accion): boolean {
  return PERMISOS_ACCION[rol]?.includes(accion) ?? false;
}

export function getModulosPermitidos(rol: UserRole): Modulo[] {
  return PERMISOS_MODULO[rol] ?? [];
}

export function getAccionesPermitidas(rol: UserRole): Accion[] {
  return PERMISOS_ACCION[rol] ?? [];
}

// ── Mapeo ruta → módulo ─────────────────────────────────────────────────

const RUTA_MODULO: Record<string, Modulo> = {
  '/':                                    'dashboard',
  '/productos':                           'productos',
  '/categorias':                          'categorias',
  '/bodegas':                             'bodegas',
  '/proveedores':                         'proveedores',
  '/entradas':                            'entradas',
  '/despachos':                           'despachos',
  '/movimientos':                         'movimientos',
  '/inventario/kardex':                   'kardex',
  '/ventas/pos':                          'pos',
  '/ventas/historial':                    'historial_ventas',
  '/ventas/recibo':                       'recibos',
  '/clientes':                            'clientes',
  '/facturacion/emitir':                  'facturacion_emitir',
  '/facturacion/comprobantes':            'facturacion_comprobantes',
  '/facturacion/notas-credito':           'notas_credito',
  '/facturacion/notas-debito':            'notas_debito',
  '/facturacion/configuracion':           'config_sri',
  '/cuentas-por-cobrar':                  'cxc',
  '/cuentas-por-cobrar/cartera':          'cxc_cartera',
  '/cuentas-por-pagar/facturas':          'cxp_facturas',
  '/cuentas-por-pagar/documentos-recibidos': 'cxp_documentos',
  '/cuentas-por-pagar/pagos':             'cxp_pagos',
  '/contabilidad/plan-cuentas':           'plan_cuentas',
  '/contabilidad/centros-costo':          'centros_costo',
  '/contabilidad/configuracion':          'config_contable',
  '/contabilidad/asientos':               'asientos',
  '/contabilidad/libro-diario':           'libro_diario',
  '/contabilidad/libro-mayor':            'libro_mayor',
  '/contabilidad/balance-comp':           'balance_comp',
  '/contabilidad/balance-general':        'balance_general',
  '/contabilidad/estado-resultados':      'estado_resultados',
  '/contabilidad/periodos':               'periodos',
  '/tributario/retenciones':              'retenciones_config',
  '/tributario/retenciones-emitidas':     'ret_emitidas',
  '/tributario/retenciones-recibidas':    'ret_recibidas',
  '/tributario/ice':                      'ice',
  '/tributario/ats':                      'ats',
  '/tributario/form-104':                 'form_104',
  '/tributario/form-103':                 'form_103',
  '/tributario/form-105':                 'form_105',
  '/tributario/form-rimpe':               'form_rimpe',
  '/tributario/form-101':                 'form_101',
  '/activos-fijos':                       'activos_fijos',
  '/conciliacion-bancaria':               'conciliacion_bancaria',
  '/reportes':                            'reportes',
  '/usuarios':                            'usuarios',
  '/configuracion':                       'configuracion',
};

export function getModuloDeRuta(pathname: string): Modulo | null {
  if (RUTA_MODULO[pathname]) return RUTA_MODULO[pathname];
  const match = Object.keys(RUTA_MODULO)
    .filter(r => r !== '/' && pathname.startsWith(r))
    .sort((a, b) => b.length - a.length)[0];
  return match ? RUTA_MODULO[match] : null;
}

export function tieneAccesoRuta(rol: UserRole, pathname: string): boolean {
  const modulo = getModuloDeRuta(pathname);
  if (!modulo) return true;
  return tieneAccesoModulo(rol, modulo);
}

// ── Descripciones para la UI ────────────────────────────────────────────

export const DESCRIPCION_ROLES: Record<UserRole, string> = {
  admin:     'Acceso total al sistema',
  vendedor:  'POS, ventas, clientes, facturación y cobranzas',
  bodeguero: 'Inventario, productos, entradas y despachos',
  contador:  'Contabilidad, tributario, reportes y cuentas por pagar/cobrar',
  finanzas:  'Inventario completo, pagos a proveedores y cuentas por cobrar',
};
