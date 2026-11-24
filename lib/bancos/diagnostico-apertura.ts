/**
 * Diagnóstico del saldo inicial del banco: explica por qué el saldo de apertura puede estar descuadrando la
 * conciliación (apertura duplicada, o con un monto distinto al saldo con que el banco abrió).
 */

export interface AvisoApertura { nivel: 'error' | 'info'; texto: string }

export interface AsientoApertura { numero: string; montoBanco: number; visto: boolean }

const d2 = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Saldo con el que abrió el banco: el «saldo anterior» del estado de cuenta del PRIMER mes con movimientos.
 * Si falta el estado de cuenta de ese mes devuelve null: el saldo anterior de un corte posterior es el cierre
 * del mes anterior, no la apertura.
 */
export function aperturaDelBanco(
  extractos: { periodo: string; saldoAnterior: number }[],
  primerPeriodo: string | undefined
): number | null {
  if (!primerPeriodo) return null;
  const e = extractos.find(x => x.periodo === primerPeriodo);
  return e ? e.saldoAnterior : null;
}

export function diagnosticarApertura(p: {
  /** Saldo con el que el banco abrió, del primer estado de cuenta guardado (null si no hay). */
  aperturaBanco:    number | null;
  /** Monto del «saldo inicial del banco» registrado desde la conciliación, si existe. */
  registrado?:      number;
  /** Asientos de apertura que tocan la cuenta del banco. */
  asientosApertura: AsientoApertura[];
}): AvisoApertura[] {
  const avisos: AvisoApertura[] = [];
  const { aperturaBanco, registrado, asientosApertura } = p;

  if (asientosApertura.length > 0 && registrado !== undefined) {
    avisos.push({
      nivel: 'error',
      texto: `El saldo inicial está dos veces: el asiento de apertura ${asientosApertura.map(a => `${a.numero} (${d2(a.montoBanco)})`).join(', ')} ` +
        `y el «saldo inicial del banco» registrado (${d2(registrado)}). Deja uno solo: anula el registrado en Movimientos Bancarios (botón Anular) ` +
        'y deja el asiento de apertura con el valor correcto.',
    });
  }

  for (const a of asientosApertura) {
    if (aperturaBanco !== null && Math.abs(a.montoBanco - aperturaBanco) >= 0.005) {
      avisos.push({
        nivel: 'error',
        texto: `El asiento de apertura ${a.numero} deja el banco en ${d2(a.montoBanco)}, pero el banco abrió con ${d2(aperturaBanco)} ` +
          `(diferencia ${d2(a.montoBanco - aperturaBanco)}). Corrige la línea del banco de ese asiento en Contabilidad → Asientos.`,
      });
    } else if (!a.visto) {
      avisos.push({
        nivel: 'info',
        texto: `Ponle el visto al asiento de apertura ${a.numero} en «Libros del banco»: ya está reflejado en el saldo del banco.`,
      });
    }
  }

  if (asientosApertura.length === 0 && registrado !== undefined && aperturaBanco !== null
      && Math.abs(registrado - aperturaBanco) >= 0.005) {
    avisos.push({
      nivel: 'error',
      texto: `El saldo inicial registrado (${d2(registrado)}) no coincide con el del banco (${d2(aperturaBanco)}): diferencia ${d2(registrado - aperturaBanco)}. ` +
        'Anúlalo en Movimientos Bancarios y regístralo de nuevo con el valor correcto.',
    });
  }
  return avisos;
}
