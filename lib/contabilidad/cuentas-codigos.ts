import type { AsientoContable, AsientoLinea } from '@/types';

/**
 * Códigos de cuenta (sin repetir, ordenados) que usan las líneas de un asiento. Se guardan en el
 * asiento como `cuentasCodigos` para poder pedirle a Firestore solo los asientos de una cuenta
 * (p. ej. la del banco) en vez de leer todos.
 */
export function codigosDeLineas(lineas: AsientoLinea[] | undefined): string[] {
  return [...new Set((lineas ?? []).map(l => l.cuentaCodigo).filter((c): c is string => !!c))].sort();
}

/** ¿El asiento tiene guardados exactamente los códigos de sus líneas? */
export function codigosAlDia(a: Pick<AsientoContable, 'lineas' | 'cuentasCodigos'>): boolean {
  const esperado = codigosDeLineas(a.lineas);
  const actual = a.cuentasCodigos ?? [];
  return actual.length === esperado.length && actual.every((c, i) => c === esperado[i]);
}

/** ¿Alguna línea del asiento usa alguna de estas cuentas? */
export function tocaCuentas(a: Pick<AsientoContable, 'lineas'>, codigos: string[]): boolean {
  const s = new Set(codigos);
  return a.lineas.some(l => s.has(l.cuentaCodigo));
}

/**
 * Une listas de asientos sin repetir (la que viene después reemplaza a la anterior: es más
 * reciente) y los deja ordenados por fecha, del más nuevo al más antiguo.
 */
export function unirAsientos(...listas: AsientoContable[][]): AsientoContable[] {
  const porId = new Map<string, AsientoContable>();
  for (const l of listas) for (const a of l) porId.set(a.id, a);
  return [...porId.values()].sort((x, y) => y.fecha.getTime() - x.fecha.getTime());
}
