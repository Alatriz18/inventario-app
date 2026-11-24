import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { REGISTRO_PAGINAS } from '@/lib/pestanas/registro';

function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? paginas(r) : n === 'page.tsx' ? [r] : [];
  });
}

describe('registro de pantallas para pestañas', () => {
  it('incluye todas las pantallas de app/(dashboard) (si falla: npm run pestanas:registro)', () => {
    const base = join(process.cwd(), 'app', '(dashboard)');
    const rutas = paginas(base).map(p => {
      const rel = relative(base, join(p, '..')).split(sep).join('/');
      return rel === '' ? '/' : `/${rel}`;
    }).sort();
    expect(Object.keys(REGISTRO_PAGINAS).sort()).toEqual(rutas);
  });
});
