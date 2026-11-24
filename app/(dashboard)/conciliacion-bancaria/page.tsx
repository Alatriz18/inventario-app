'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Check, X, Building2, Wand2, Lock, Unlock, Layers } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import PageHeader  from '@/components/shared/PageHeader';
import CuentaCombobox from '@/components/shared/CuentaCombobox';
import { Button }  from '@/components/ui/button';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Input }   from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { CuentaBancaria, MovimientoBancario, AsientoContable, ExtractoBancario, ConciliacionBancaria, LoteReclasificacion } from '@/types';
import { subscribeToLotesReclasificacion } from '@/lib/firebase/reclasificaciones';
import {
  subscribeToCuentasBancarias, subscribeToMovimientosBancarios,
  conciliarMovimiento, ignorarMovimiento, revertirConciliacion,
} from '@/lib/firebase/cuentas-bancarias';
import { subscribeToAsientos } from '@/lib/firebase/asientos';
import {
  subscribeToExtractos, subscribeToConciliaciones, cerrarConciliacion, reabrirConciliacion,
} from '@/lib/firebase/extractos-bancarios';
import { crearAsientoMovimientoBancario } from '@/lib/contabilidad/motor-asientos';
import { asegurarCuenta } from '@/lib/contabilidad/reclasificar-compras';
import { CUENTAS_POR_DEFECTO } from '@/lib/data/plan-cuentas-ecuador';
import {
  aFecha, periodoDe, finDePeriodo, calcularConciliacion, proponerEmparejamientos,
  agruparPendientes, netoEnCuenta, cruceConCaja, CUENTAS_SUGERIDAS, type Emparejamiento, type GrupoMovimientos,
} from '@/lib/bancos/conciliacion';
import { useOpcionesCuentasMovimiento } from '@/hooks/useOpcionesCuentasMovimiento';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;
const fmt = (f: unknown) => format(aFecha(f), 'dd/MM/yyyy');
const nombreMes = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  const t = format(new Date(y, m - 1, 1), "MMMM 'de' yyyy", { locale: es });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default function ConciliacionBancariaPage() {
  const { user } = useAuth();

  const [cuentas,   setCuentas]   = useState<CuentaBancaria[]>([]);
  const [cuentaSel, setCuentaSel] = useState<string>('');
  const [periodo,   setPeriodo]   = useState<string>('');
  const [movs,      setMovs]      = useState<MovimientoBancario[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [asientos,  setAsientos]  = useState<AsientoContable[]>([]);
  const [extractos, setExtractos] = useState<ExtractoBancario[]>([]);
  const [cierres,   setCierres]   = useState<ConciliacionBancaria[]>([]);
  const [lotes,     setLotes]     = useState<LoteReclasificacion[]>([]);

  // Conciliar un movimiento con un asiento existente
  const [dlgConciliar, setDlgConciliar] = useState(false);
  const [movConciliar, setMovConciliar] = useState<MovimientoBancario | null>(null);

  // Emparejamiento automático
  const [dlgAuto, setDlgAuto] = useState(false);
  const [propuestas, setPropuestas] = useState<Emparejamiento[]>([]);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [aplicandoAuto, setAplicandoAuto] = useState(false);

  // Contabilizar movimientos del banco que no tienen asiento (comisiones, IVA, intereses…)
  const [dlgContab, setDlgContab] = useState(false);
  const [aContabilizar, setAContabilizar] = useState<MovimientoBancario[]>([]);
  const [tituloContab, setTituloContab] = useState('');
  const [cuentaContra, setCuentaContra] = useState('');
  const [contabilizando, setContabilizando] = useState(false);
  const [progresoContab, setProgresoContab] = useState(0);

  const [cerrando, setCerrando] = useState(false);

  // Movimientos marcados para contabilizar juntos (p. ej. contra Caja General) y búsqueda en la lista
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const u1 = subscribeToCuentasBancarias(setCuentas);
    const u2 = subscribeToAsientos(setAsientos, 10000);
    return () => { u1(); u2(); };
  }, []);

  // Con una sola cuenta bancaria activa, se elige sola
  useEffect(() => {
    const activas = cuentas.filter(c => c.activa);
    if (!cuentaSel && activas.length === 1) setCuentaSel(activas[0].id);
  }, [cuentas, cuentaSel]);

  useEffect(() => {
    if (!cuentaSel) { setMovs([]); setExtractos([]); setCierres([]); setLotes([]); return; }
    setLoading(true);
    const onErr = () => { toast.error('No se pudieron cargar los movimientos'); setLoading(false); };
    const u1 = subscribeToMovimientosBancarios(cuentaSel, d => { setMovs(d); setLoading(false); }, onErr);
    const u2 = subscribeToExtractos(cuentaSel, setExtractos, () => {});
    const u3 = subscribeToConciliaciones(cuentaSel, setCierres, () => {});
    const u4 = subscribeToLotesReclasificacion(cuentaSel, setLotes);
    return () => { u1(); u2(); u3(); u4(); };
  }, [cuentaSel]);

  // Si el historial de este banco se movió a Caja General, los libros ya no tienen el banco:
  // no se puede conciliar hasta deshacer esa reclasificación.
  const lotesAplicados = useMemo(() => lotes.filter(l => l.estado === 'aplicado'), [lotes]);

  const cuentaObj = useMemo(() => cuentas.find(c => c.id === cuentaSel) ?? null, [cuentas, cuentaSel]);
  const cuentaCodigo = cuentaObj?.cuentaContableCodigo ?? '';

  // Meses disponibles: los que tienen movimientos o un corte del banco
  const periodos = useMemo(() => {
    const s = new Set<string>();
    movs.filter(m => m.estado !== 'anulado').forEach(m => s.add(periodoDe(aFecha(m.fecha))));
    extractos.forEach(e => s.add(e.periodo));
    return [...s].sort();
  }, [movs, extractos]);

  const cierrePorPeriodo = useMemo(() => new Map(cierres.map(c => [c.periodo, c])), [cierres]);

  // Por defecto: el primer mes sin conciliación cerrada (se concilia en orden cronológico)
  useEffect(() => {
    if (periodos.length === 0) { setPeriodo(''); return; }
    if (periodo && periodos.includes(periodo)) return;
    setPeriodo(periodos.find(p => !cierrePorPeriodo.has(p)) ?? periodos[periodos.length - 1]);
  }, [periodos, periodo, cierrePorPeriodo]);

  const cierre = periodo ? cierrePorPeriodo.get(periodo) : undefined;
  const extracto = extractos.find(e => e.periodo === periodo);
  const corte = useMemo(() => periodo ? finDePeriodo(periodo) : new Date(), [periodo]);

  // Saldo del banco al corte: el que declara el estado de cuenta; si no hay, se calcula con los movimientos
  const saldoBanco = useMemo(() => {
    if (!cuentaObj || !periodo) return { valor: 0, origen: 'sin datos' as const };
    if (extracto) return { valor: extracto.saldoActual, origen: 'estado de cuenta' as const };
    const neto = movs
      .filter(m => m.estado !== 'anulado' && aFecha(m.fecha) <= corte)
      .reduce((s, m) => s + (m.tipo === 'credito' ? m.monto : -m.monto), cuentaObj.saldoInicial);
    return { valor: Math.round(neto * 100) / 100, origen: 'calculado con los movimientos (sin estado de cuenta de este mes)' as const };
  }, [cuentaObj, periodo, extracto, movs, corte]);

  const conc = useMemo(() => {
    if (!cuentaCodigo || !periodo) return null;
    return calcularConciliacion({ corte, cuentaCodigo, movimientos: movs, asientos });
  }, [corte, cuentaCodigo, periodo, movs, asientos]);

  const diferencia = conc ? conc.diferencia(saldoBanco.valor) : 0;

  // Control del efectivo: depósitos que recibió el banco vs lo que los libros sacaron de Caja
  const cruce = useMemo(() => (cuentaCodigo && periodo)
    ? cruceConCaja({ periodo, cuentaCodigo, cajaCodigo: CUENTAS_POR_DEFECTO.cuentaCaja, movimientos: movs, asientos })
    : null, [cuentaCodigo, periodo, movs, asientos]);

  const movsMes = useMemo(
    () => movs.filter(m => periodo && periodoDe(aFecha(m.fecha)) === periodo)
      .sort((a, b) => aFecha(a.fecha).getTime() - aFecha(b.fecha).getTime()),
    [movs, periodo]
  );
  const movsAgrupados = useMemo(() => ({
    pendientes:  movsMes.filter(m => m.estado === 'no_conciliado'),
    conciliados: movsMes.filter(m => m.estado === 'conciliado'),
    ignorados:   movsMes.filter(m => m.estado === 'ignorado'),
  }), [movsMes]);

  const pendientesVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return movsAgrupados.pendientes;
    return movsAgrupados.pendientes.filter(m =>
      m.descripcion.toLowerCase().includes(q) || (m.referencia ?? '').toLowerCase().includes(q));
  }, [movsAgrupados.pendientes, busqueda]);

  const seleccionados = useMemo(
    () => movsAgrupados.pendientes.filter(m => seleccion.has(m.id)),
    [movsAgrupados.pendientes, seleccion]
  );
  const totalSeleccion = useMemo(() => ({
    creditos: Math.round(seleccionados.filter(m => m.tipo === 'credito').reduce((s, m) => s + m.monto, 0) * 100) / 100,
    debitos:  Math.round(seleccionados.filter(m => m.tipo === 'debito').reduce((s, m) => s + m.monto, 0) * 100) / 100,
  }), [seleccionados]);

  // La selección vale para un solo mes y cuenta
  useEffect(() => { setSeleccion(new Set()); setBusqueda(''); }, [cuentaSel, periodo]);

  const grupos: GrupoMovimientos[] = useMemo(
    () => agruparPendientes(movsAgrupados.pendientes, CUENTAS_SUGERIDAS).filter(g => g.movimientos.length > 1),
    [movsAgrupados.pendientes]
  );

  const opcionesCuentas = useOpcionesCuentasMovimiento();

  const puedeCerrar = !!conc && !cierre && lotesAplicados.length === 0 && Math.abs(diferencia) < 0.005
    && movsAgrupados.pendientes.length === 0 && conc.descuadres.length === 0
    && conc.creditosNoRegistrados.length + conc.debitosNoRegistrados.length === 0;
  const bloqueado = !!cierre;

  // ── Conciliar un movimiento con un asiento ya existente ────────────────────
  const asientosCandidatos = useMemo(() => {
    if (!movConciliar || !cuentaCodigo) return [];
    const yaConciliados = new Set(movs.filter(m => m.asientoId).map(m => m.asientoId));
    const tm = aFecha(movConciliar.fecha).getTime();
    return asientos
      .filter(a => a.estado !== 'borrador' && !yaConciliados.has(a.id))
      .map(a => {
        const neto = netoEnCuenta(a, cuentaCodigo);
        const montoLinea = movConciliar.tipo === 'credito' ? neto : -neto;
        if (montoLinea <= 0) return null;
        return { asiento: a, montoLinea, dif: Math.abs(montoLinea - movConciliar.monto),
                 dias: Math.abs(aFecha(a.fecha).getTime() - tm) / 86400000 };
      })
      .filter((x): x is { asiento: AsientoContable; montoLinea: number; dif: number; dias: number } => !!x)
      .sort((a, b) => a.dif - b.dif || a.dias - b.dias)
      .slice(0, 30);
  }, [movConciliar, cuentaCodigo, asientos, movs]);

  const numeroAsiento = (id?: string | null) =>
    id ? (asientos.find(a => a.id === id)?.numero ?? '—') : '—';

  const abrirConciliar = (mov: MovimientoBancario) => {
    if (!cuentaCodigo) {
      toast.error('Primero vincula esta cuenta bancaria a una cuenta contable en Movimientos Bancarios.');
      return;
    }
    setMovConciliar(mov);
    setDlgConciliar(true);
  };

  const handleConciliar = async (asientoId: string) => {
    if (!movConciliar) return;
    try {
      await conciliarMovimiento(movConciliar.id, asientoId);
      toast.success('Movimiento conciliado con el asiento contable');
      setDlgConciliar(false);
      setMovConciliar(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const accion = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error'); }
  };

  // ── Emparejamiento automático ──────────────────────────────────────────────
  const abrirAuto = () => {
    if (!cuentaCodigo) { toast.error('Vincula la cuenta bancaria a una cuenta contable primero.'); return; }
    const ps = proponerEmparejamientos({ movimientos: movsAgrupados.pendientes, asientos, cuentaCodigo, toleranciaDias: 10 });
    if (ps.length === 0) { toast.info('No se encontraron asientos con el mismo monto para los movimientos pendientes de este mes.'); return; }
    setPropuestas(ps);
    setElegidas(new Set(ps.filter(p => p.confianza === 'alta').map(p => p.movimiento.id)));
    setDlgAuto(true);
  };

  const aplicarAuto = async () => {
    const aplicar = propuestas.filter(p => elegidas.has(p.movimiento.id));
    if (aplicar.length === 0) return;
    setAplicandoAuto(true);
    let ok = 0, err = 0;
    for (const p of aplicar) {
      try { await conciliarMovimiento(p.movimiento.id, p.asiento.id); ok++; } catch { err++; }
    }
    setAplicandoAuto(false);
    setDlgAuto(false);
    toast.success(`${ok} movimiento(s) conciliados${err ? ` · ${err} con error` : ''}`);
  };

  // ── Contabilizar movimientos del banco sin asiento ─────────────────────────
  const abrirContabilizar = (lista: MovimientoBancario[], titulo: string, sugerida?: string) => {
    if (!cuentaCodigo) { toast.error('Vincula la cuenta bancaria a una cuenta contable primero.'); return; }
    setAContabilizar(lista);
    setTituloContab(titulo);
    setCuentaContra(sugerida ?? '');
    setProgresoContab(0);
    setDlgContab(true);
  };

  const confirmarContabilizar = async () => {
    if (!user || !cuentaCodigo || !cuentaContra) { toast.error('Elige la cuenta contable de contrapartida'); return; }
    setContabilizando(true);
    setProgresoContab(0);
    let ok = 0, err = 0;
    try {
      await asegurarCuenta(cuentaContra);
      for (let i = 0; i < aContabilizar.length; i++) {
        const m = aContabilizar[i];
        try {
          const asientoId = await crearAsientoMovimientoBancario({
            movId: m.id, fecha: aFecha(m.fecha),
            concepto: m.descripcion, monto: m.monto,
            cuentaBancoCodigo: cuentaCodigo, cuentaContrapartidaCodigo: cuentaContra,
            tipo: m.tipo === 'debito' ? 'cargo' : 'abono',
            usuarioId: user.uid, usuarioNombre: user.nombre,
          });
          if (asientoId) { await conciliarMovimiento(m.id, asientoId); ok++; } else err++;
        } catch { err++; }
        setProgresoContab(i + 1);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo preparar la cuenta contable');
    }
    setContabilizando(false);
    setDlgContab(false);
    setSeleccion(new Set());
    if (ok) toast.success(`${ok} movimiento(s) contabilizados y conciliados`);
    if (err) toast.warning(`${err} no se pudieron contabilizar (¿período contable cerrado?). Revísalos en Contabilidad.`, { duration: 10000 });
  };

  // ── Cierre del mes ─────────────────────────────────────────────────────────
  const cerrarMes = async () => {
    if (!user || !conc || !cuentaObj || !periodo) return;
    setCerrando(true);
    try {
      await cerrarConciliacion({
        cuentaBancariaId: cuentaObj.id, periodo, corte,
        saldoBanco: saldoBanco.valor, saldoLibros: conc.saldoLibros,
        saldoConciliado: conc.saldoLibrosConciliado,
        depositosTransito: conc.totalTransito, pagosPendientes: conc.totalPendientes,
        usuarioId: user.uid, usuarioNombre: user.nombre,
      });
      toast.success(`Conciliación de ${nombreMes(periodo)} cerrada`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar la conciliación');
    } finally { setCerrando(false); }
  };

  const reabrirMes = async () => {
    if (!cuentaObj || !periodo) return;
    await accion(() => reabrirConciliacion(cuentaObj.id, periodo));
    toast.success(`Conciliación de ${nombreMes(periodo)} reabierta`);
  };

  const Fila = ({ etiqueta, valor, signo, detalle, fuerte }: {
    etiqueta: string; valor: number; signo?: '+' | '−'; detalle?: React.ReactNode; fuerte?: boolean;
  }) => (
    <div className={`flex items-start justify-between gap-3 py-1.5 ${fuerte ? 'border-t font-semibold text-slate-900' : 'text-slate-700'}`}>
      <div className="min-w-0 text-sm">
        <span className="text-slate-400 mr-1.5">{signo}</span>{etiqueta}
        {detalle && <div className="text-[11px] text-slate-400 font-normal">{detalle}</div>}
      </div>
      <span className="text-sm tabular-nums shrink-0">{currency(valor)}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Conciliación Bancaria"
        description="Concilia mes a mes: el saldo del estado de cuenta del banco contra el saldo de tus libros, explicando cada diferencia"
        action={
          <Link href="/movimientos-bancarios">
            <Button variant="outline" size="sm">
              <Building2 className="mr-2 h-4 w-4" /> Movimientos Bancarios
            </Button>
          </Link>
        }
      />

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-64">
          <Label className="text-xs">Cuenta bancaria</Label>
          <Select value={cuentaSel} onValueChange={v => { setCuentaSel(v); setPeriodo(''); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar cuenta…" /></SelectTrigger>
            <SelectContent>
              {cuentas.filter(c => c.activa).map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="font-medium">{c.banco}</span>
                  <span className="text-slate-400 ml-2 text-xs">{c.numeroCuenta}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-56">
          <Label className="text-xs">Mes a conciliar</Label>
          <Select value={periodo} onValueChange={setPeriodo} disabled={periodos.length === 0}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Sin movimientos" /></SelectTrigger>
            <SelectContent>
              {[...periodos].reverse().map(p => (
                <SelectItem key={p} value={p}>
                  {nombreMes(p)}{cierrePorPeriodo.has(p) ? '  ✓ cerrada' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {cuentas.length === 0 ? (
        <div className="bg-white rounded-xl border flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Todavía no tienes cuentas bancarias registradas</p>
          <Link href="/movimientos-bancarios"><Button className="mt-4" size="sm">Crear primera cuenta bancaria</Button></Link>
        </div>
      ) : !cuentaSel ? (
        <div className="bg-white rounded-xl border py-14 text-center text-sm text-slate-400">
          Elige la cuenta bancaria que vas a conciliar. La conciliación se hace por cuenta y por mes.
        </div>
      ) : !cuentaCodigo ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          Esta cuenta bancaria no está vinculada a una cuenta contable. Vincúlala en{' '}
          <Link href="/movimientos-bancarios" className="underline">Movimientos Bancarios</Link> para poder conciliar contra los libros.
        </div>
      ) : loading ? (
        <Skeleton className="h-64 w-full" />
      ) : periodos.length === 0 ? (
        <div className="bg-white rounded-xl border py-14 text-center text-sm text-slate-400">
          Esta cuenta no tiene movimientos. Importa el estado de cuenta en PDF desde{' '}
          <Link href="/movimientos-bancarios" className="text-blue-600 underline">Movimientos Bancarios</Link>.
        </div>
      ) : conc && (
        <>
          {lotesAplicados.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 space-y-1.5">
              <p className="font-semibold">El historial de este banco fue movido a Caja General</p>
              <p className="text-xs">
                {lotesAplicados.map(l => `${format(aFecha(l.fecha), 'dd/MM/yyyy')} (${l.items.length} movimientos, por ${l.usuarioNombre})`).join(' · ')}.
                Esa reclasificación cambió la cuenta Bancos por Caja en los asientos, así que los libros casi no tienen movimientos en el banco
                y esta conciliación no puede cuadrar. Para conciliar de verdad, entra a{' '}
                <Link href="/movimientos-bancarios" className="underline font-medium">Movimientos Bancarios</Link>, elige esta cuenta y pulsa
                «Deshacer» en el recuadro de reclasificaciones. No se puede cerrar el mes mientras siga aplicada.
              </p>
            </div>
          )}

          {/* ── Estado de la conciliación del mes ─────────────────────────── */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-5 py-3 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800">
                  Conciliación al {format(corte, 'dd/MM/yyyy')} — {nombreMes(periodo)}
                </p>
                <p className="text-xs text-slate-400">
                  {cuentaObj?.banco} {cuentaObj?.numeroCuenta} · cuenta contable {cuentaCodigo}
                </p>
              </div>
              {cierre ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                  <Lock className="h-3 w-3" /> Cerrada por {cierre.usuarioNombre}
                </span>
              ) : Math.abs(diferencia) < 0.005 ? (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Cuadra</span>
              ) : (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">En proceso</span>
              )}
            </div>

            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
              {/* Lado banco */}
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Según el banco</p>
                <Fila etiqueta="Saldo según estado de cuenta" valor={saldoBanco.valor}
                  detalle={saldoBanco.origen === 'estado de cuenta'
                    ? 'Tomado del estado de cuenta del banco'
                    : <span className="text-amber-600">{saldoBanco.origen}</span>} />
                <Fila etiqueta={`Depósitos en tránsito (${conc.depositosTransito.length})`} valor={conc.totalTransito} signo="+"
                  detalle="Registrados en libros, el banco aún no los acredita" />
                <Fila etiqueta={`Pagos y cheques no cobrados (${conc.pagosPendientes.length})`} valor={conc.totalPendientes} signo="−"
                  detalle="Registrados en libros, el banco aún no los debita" />
                <Fila etiqueta="Saldo bancario conciliado" valor={conc.saldoBancoConciliado(saldoBanco.valor)} fuerte />
              </div>
              {/* Lado libros */}
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Según libros</p>
                <Fila etiqueta="Saldo según contabilidad" valor={conc.saldoLibros}
                  detalle={`Cuenta ${cuentaCodigo} hasta el ${format(corte, 'dd/MM/yyyy')}`} />
                <Fila etiqueta={`Créditos del banco sin contabilizar (${conc.creditosNoRegistrados.length})`} valor={conc.totalCreditosNR} signo="+"
                  detalle="Intereses, depósitos y notas de crédito que faltan en libros" />
                <Fila etiqueta={`Débitos del banco sin contabilizar (${conc.debitosNoRegistrados.length})`} valor={conc.totalDebitosNR} signo="−"
                  detalle="Comisiones, IVA y notas de débito que faltan en libros" />
                <Fila etiqueta="Saldo contable conciliado" valor={conc.saldoLibrosConciliado} fuerte />
              </div>
            </div>

            <div className={`px-5 py-3 border-t flex flex-wrap items-center justify-between gap-3 ${
              Math.abs(diferencia) < 0.005 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div>
                <p className="text-xs text-slate-500">Diferencia por explicar</p>
                <p className={`text-xl font-bold tabular-nums ${Math.abs(diferencia) < 0.005 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {currency(diferencia)}
                </p>
                {Math.abs(diferencia) >= 0.005 && (
                  <p className="text-[11px] text-slate-500 max-w-xl">
                    Si es la primera conciliación, suele ser el saldo inicial: el saldo de libros al empezar no coincide con el del banco
                    (revisa el asiento de apertura). Si es un mes posterior, revisa los movimientos conciliados con monto distinto.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!bloqueado && (
                  <Button variant="outline" size="sm" onClick={abrirAuto} disabled={movsAgrupados.pendientes.length === 0}>
                    <Wand2 className="mr-2 h-4 w-4" /> Conciliar automáticamente
                  </Button>
                )}
                {cierre ? (
                  <Button variant="outline" size="sm" onClick={reabrirMes}>
                    <Unlock className="mr-2 h-4 w-4" /> Reabrir mes
                  </Button>
                ) : (
                  <Button size="sm" onClick={cerrarMes} disabled={!puedeCerrar || cerrando}
                    title={puedeCerrar ? undefined : 'Para cerrar: diferencia en $0.00 y todos los movimientos del banco contabilizados'}>
                    <Lock className="mr-2 h-4 w-4" /> {cerrando ? 'Cerrando…' : 'Cerrar conciliación del mes'}
                  </Button>
                )}
              </div>
            </div>

            {/* Detalle de las partidas */}
            {(conc.depositosTransito.length > 0 || conc.pagosPendientes.length > 0 || conc.descuadres.length > 0) && (
              <div className="border-t divide-y text-sm">
                {conc.descuadres.length > 0 && (
                  <details className="px-5 py-2.5" open>
                    <summary className="cursor-pointer text-red-600 font-medium">
                      {conc.descuadres.length} movimiento(s) conciliado(s) con un monto distinto al del asiento
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {conc.descuadres.map(d => (
                        <li key={d.movimiento.id}>
                          {fmt(d.movimiento.fecha)} · {d.movimiento.descripcion} — banco {currency(d.montoBanco)} vs libros {currency(d.montoLibros)} (asiento {d.asiento.numero})
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {([['Depósitos en tránsito', conc.depositosTransito], ['Pagos y cheques no cobrados', conc.pagosPendientes]] as const).map(([titulo, lista]) =>
                  lista.length > 0 && (
                    <details key={titulo} className="px-5 py-2.5">
                      <summary className="cursor-pointer text-slate-600 font-medium">{titulo} ({lista.length})</summary>
                      <ul className="mt-2 space-y-1 text-xs text-slate-600 max-h-48 overflow-y-auto">
                        {lista.map(p => (
                          <li key={p.asiento.id} className="flex justify-between gap-3">
                            <span className="truncate">{fmt(p.asiento.fecha)} · {p.asiento.numero} · {p.asiento.concepto}</span>
                            <span className="shrink-0 tabular-nums">
                              {currency(p.monto)}{p.dias > 30 && <span className="ml-2 text-amber-600">{p.dias} días</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
              </div>
            )}
          </div>

          {/* ── Cruce Bancos ↔ Caja ─────────────────────────────────────── */}
          {cruce && (cruce.depositosBanco > 0 || cruce.trasladosCaja > 0) && (
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm font-semibold text-slate-800">Cruce Bancos ↔ Caja del mes</p>
              <p className="text-xs text-slate-400 mb-3">
                El efectivo y los cheques que el banco recibió como depósito deben ser lo mismo que los libros sacaron de Caja hacia Bancos.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-slate-400">Depósitos según el banco ({cruce.nDepositosBanco})</p>
                  <p className="font-semibold tabular-nums">{currency(cruce.depositosBanco)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-slate-400">Salidas de Caja a Bancos en libros</p>
                  <p className="font-semibold tabular-nums">{currency(cruce.trasladosCaja)}</p>
                </div>
                <div className={`rounded-lg border p-3 ${Math.abs(cruce.diferencia) < 0.005 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <p className="text-xs text-slate-500">Diferencia</p>
                  <p className={`font-semibold tabular-nums ${Math.abs(cruce.diferencia) < 0.005 ? 'text-emerald-700' : 'text-amber-700'}`}>{currency(cruce.diferencia)}</p>
                </div>
              </div>
              {Math.abs(cruce.diferencia) >= 0.005 && (
                <p className="text-[11px] text-slate-500 mt-2">
                  {cruce.diferencia > 0
                    ? 'El banco recibió más efectivo del que se registró como salida de Caja: contabiliza los depósitos pendientes con «Contabilizar» eligiendo la cuenta Caja, o revisa que las ventas en efectivo estén en Caja.'
                    : 'Los libros registran más salidas de Caja a Bancos de las que el banco muestra como depósito: puede haber depósitos aún no acreditados (tránsito) o un registro duplicado.'}
                </p>
              )}
            </div>
          )}

          {bloqueado && (
            <div className="bg-slate-50 border rounded-xl p-3 text-xs text-slate-500">
              Este mes está cerrado: no se pueden conciliar, ignorar ni contabilizar movimientos. Usa «Reabrir mes» si necesitas corregir algo.
            </div>
          )}

          {/* ── Movimientos repetitivos: contabilizar de una vez ──────────── */}
          {!bloqueado && grupos.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-slate-50 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Layers className="h-4 w-4" /> Movimientos repetidos sin contabilizar — se contabilizan juntos
              </div>
              <div className="divide-y">
                {grupos.slice(0, 12).map(g => (
                  <div key={`${g.tipo}|${g.clave}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{g.etiqueta}</p>
                      <p className="text-[11px] text-slate-400">
                        {g.movimientos.length} movimientos · {g.tipo === 'credito' ? 'créditos' : 'débitos'} por {currency(g.total)}
                        {g.sugerencia && <> · sugerido: {g.sugerencia.motivo}</>}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-8 text-xs"
                      onClick={() => abrirContabilizar(g.movimientos, `${g.etiqueta} (${g.movimientos.length})`, g.sugerencia?.codigo)}>
                      Contabilizar {g.movimientos.length}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Movimientos del mes ──────────────────────────────────────── */}
          <Tabs defaultValue="pendientes">
            <TabsList>
              <TabsTrigger value="pendientes">Por conciliar ({movsAgrupados.pendientes.length})</TabsTrigger>
              <TabsTrigger value="conciliados">Conciliados ({movsAgrupados.conciliados.length})</TabsTrigger>
              <TabsTrigger value="ignorados">Ignorados ({movsAgrupados.ignorados.length})</TabsTrigger>
            </TabsList>

            {(['pendientes', 'conciliados', 'ignorados'] as const).map(tab => {
              const lista = tab === 'pendientes' ? pendientesVisibles : movsAgrupados[tab];
              const conSeleccion = tab === 'pendientes' && !bloqueado;
              const columnas = conSeleccion ? 8 : 7;
              return (
              <TabsContent key={tab} value={tab} className="mt-4">
                {conSeleccion && movsAgrupados.pendientes.length > 0 && (
                  <div className="mb-3 bg-white rounded-xl border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar en la descripción (ej. DEPOSITO, TRANSFERENCIA)…" className="h-8 w-80 text-xs" />
                      <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => setSeleccion(new Set(pendientesVisibles.map(m => m.id)))}>
                        Marcar todos ({pendientesVisibles.length})
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => setSeleccion(new Set(pendientesVisibles.filter(m => m.tipo === 'credito').map(m => m.id)))}>
                        Solo créditos
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => setSeleccion(new Set(pendientesVisibles.filter(m => m.tipo === 'debito').map(m => m.id)))}>
                        Solo débitos
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-slate-500" onClick={() => setSeleccion(new Set())}>
                        Limpiar
                      </Button>
                    </div>
                    {seleccionados.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                        <span className="text-sm text-emerald-800">
                          <strong>{seleccionados.length}</strong> marcado(s) · créditos {currency(totalSeleccion.creditos)} · débitos {currency(totalSeleccion.debitos)}
                        </span>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-8 text-xs"
                            onClick={() => abrirContabilizar(seleccionados, `${seleccionados.length} movimientos marcados`, CUENTAS_SUGERIDAS.caja)}>
                            Contabilizar en Caja General
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => abrirContabilizar(seleccionados, `${seleccionados.length} movimientos marcados`, undefined)}>
                            Otra cuenta…
                          </Button>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400">
                      Marca los movimientos que van a Caja General (la mayoría). Las comisiones y los valores chicos del banco puedes dejarlos sin marcar
                      y registrarlos aparte, por grupo o a mano con «Movimiento manual».
                    </p>
                  </div>
                )}
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow className="bg-slate-50">
                          {conSeleccion && (
                            <TableHead className="w-8">
                              <input type="checkbox" aria-label="Marcar todos los visibles"
                                checked={pendientesVisibles.length > 0 && pendientesVisibles.every(m => seleccion.has(m.id))}
                                onChange={e => setSeleccion(e.target.checked ? new Set(pendientesVisibles.map(m => m.id)) : new Set())} />
                            </TableHead>
                          )}
                          <TableHead>Fecha</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead>N° documento</TableHead>
                          <TableHead className="text-right">Débito</TableHead>
                          <TableHead className="text-right">Crédito</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                          <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lista.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={columnas} className="text-center py-10 text-slate-400">
                              {tab === 'pendientes'
                                ? (busqueda ? 'Ningún movimiento coincide con la búsqueda.' : 'No quedan movimientos por conciliar en este mes.')
                                : 'No hay movimientos en esta categoría.'}
                            </TableCell>
                          </TableRow>
                        ) : lista.map(m => (
                          <TableRow key={m.id} className={conSeleccion && seleccion.has(m.id) ? 'bg-emerald-50/60' : undefined}>
                            {conSeleccion && (
                              <TableCell>
                                <input type="checkbox" aria-label="Marcar movimiento" checked={seleccion.has(m.id)}
                                  onChange={e => setSeleccion(prev => {
                                    const n = new Set(prev);
                                    if (e.target.checked) n.add(m.id); else n.delete(m.id);
                                    return n;
                                  })} />
                              </TableCell>
                            )}
                            <TableCell className="text-sm text-slate-500 whitespace-nowrap">{fmt(m.fecha)}</TableCell>
                            <TableCell className="text-sm max-w-72 truncate" title={m.descripcion}>{m.descripcion}</TableCell>
                            <TableCell className="text-xs font-mono text-slate-500">{m.referencia ?? '—'}</TableCell>
                            <TableCell className="text-right text-sm text-red-600">{m.tipo === 'debito' ? currency(m.monto) : ''}</TableCell>
                            <TableCell className="text-right text-sm text-green-700">{m.tipo === 'credito' ? currency(m.monto) : ''}</TableCell>
                            <TableCell className="text-right text-sm text-slate-500">{m.saldo != null ? currency(m.saldo) : '—'}</TableCell>
                            <TableCell className="text-center">
                              {tab === 'pendientes' && !bloqueado && (
                                <div className="flex justify-center gap-1">
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => abrirConciliar(m)}>
                                    <Check className="h-3 w-3 mr-1" /> Conciliar
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs"
                                    onClick={() => abrirContabilizar([m], m.descripcion, undefined)}>
                                    Contabilizar
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
                                    title="Ignorar" onClick={() => accion(() => ignorarMovimiento(m.id))}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              {tab === 'conciliados' && (
                                <div className="flex items-center justify-center gap-2">
                                  <span className="font-mono text-[10px] text-slate-500" title="Asiento contable">{numeroAsiento(m.asientoId)}</span>
                                  {!bloqueado && (
                                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
                                      onClick={() => accion(() => revertirConciliacion(m.id))}>Revertir</Button>
                                  )}
                                </div>
                              )}
                              {tab === 'ignorados' && !bloqueado && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
                                  onClick={() => accion(() => revertirConciliacion(m.id))}>Revertir</Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>
              );
            })}
          </Tabs>
        </>
      )}

      {/* ── Conciliar con un asiento existente ───────────────────────────── */}
      <Dialog open={dlgConciliar} onOpenChange={setDlgConciliar}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Conciliar movimiento</DialogTitle></DialogHeader>
          {movConciliar && (
            <div className="space-y-3">
              <div className="bg-slate-50 border rounded-lg p-3 text-sm flex flex-wrap gap-4">
                <span><strong>Fecha:</strong> {fmt(movConciliar.fecha)}</span>
                <span><strong>Detalle:</strong> {movConciliar.descripcion}</span>
                <span className={movConciliar.tipo === 'credito' ? 'text-green-700' : 'text-red-600'}>
                  <strong>{movConciliar.tipo === 'credito' ? '+ Crédito' : '− Débito'}:</strong> {currency(movConciliar.monto)}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Asientos que afectan la cuenta <span className="font-mono">{cuentaCodigo}</span>, ordenados por coincidencia de monto y fecha.
              </p>
              {asientosCandidatos.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No hay asientos sin conciliar que afecten esta cuenta. Usa «Contabilizar» para registrar este movimiento
                  (comisión, interés, cobro…) o revisa Contabilidad → Asientos.
                </div>
              ) : (
                <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                  {asientosCandidatos.map(({ asiento, montoLinea, dif }) => (
                    <button key={asiento.id} onClick={() => handleConciliar(asiento.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{asiento.concepto}</p>
                        <p className="text-xs text-slate-400">{asiento.numero} · {fmt(asiento.fecha)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{currency(montoLinea)}</p>
                        {dif < 0.01
                          ? <span className="text-[10px] text-green-600 font-medium">monto exacto</span>
                          : <span className="text-[10px] text-amber-600">dif {currency(dif)}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Emparejamiento automático ────────────────────────────────────── */}
      <Dialog open={dlgAuto} onOpenChange={o => !aplicandoAuto && setDlgAuto(o)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4" /> Conciliar automáticamente</DialogTitle></DialogHeader>
          <p className="text-xs text-slate-500">
            Se propone el asiento con el mismo monto, del lado correcto y con fecha a menos de 10 días. «Dudosa» significa que había
            varios asientos del mismo monto: se eligió el más cercano en fecha; revísala antes de aceptarla.
          </p>
          <div className="max-h-96 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow className="bg-slate-50">
                  <TableHead className="w-8" />
                  <TableHead>Movimiento del banco</TableHead>
                  <TableHead>Asiento contable</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Confianza</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propuestas.map(p => (
                  <TableRow key={p.movimiento.id}>
                    <TableCell>
                      <input type="checkbox" checked={elegidas.has(p.movimiento.id)}
                        onChange={e => setElegidas(prev => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(p.movimiento.id); else n.delete(p.movimiento.id);
                          return n;
                        })} />
                    </TableCell>
                    <TableCell className="text-xs">{fmt(p.movimiento.fecha)} · {p.movimiento.descripcion}</TableCell>
                    <TableCell className="text-xs">{p.asiento.numero} · {fmt(p.asiento.fecha)} · {p.asiento.concepto}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{currency(p.movimiento.monto)}</TableCell>
                    <TableCell className="text-xs">
                      {p.confianza === 'alta'
                        ? <span className="text-green-700">Segura</span>
                        : <span className="text-amber-600">Dudosa</span>}
                      <span className="text-slate-400"> · {p.dias} día(s)</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={aplicandoAuto} onClick={() => setDlgAuto(false)}>Cancelar</Button>
            <Button disabled={aplicandoAuto || elegidas.size === 0} onClick={aplicarAuto}>
              {aplicandoAuto ? 'Conciliando…' : `Conciliar ${elegidas.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contabilizar movimientos del banco ───────────────────────────── */}
      <Dialog open={dlgContab} onOpenChange={o => !contabilizando && setDlgContab(o)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Contabilizar {aContabilizar.length === 1 ? 'movimiento' : `${aContabilizar.length} movimientos`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700 truncate">{tituloContab}</p>
              <p>
                {aContabilizar.filter(m => m.tipo === 'debito').length > 0 && <>Débitos: {currency(aContabilizar.filter(m => m.tipo === 'debito').reduce((s, m) => s + m.monto, 0))} </>}
                {aContabilizar.filter(m => m.tipo === 'credito').length > 0 && <>Créditos: {currency(aContabilizar.filter(m => m.tipo === 'credito').reduce((s, m) => s + m.monto, 0))}</>}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Cuenta contable de contrapartida</Label>
              <CuentaCombobox value={cuentaContra} onChange={setCuentaContra} opciones={opcionesCuentas} placeholder="Elegir cuenta…" />
              <p className="text-[11px] text-slate-400">
                Se crea un asiento por cada movimiento contra la cuenta del banco ({cuentaCodigo}) y se concilia solo.
                Un cobro de cliente o un pago a proveedor conviene registrarlo desde Cuentas por Cobrar / Pagar y luego conciliarlo.
              </p>
            </div>
            {contabilizando && (
              <p className="text-xs text-slate-500">Contabilizando {progresoContab} de {aContabilizar.length}…</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={contabilizando} onClick={() => setDlgContab(false)}>Cancelar</Button>
            <Button disabled={contabilizando || !cuentaContra} onClick={confirmarContabilizar}>
              {contabilizando ? 'Contabilizando…' : `Contabilizar ${aContabilizar.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
