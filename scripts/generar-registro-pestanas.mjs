// Genera lib/pestanas/registro.ts: la lista de pantallas del sistema que pueden quedar abiertas en pestañas.
// Se ejecuta con `npm run pestanas:registro` cada vez que se agrega o quita una pantalla de app/(dashboard).
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(raiz, 'app', '(dashboard)');

function paginas(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...paginas(ruta));
    else if (nombre === 'page.tsx') salida.push(ruta);
  }
  return salida;
}

const filas = paginas(base)
  .map(archivo => {
    const rel = relative(base, dirname(archivo)).split(sep).join('/');
    return { ruta: rel === '' ? '/' : `/${rel}`, modulo: rel === '' ? '@/app/(dashboard)/page' : `@/app/(dashboard)/${rel}/page` };
  })
  .sort((a, b) => a.ruta.localeCompare(b.ruta));

const cuerpo = filas.map(f => `  '${f.ruta}': dynamic(() => import('${f.modulo}')),`).join('\n');

writeFileSync(join(raiz, 'lib', 'pestanas', 'registro.ts'),
`/* GENERADO por scripts/generar-registro-pestanas.mjs: no editar a mano (npm run pestanas:registro). */
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

/** Pantallas del sistema que se pueden mantener abiertas en pestañas (se cargan la primera vez que se abren). */
export const REGISTRO_PAGINAS: Record<string, ComponentType> = {
${cuerpo}
};
`);
console.log(`${filas.length} pantallas registradas`);
