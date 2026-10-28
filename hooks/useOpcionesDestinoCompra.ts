'use client';

import { useEffect, useMemo, useState } from 'react';
import { CuentaContable } from '@/types';
import { subscribeToCuentas } from '@/lib/firebase/plan-cuentas';
import { PLAN_CUENTAS_ECUADOR } from '@/lib/data/plan-cuentas-ecuador';
import type { OpcionCuenta } from '@/components/shared/CuentaCombobox';

/**
 * Opciones para elegir a dónde va una compra: según el proveedor, inventario o una
 * cuenta de gasto (las del plan + las del catálogo de la Supercias aún no cargadas).
 */
export function useOpcionesDestinoCompra(): OpcionCuenta[] {
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  useEffect(() => subscribeToCuentas(setCuentas), []);

  return useMemo(() => {
    const esGasto = (c: { tipo: string; aceptaMovimientos: boolean; codigo: string }) =>
      (c.tipo === 'gasto' || c.tipo === 'costo') && c.aceptaMovimientos && !c.codigo.includes('.');
    const delPlan   = cuentas.filter(c => esGasto(c) && c.activa !== false);
    const faltantes = PLAN_CUENTAS_ECUADOR.filter(c => esGasto(c) && !cuentas.some(p => p.codigo === c.codigo));
    return [
      { value: 'auto',       label: 'Según el proveedor',       grupo: 'Destino' },
      { value: 'inventario', label: 'Inventario (mercadería)',   grupo: 'Destino' },
      ...[...delPlan, ...faltantes]
        .sort((a, b) => a.codigo.localeCompare(b.codigo))
        .map(c => ({ value: c.codigo, label: `${c.codigo} – ${c.nombre}`, grupo: 'Cuenta de gasto' })),
    ];
  }, [cuentas]);
}
