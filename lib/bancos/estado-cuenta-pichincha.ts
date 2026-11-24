/**
 * Interpreta el PDF de "Estado de cuenta" del Banco Pichincha a partir del texto
 * posicionado que entrega pdf.js (cada fragmento con su x, y y página).
 *
 * El PDF puede traer varios cortes mensuales juntos (e incluso repetidos): cada
 * corte se lee por separado, se verifica contra el bloque CONCILIACIÓN del propio
 * banco (créditos, débitos y saldos) y los cortes repetidos se descartan.
 */

export interface ItemTexto { str: string; x: number; y: number; pagina: number }

export interface MovimientoPDF {
  fecha:       Date;
  oficina:     string;
  documento:   string;
  descripcion: string;
  debito:      number;
  credito:     number;
  saldo:       number;
  /** false si el saldo no coincide con el saldo anterior ± el movimiento */
  saldoOk:     boolean;
}

export interface CorteEstadoCuenta {
  corte:         Date;
  saldoAnterior: number | null;
  saldoActual:   number | null;
  creditos:      { n: number; total: number } | null;
  debitos:       { n: number; total: number } | null;
  movimientos:   MovimientoPDF[];
  /** El mismo corte ya apareció antes en el archivo: se ignora. */
  repetido:      boolean;
  /** Lo leído coincide con los totales que declara el banco. */
  cuadra:        boolean;
  avisos:        string[];
}

export interface ResultadoEstadoCuenta {
  /** Número de cuenta que figura en el encabezado del PDF. */
  numeroCuenta?: string;
  cortes:      CorteEstadoCuenta[];
  /** Movimientos de los cortes no repetidos, en el orden del archivo. */
  movimientos: MovimientoPDF[];
}

const MESES: Record<string, number> = {
  ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11,
};

const RE_DINERO = /^-?\d+\.\d{2}$/;
const RE_FECHA_MOV = /^(\d{1,2})-([A-Za-zñÑ]{3})\.?$/;
const RE_FECHA_CORTE = /FECHA ESTE CORTE\s+(\d{2})-(\d{2})-(\d{4})/;
const redondear = (n: number) => Math.round(n * 100) / 100;

interface Linea { pagina: number; y: number; tokens: { s: string; x: number }[]; texto: string }

/** Agrupa los fragmentos en renglones (misma página y misma altura) ordenados de arriba a abajo. */
function armarLineas(items: ItemTexto[]): Linea[] {
  const porPagina = new Map<number, ItemTexto[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const arr = porPagina.get(it.pagina) ?? [];
    arr.push(it);
    porPagina.set(it.pagina, arr);
  }
  const lineas: Linea[] = [];
  for (const pagina of [...porPagina.keys()].sort((a, b) => a - b)) {
    const arr = porPagina.get(pagina)!.sort((a, b) => b.y - a.y || a.x - b.x);
    let actual: Linea | null = null;
    for (const it of arr) {
      if (!actual || Math.abs(actual.y - it.y) > 1.5) {
        actual = { pagina, y: it.y, tokens: [], texto: '' };
        lineas.push(actual);
      }
      actual.tokens.push({ s: it.str.trim(), x: it.x });
    }
  }
  for (const l of lineas) {
    l.tokens.sort((a, b) => a.x - b.x);
    l.texto = l.tokens.map(t => t.s).join(' ');
  }
  return lineas;
}

export function interpretarEstadoCuentaPichincha(items: ItemTexto[]): ResultadoEstadoCuenta {
  const lineas = armarLineas(items);
  const cortes: CorteEstadoCuenta[] = [];
  let corte: CorteEstadoCuenta | null = null;
  let ultimo: { mov: MovimientoPDF; pagina: number; y: number; xDoc: number } | null = null;

  let numeroCuenta: string | undefined;

  for (const l of lineas) {
    if (!numeroCuenta) {
      const mc = /^CUENTA:?\s+(\d{6,})/.exec(l.texto);
      if (mc) numeroCuenta = mc[1];
    }
    const mCorte = RE_FECHA_CORTE.exec(l.texto);
    if (mCorte) {
      corte = {
        corte: new Date(Number(mCorte[3]), Number(mCorte[2]) - 1, Number(mCorte[1]), 12),
        saldoAnterior: null, saldoActual: null, creditos: null, debitos: null,
        movimientos: [], repetido: false, cuadra: false, avisos: [],
      };
      cortes.push(corte);
      ultimo = null;
      continue;
    }
    if (!corte) continue;

    // Bloque CONCILIACIÓN del banco
    let m = /SALDO ANTERIOR\s+(-?\d+\.\d{2})/.exec(l.texto);
    if (m) { corte.saldoAnterior = Number(m[1]); continue; }
    m = /DEP[ÓO]SITO \/ CR[ÉE]DITOS\s*\((\d+)\)\s*(\d+\.\d{2})/.exec(l.texto);
    if (m) { corte.creditos = { n: Number(m[1]), total: Number(m[2]) }; continue; }
    m = /CHEQUES \/ D[ÉE]BITOS\s*\((\d+)\)\s*(\d+\.\d{2})/.exec(l.texto);
    if (m) { corte.debitos = { n: Number(m[1]), total: Number(m[2]) }; continue; }
    m = /SALDO ACTUAL\s+(-?\d+\.\d{2})/.exec(l.texto);
    if (m) { corte.saldoActual = Number(m[1]); continue; }

    // Renglón de movimiento: FECHA OFIC. N.DOC. DESCRIPCIÓN DÉBITO CRÉDITO SALDO
    const t = l.tokens.map(x => x.s);
    const mf = t.length > 0 ? RE_FECHA_MOV.exec(t[0]) : null;
    if (mf && MESES[mf[2].toLowerCase()] !== undefined) {
      const montos = t.slice(-3);
      if (t.length < 6 || !/^\d+$/.test(t[1]) || !/^\d+$/.test(t[2]) || !montos.every(x => RE_DINERO.test(x))) {
        corte.avisos.push(`No se pudo leer el renglón: ${l.texto}`);
        ultimo = null;
        continue;
      }
      const mes = MESES[mf[2].toLowerCase()];
      const anio = mes > corte.corte.getMonth() ? corte.corte.getFullYear() - 1 : corte.corte.getFullYear();
      const mov: MovimientoPDF = {
        fecha: new Date(anio, mes, Number(mf[1]), 12),
        oficina: t[1], documento: t[2],
        descripcion: t.slice(3, -3).join(' '),
        debito: Number(montos[0]), credito: Number(montos[1]), saldo: Number(montos[2]),
        saldoOk: true,
      };
      corte.movimientos.push(mov);
      ultimo = { mov, pagina: l.pagina, y: l.y, xDoc: l.tokens[2].x };
      continue;
    }

    // Segundo renglón del N.DOC. (los números largos se parten en dos líneas)
    if (ultimo && t.length === 1 && /^\d+$/.test(t[0]) && l.pagina === ultimo.pagina
        && ultimo.y - l.y < 14 && Math.abs(l.tokens[0].x - ultimo.xDoc) < 6) {
      ultimo.mov.documento += t[0];
      ultimo = null;
    }
  }

  // Verificación de cada corte y descarte de cortes repetidos
  const vistos = new Set<string>();
  for (const c of cortes) {
    const clave = `${c.corte.getTime()}|${c.saldoActual}|${c.movimientos.length}`;
    if (vistos.has(clave)) c.repetido = true;
    vistos.add(clave);

    let previo = c.saldoAnterior;
    for (const mv of c.movimientos) {
      if (previo !== null) mv.saldoOk = Math.abs(redondear(previo + mv.credito - mv.debito) - mv.saldo) < 0.005;
      previo = mv.saldo;
    }
    const cred = redondear(c.movimientos.reduce((s, x) => s + x.credito, 0));
    const deb  = redondear(c.movimientos.reduce((s, x) => s + x.debito, 0));
    const nCred = c.movimientos.filter(x => x.credito > 0).length;
    const nDeb  = c.movimientos.filter(x => x.debito > 0).length;
    if (c.creditos && (Math.abs(c.creditos.total - cred) > 0.005 || c.creditos.n !== nCred)) {
      c.avisos.push(`Créditos leídos: ${nCred} por ${cred.toFixed(2)}; el banco declara ${c.creditos.n} por ${c.creditos.total.toFixed(2)}`);
    }
    if (c.debitos && (Math.abs(c.debitos.total - deb) > 0.005 || c.debitos.n !== nDeb)) {
      c.avisos.push(`Débitos leídos: ${nDeb} por ${deb.toFixed(2)}; el banco declara ${c.debitos.n} por ${c.debitos.total.toFixed(2)}`);
    }
    const saltos = c.movimientos.filter(x => !x.saldoOk).length;
    if (saltos > 0) c.avisos.push(`${saltos} movimiento(s) no encadenan con el saldo anterior`);
    if (c.saldoAnterior === null || c.saldoActual === null || !c.creditos || !c.debitos) {
      c.avisos.push('No se encontró el bloque de conciliación del banco para verificar este corte');
    }
    c.cuadra = c.avisos.length === 0 && c.movimientos.length > 0;
  }

  return {
    numeroCuenta,
    cortes,
    movimientos: cortes.filter(c => !c.repetido).flatMap(c => c.movimientos),
  };
}
