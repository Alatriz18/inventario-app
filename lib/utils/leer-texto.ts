/**
 * Lee un archivo de texto detectando su codificación. Los reportes TXT del
 * SRI a veces vienen en Windows-1252/ISO-8859-1 en vez de UTF-8 — leerlos
 * como UTF-8 directo convierte tildes/ñ en el carácter de reemplazo (�),
 * lo que rompe comparaciones de texto como "Nota de Crédito" y hace que
 * filas enteras se salten en silencio. Se decodifica primero como UTF-8 y,
 * si aparece el carácter de reemplazo, se reintenta como Windows-1252.
 */
export function leerTextoDetectandoCodificacion(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer;
      if (!buf) { resolve(''); return; }
      const utf8 = new TextDecoder('utf-8').decode(buf);
      if (utf8.includes('�')) {
        try {
          resolve(new TextDecoder('windows-1252').decode(buf));
          return;
        } catch { /* si falla, se usa el resultado UTF-8 igual */ }
      }
      resolve(utf8);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
