export function generarClaveAcceso(params: {
  fecha:           Date;
  tipoComprobante: string;
  ruc:             string;
  ambiente:        '1' | '2';
  establecimiento: string;
  puntoEmision:    string;
  secuencial:      number;
  codigoNumerico?: string;
}): string {
  const { fecha, tipoComprobante, ruc, ambiente, establecimiento, puntoEmision, secuencial } = params;

  const dd   = String(fecha.getDate()).padStart(2, '0');
  const MM   = String(fecha.getMonth() + 1).padStart(2, '0');
  const aaaa = String(fecha.getFullYear());

  const fechaStr    = `${dd}${MM}${aaaa}`;
  const serie       = establecimiento.padStart(3, '0') + puntoEmision.padStart(3, '0');
  const secStr      = String(secuencial).padStart(9, '0');
  const codNumerico = params.codigoNumerico
    ?? String(Math.floor(Math.random() * 99999999)).padStart(8, '0');

  // base = 48 caracteres
  const base = `${fechaStr}${tipoComprobante}${ruc}${ambiente}${serie}${secStr}${codNumerico}1`;
  const dv   = modulo11(base);

  return `${base}${dv}`;
}

export function modulo11(clave: string): number {
  const pesos   = [2, 3, 4, 5, 6, 7];
  let suma      = 0;
  let pesoIdx   = 0;

  for (let i = clave.length - 1; i >= 0; i--) {
    suma   += parseInt(clave[i]) * pesos[pesoIdx % 6];
    pesoIdx++;
  }

  const residuo   = suma % 11;
  const resultado = 11 - residuo;
  if (resultado === 11) return 0;
  if (resultado === 10) return 1;
  return resultado;
}