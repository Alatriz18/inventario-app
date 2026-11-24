'use client';

import { useEffect, useMemo, useState } from 'react';
import { CuentaContable } from '@/types';
import { subscribeToCuentas } from '@/lib/firebase/plan-cuentas';
import { PLAN_CUENTAS_ECUADOR } from '@/lib/data/plan-cuentas-ecuador';
import type { OpcionCuenta } from '@/components/shared/CuentaCombobox';

/**
 * Cuentas contables donde se puede contabilizar un movimiento (las del plan que aceptan movimientos
 * + las del catálogo de la Supercias que aún no se cargaron), listas para el selector con búsqueda.
 */
export function useOpcionesCuentasMovimiento(): OpcionCuenta[] {
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  useEffect(() => subscribeToCuentas(setCuentas), []);

  return useMemo(() => {
    const ok = (c: { aceptaMovimientos: boolean; codigo: string }) => c.aceptaMovimientos && !c.codigo.includes('.');
    const delPlan   = cuentas.filter(c => ok(c) && c.activa !== false);
    const faltantes = PLAN_CUENTAS_ECUADOR.filter(c => ok(c) && !cuentas.some(p => p.codigo === c.codigo));
    return [...delPlan, ...faltantes]
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map(c => ({
        value: c.codigo,
        label: `${c.codigo} – ${c.nombre}`,
        grupo: c.tipo.charAt(0).toUpperCase() + c.tipo.slice(1),
      }));
  }, [cuentas]);
}
