/**
 * Generador de archivos de pago a proveedores (Cash Management) para los
 * principales bancos del Ecuador. Produce un archivo de texto plano con una
 * línea por beneficiario, listo para cargar en la banca electrónica.
 *
 * NOTA: cada banco tiene su propio layout exacto (separador, orden y formato de
 * campos). Aquí se implementan estructuras delimitadas con los campos comunes;
 * verifica el formato puntual con tu banco y ajusta si es necesario.
 */

export type BancoPago = 'pichincha' | 'internacional' | 'pacifico' | 'produbanco' | 'bolivariano' | 'generico';

export interface PagoBancario {
  identificacion:      string;                      // RUC / cédula del beneficiario
  tipoIdentificacion:  'R' | 'C' | 'P';             // RUC / Cédula / Pasaporte
  nombre:              string;
  bancoCodigo:         string;                      // código IFI del banco destino
  tipoCuenta:          'corriente' | 'ahorros';
  numeroCuenta:        string;
  valor:               number;
  referencia?:         string;
  email?:              string;
}

export const BANCOS_PAGO: { value: BancoPago; label: string }[] = [
  { value: 'pichincha',     label: 'Banco Pichincha' },
  { value: 'internacional', label: 'Banco Internacional' },
  { value: 'pacifico',      label: 'Banco del Pacífico' },
  { value: 'produbanco',    label: 'Produbanco' },
  { value: 'bolivariano',   label: 'Banco Bolivariano' },
  { value: 'generico',      label: 'Genérico (CSV)' },
];

const SEP: Record<BancoPago, string> = {
  pichincha: ';', internacional: '\t', pacifico: ',',
  produbanco: ';', bolivariano: ';', generico: ';',
};

const TIPO_CUENTA_COD: Record<BancoPago, { corriente: string; ahorros: string }> = {
  pichincha:     { corriente: 'CTE', ahorros: 'AHO' },
  internacional: { corriente: 'CTE', ahorros: 'AHO' },
  pacifico:      { corriente: 'CTE', ahorros: 'AHO' },
  produbanco:    { corriente: 'COR', ahorros: 'AHO' },
  bolivariano:   { corriente: 'CTE', ahorros: 'AHO' },
  generico:      { corriente: 'CORRIENTE', ahorros: 'AHORROS' },
};

/** Limpia un campo de texto del separador y caracteres de salto de línea. */
function limpiar(s: string, sep: string): string {
  return (s ?? '').replace(/[\r\n]/g, ' ').split(sep).join(' ').trim();
}

export function generarTxtPagos(banco: BancoPago, pagos: PagoBancario[]): string {
  const sep   = SEP[banco];
  const cuent = TIPO_CUENTA_COD[banco];

  const lineas = pagos.map(p => {
    const cols = [
      p.tipoIdentificacion,
      p.identificacion,
      limpiar(p.nombre, sep),
      p.bancoCodigo,
      p.tipoCuenta === 'corriente' ? cuent.corriente : cuent.ahorros,
      p.numeroCuenta,
      p.valor.toFixed(2),
      limpiar(p.email ?? '', sep),
      limpiar(p.referencia ?? '', sep),
    ];
    return cols.join(sep);
  });

  // El formato genérico incluye encabezado de columnas
  if (banco === 'generico') {
    const header = ['TipoID','Identificacion','Nombre','BancoDestino','TipoCuenta','NumeroCuenta','Valor','Email','Referencia'].join(sep);
    return [header, ...lineas].join('\r\n');
  }
  return lineas.join('\r\n');
}

/** Total de un lote de pagos. */
export function totalPagos(pagos: PagoBancario[]): number {
  return pagos.reduce((s, p) => s + p.valor, 0);
}

/** Descarga el archivo TXT de pagos. */
export function descargarTxtPagos(banco: BancoPago, pagos: PagoBancario[], nombre?: string): void {
  const contenido = generarTxtPagos(banco, pagos);
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = nombre ?? `pagos_${banco}_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
