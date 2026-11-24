'use client';

import { useEffect, useMemo, useState } from 'react';
import { CuentaContable } from '@/types';
import { subscribeToCuentas } from '@/lib/firebase/plan-cuentas';
import { PLAN_CUENTAS_ECUADOR } from '@/lib/data/plan-cuentas-ecuador';
import { armarOpcionesCuentas } from '@/lib/bancos/opciones-cuentas';
import type { OpcionCuenta } from '@/components/shared/CuentaCombobox';

/**
 * Cuentas contables donde se puede contabilizar un movimiento (las del plan que aceptan movimientos
 * + las del catálogo de la Supercias que aún no se cargaron), listas para el selector con búsqueda.
 * Cada opción muestra su grupo (cuenta padre) y se encuentra también por palabras como «gastos bancarios».
 */
export function useOpcionesCuentasMovimiento(): OpcionCuenta[] {
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  useEffect(() => subscribeToCuentas(setCuentas), []);

  return useMemo(() => armarOpcionesCuentas(cuentas, PLAN_CUENTAS_ECUADOR), [cuentas]);
}
