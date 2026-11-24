// Copia el worker de pdf.js a /public para que siempre sea de la misma versión que pdfjs-dist.
// Se ejecuta solo en cada `npm install` (script postinstall).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(raiz, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
const destino = join(raiz, 'public', 'pdf.worker.min.mjs');

if (existsSync(origen)) {
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(origen, destino);
  console.log('pdf.worker.min.mjs copiado a /public');
}
