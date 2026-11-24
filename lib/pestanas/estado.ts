/**
 * Lógica de las pestañas del sistema (pura, sin React): qué pestañas hay abiertas, cuáles están fijadas,
 * cómo se abren, se cierran y se guardan. Las fijadas van siempre primero y no se cierran por accidente.
 */

export interface Pestana {
  /** Identifica la pestaña: la ruta (más ?mantenimiento si lo trae). */
  clave:   string;
  ruta:    string;
  titulo:  string;
  fijada:  boolean;
}

/** Cuántas pestañas se conservan abiertas en computador y en celular (en el celular el espacio y la memoria son pocos). */
export const MAX_PESTANAS_ESCRITORIO = 12;
export const MAX_PESTANAS_MOVIL = 3;

/**
 * La clave de una pestaña es su ruta. Los demás parámetros (p. ej. ?ventaId=…) no abren pestañas nuevas:
 * cambian lo que muestra la misma pestaña. La excepción es ?mantenimiento, que sí separa la pestaña porque
 * su valor solo se lee al abrir la pantalla.
 */
export function claveDeRuta(pathname: string, search: string): string {
  const mant = new URLSearchParams(search).get('mantenimiento');
  return mant !== null ? `${pathname}?mantenimiento=${mant}` : pathname;
}

/** Las fijadas primero, respetando el orden dentro de cada grupo. */
function ordenar(lista: Pestana[]): Pestana[] {
  return [...lista.filter(p => p.fijada), ...lista.filter(p => !p.fijada)];
}

/**
 * Agrega la pestaña si no existe (al final de las no fijadas). Si se pasa del máximo cierra las más
 * antiguas que no estén fijadas ni sean la activa o la nueva.
 */
export function abrirPestana(lista: Pestana[], nueva: Omit<Pestana, 'fijada'>, activa: string, max: number): Pestana[] {
  if (lista.some(p => p.clave === nueva.clave)) return lista;
  let resultado = ordenar([...lista, { ...nueva, fijada: false }]);
  while (resultado.length > max) {
    const i = resultado.findIndex(p => !p.fijada && p.clave !== activa && p.clave !== nueva.clave);
    if (i < 0) break; // todo lo demás está fijado: no se cierra nada
    resultado = resultado.filter((_, j) => j !== i);
  }
  return resultado;
}

/**
 * Cierra una pestaña. Las fijadas no se cierran. Si se cierra la activa, `destino` es la vecina
 * (la que queda en su lugar o, si era la última, la anterior).
 */
export function cerrarPestana(lista: Pestana[], clave: string, activa: string): { lista: Pestana[]; destino?: Pestana } {
  const i = lista.findIndex(p => p.clave === clave);
  if (i < 0 || lista[i].fijada) return { lista };
  const resto = lista.filter((_, j) => j !== i);
  if (clave !== activa) return { lista: resto };
  return { lista: resto, destino: resto[i] ?? resto[i - 1] };
}

/** Fija o suelta una pestaña; las fijadas se agrupan a la izquierda. */
export function alternarFijada(lista: Pestana[], clave: string): Pestana[] {
  return ordenar(lista.map(p => (p.clave === clave ? { ...p, fijada: !p.fijada } : p)));
}

/** Deja las fijadas y la pestaña indicada. */
export function cerrarOtras(lista: Pestana[], clave: string): Pestana[] {
  return lista.filter(p => p.fijada || p.clave === clave);
}

/** Cierra todas las no fijadas. Si la activa se cierra, `destino` es la última fijada (si hay). */
export function cerrarNoFijadas(lista: Pestana[], activa: string): { lista: Pestana[]; destino?: Pestana } {
  const resto = lista.filter(p => p.fijada);
  const activaSigue = resto.some(p => p.clave === activa);
  return { lista: resto, destino: activaSigue ? undefined : resto[resto.length - 1] };
}

// ── Guardado (se conservan las pestañas abiertas al recargar la página) ─────────────────────────────

export function serializar(lista: Pestana[]): string {
  return JSON.stringify(lista.map(({ clave, ruta, titulo, fijada }) => ({ clave, ruta, titulo, fijada })));
}

/** Lee lo guardado descartando lo que no tenga la forma esperada y lo repetido. */
export function deserializar(json: string | null | undefined): Pestana[] {
  if (!json) return [];
  let datos: unknown;
  try { datos = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(datos)) return [];
  const vistos = new Set<string>();
  const lista: Pestana[] = [];
  for (const d of datos) {
    if (!d || typeof d !== 'object') continue;
    const { clave, ruta, titulo, fijada } = d as Record<string, unknown>;
    if (typeof clave !== 'string' || typeof ruta !== 'string' || typeof titulo !== 'string' || !ruta.startsWith('/')) continue;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lista.push({ clave, ruta, titulo, fijada: fijada === true });
  }
  return ordenar(lista);
}
