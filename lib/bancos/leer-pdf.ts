import type { ItemTexto } from './estado-cuenta-pichincha';

/**
 * Extrae el texto posicionado de un PDF en el navegador (pdf.js, sin subirlo a ningún servidor).
 * El worker se sirve desde /public/pdf.worker.min.mjs (lo copia scripts/copiar-pdf-worker.mjs
 * en cada npm install, para que siempre sea de la misma versión que pdfjs-dist).
 */
export async function extraerTextoPDF(archivo: ArrayBuffer): Promise<ItemTexto[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const doc = await pdfjs.getDocument({ data: new Uint8Array(archivo) }).promise;
  const items: ItemTexto[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const contenido = await pagina.getTextContent();
    for (const it of contenido.items) {
      if ('str' in it) items.push({ str: it.str, x: it.transform[4], y: it.transform[5], pagina: n });
    }
  }
  await doc.destroy();
  return items;
}
