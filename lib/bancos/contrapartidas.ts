/**
 * Contracuentas de un movimiento bancario: el monto del movimiento se reparte entre una o varias
 * cuentas contables (p. ej. una nota de débito = comisión + IVA, o un depósito que sale de Caja).
 */

export interface LineaContra {
  codigo: string;
  /** Texto del campo de monto (se valida al guardar). */
  monto:  string;
}

export type TipoMovimientoBanco = 'deposito' | 'nota_credito' | 'nota_debito' | 'cheque';

export const TIPOS_MOVIMIENTO_BANCO: { value: TipoMovimientoBanco; label: string; entra: boolean; ayuda: string }[] = [
  { value: 'deposito',     label: 'Depósito',        entra: true,  ayuda: 'Entra dinero al banco: efectivo o cheques depositados.' },
  { value: 'nota_credito', label: 'Nota de crédito', entra: true,  ayuda: 'El banco acredita: intereses, devoluciones, transferencias recibidas.' },
  { value: 'nota_debito',  label: 'Nota de débito',  entra: false, ayuda: 'El banco debita: comisiones, IVA, cargos, impuestos.' },
  { value: 'cheque',       label: 'Cheque / pago',   entra: false, ayuda: 'Sale dinero del banco: cheques girados y pagos.' },
];

const redondear = (n: number) => Math.round(n * 100) / 100;

export interface ResumenContrapartidas {
  suma:      number;
  /** monto − suma: positivo = falta repartir; negativo = sobra. */
  diferencia: number;
  ok:        boolean;
  lineas:    { codigo: string; monto: number }[];
  error?:    string;
}

export function resumirContrapartidas(monto: number, lineas: LineaContra[]): ResumenContrapartidas {
  const validas = lineas
    .map(l => ({ codigo: l.codigo.trim(), monto: redondear(parseFloat(l.monto) || 0) }))
    .filter(l => l.codigo || l.monto > 0);
  const suma = redondear(validas.reduce((s, l) => s + l.monto, 0));
  const diferencia = redondear(monto - suma);

  let error: string | undefined;
  if (monto <= 0) error = 'Ingresa el monto del movimiento';
  else if (validas.length === 0) error = 'Elige al menos una cuenta contable';
  else if (validas.some(l => !l.codigo)) error = 'Hay una línea con monto y sin cuenta';
  else if (validas.some(l => l.monto <= 0)) error = 'Cada cuenta debe tener un monto mayor a 0';
  else if (Math.abs(diferencia) >= 0.005) {
    error = diferencia > 0 ? `Falta repartir $${diferencia.toFixed(2)}` : `Sobran $${Math.abs(diferencia).toFixed(2)}`;
  }
  return { suma, diferencia, ok: !error, lineas: validas, error };
}
