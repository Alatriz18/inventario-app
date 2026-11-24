/**
 * Arma las opciones del selector de contracuentas: cada cuenta con el grupo al que pertenece
 * (para distinguir las tres «COMISIONES» del plan) y palabras clave de búsqueda, de modo que
 * escribir «gastos bancarios» encuentre las cuentas de gastos financieros.
 */

export interface CuentaBase {
  codigo:             string;
  nombre:             string;
  tipo:               string;
  aceptaMovimientos:  boolean;
  activa?:            boolean;
}

export interface OpcionCuentaMovimiento {
  value:     string;
  label:     string;   // "520302 – COMISIONES"
  grupo:     string;   // tipo de cuenta: Gasto, Activo…
  contexto?: string;   // cuenta padre: "GASTOS FINANCIEROS"
  keywords:  string[];
}

/** Sinónimos de uso común para encontrar cuentas por cómo las llama la gente, no por el nombre oficial. */
const SINONIMOS_POR_PREFIJO: { prefijo: string; palabras: string[] }[] = [
  { prefijo: '5203', palabras: ['gastos bancarios', 'cargos bancarios', 'comisiones bancarias', 'bancario', 'banco', 'financieros'] },
  { prefijo: '4302', palabras: ['intereses ganados', 'interes bancario', 'bancario', 'banco'] },
  { prefijo: '1010101', palabras: ['caja general', 'efectivo'] },
  { prefijo: '1010102', palabras: ['bancos', 'banco'] },
];

/** Cuenta padre más cercana: se van quitando dígitos de dos en dos hasta dar con una cuenta del plan. */
function buscarPadre(codigo: string, porCodigo: Map<string, CuentaBase>): CuentaBase | undefined {
  for (let n = codigo.length - 2; n >= 1; n -= 2) {
    const p = porCodigo.get(codigo.slice(0, n));
    if (p) return p;
  }
  return undefined;
}

export function armarOpcionesCuentas(plan: CuentaBase[], catalogo: CuentaBase[]): OpcionCuentaMovimiento[] {
  // Las del plan de la empresa mandan; del catálogo se agregan las que aún no se cargaron
  const activas = plan.filter(c => c.activa !== false);
  const delPlan = new Map(activas.map(c => [c.codigo, c]));
  const todas = new Map<string, CuentaBase>(delPlan);
  for (const c of catalogo) if (!todas.has(c.codigo) && !plan.some(p => p.codigo === c.codigo)) todas.set(c.codigo, c);

  const resultado: OpcionCuentaMovimiento[] = [];
  for (const c of todas.values()) {
    if (!c.aceptaMovimientos) continue;

    const ancestros: CuentaBase[] = [];
    let actual: CuentaBase | undefined = buscarPadre(c.codigo, todas);
    while (actual) { ancestros.push(actual); actual = buscarPadre(actual.codigo, todas); }

    const sinonimos = SINONIMOS_POR_PREFIJO.filter(s => c.codigo.startsWith(s.prefijo)).flatMap(s => s.palabras);
    resultado.push({
      value: c.codigo,
      label: `${c.codigo} – ${c.nombre}`,
      grupo: c.tipo.charAt(0).toUpperCase() + c.tipo.slice(1),
      contexto: ancestros[0]?.nombre,
      keywords: [...ancestros.map(a => a.nombre), ...sinonimos].map(k => k.toLowerCase()),
    });
  }
  return resultado.sort((a, b) => a.value.localeCompare(b.value));
}
