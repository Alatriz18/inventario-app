/**
 * Generador de archivos ZIP sin dependencias (método "store", sin compresión).
 * Suficiente para empaquetar varios XML de texto en un único .zip descargable.
 */

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n: number) =>
  new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

export function crearZip(files: { name: string; content: string }[]): Blob {
  const enc = new TextEncoder();
  const localParts:   Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data      = enc.encode(f.content);
    const crc       = crc32(data);

    const lfh = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0),
      nameBytes,
    ]);
    localParts.push(lfh, data);

    const cdh = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(cdh);

    offset += lfh.length + data.length;
  }

  const central     = concat(centralParts);
  const localData    = concat(localParts);
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(central.length), u32(localData.length),
    u16(0),
  ]);

  return new Blob([localData as BlobPart, central as BlobPart, eocd as BlobPart], { type: 'application/zip' });
}

/** Descarga un ZIP con los archivos dados. */
export function descargarZip(files: { name: string; content: string }[], nombre: string): void {
  const blob = crearZip(files);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
}
