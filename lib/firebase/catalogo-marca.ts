/**
 * Marca de sincronización de un catálogo (productos, clientes) guardada en el navegador: hasta qué
 * `updatedAt` ya se tiene todo y cuántos documentos había. Sin dependencias de Firebase para poder
 * probarla sola.
 */

export interface MarcaCatalogo {
  v:     1;
  /** Día (local) de la última carga completa. Un día nuevo vuelve a cargar todo una vez. */
  dia:   string;
  /** Mayor `updatedAt` (ms, hora del servidor) ya recibido. */
  hasta: number;
  /** Cuántos documentos tenía el catálogo. */
  n:     number;
}

/** Se piden los cambios desde un poco antes de la marca, por si dos cambios llegaron casi juntos. */
export const MARGEN_DELTA_MS = 5 * 60 * 1000;

export function diaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function leerMarca(json: string | null | undefined): MarcaCatalogo | null {
  if (!json) return null;
  try {
    const m = JSON.parse(json) as Partial<MarcaCatalogo>;
    if (m?.v !== 1 || typeof m.dia !== 'string' || typeof m.hasta !== 'number' || typeof m.n !== 'number') return null;
    return m as MarcaCatalogo;
  } catch {
    return null;
  }
}

/**
 * ¿Se puede arrancar desde lo guardado en el navegador y pedir solo los cambios? Solo si la carga
 * completa fue hoy y la caché tiene al menos los documentos que había (si el navegador borró parte
 * de su caché, se vuelve a cargar todo).
 */
export function puedeUsarCache(marca: MarcaCatalogo | null, hoy: string, enCache: number): boolean {
  return !!marca && marca.dia === hoy && enCache > 0 && enCache >= marca.n;
}

/** Desde qué momento pedir cambios. */
export function desdeDelta(marca: MarcaCatalogo): number {
  return Math.max(0, marca.hasta - MARGEN_DELTA_MS);
}

/** El mayor de los `updatedAt` (ms); ignora los que aún no tienen hora del servidor. */
export function mayorFecha(valores: Array<number | null | undefined>, previo = 0): number {
  return valores.reduce<number>((m, v) => (typeof v === 'number' && v > m ? v : m), previo);
}
