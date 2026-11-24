'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Download, FileSpreadsheet, FileText, Lock, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type {
  AsientoContable, ConfigEmpresa, ConciliacionBancaria, CuentaBancaria, ExtractoBancario,
  MarcaConciliacion, MovimientoBancario,
} from '@/types';
import { subscribeToCuentasBancarias, subscribeToMovimientosBancarios } from '@/lib/firebase/cuentas-bancarias';
import { subscribeToAsientos } from '@/lib/firebase/asientos';
import { getConfigEmpresa } from '@/lib/firebase/config-empresa';
import { subscribeToConciliaciones, subscribeToExtractos, subscribeToMarcas } from '@/lib/firebase/extractos-bancarios';
import { aFecha, type MarcaVisto } from '@/lib/bancos/conciliacion';
import { detalleMes, resumenConciliaciones, type DatosConciliacion, type EstadoMes } from '@/lib/bancos/reporte-conciliacion';
import {
  descargarExcel, descargarPdf, generarPdfMes, generarPdfResumen, nombrePeriodo, type CabeceraReporte,
} from '@/lib/bancos/reporte-pdf';

const currency = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (f: unknown) => format(aFecha(f), 'dd/MM/yyyy');

const ESTILO_ESTADO: Record<EstadoMes, { texto: string; clase: string }> = {
  cerrada:    { texto: 'Cerrada',          clase: 'bg-green-100 text-green-700' },
  cuadra:     { texto: 'Cuadra, sin cerrar', clase: 'bg-emerald-50 text-emerald-700' },
  diferencia: { texto: 'Con diferencia',   clase: 'bg-amber-100 text-amber-700' },
  sin_estado: { texto: 'Sin estado de cuenta', clase: 'bg-amber-50 text-amber-700' },
};

export default function ReporteConciliacionesPage() {
  const [cuentas,   setCuentas]   = useState<CuentaBancaria[]>([]);
  const [cuentaSel, setCuentaSel] = useState('');
  const [movs,      setMovs]      = useState<MovimientoBancario[]>([]);
  const [asientos,  setAsientos]  = useState<AsientoContable[]>([]);
  const [extractos, setExtractos] = useState<ExtractoBancario[]>([]);
  const [cierres,   setCierres]   = useState<ConciliacionBancaria[]>([]);
  const [marcas,    setMarcas]    = useState<MarcaConciliacion[]>([]);
  const [empresa,   setEmpresa]   = useState<ConfigEmpresa | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [anio,      setAnio]      = useState('todos');
  const [periodo,   setPeriodo]   = useState('');

  useEffect(() => {
    const u1 = subscribeToCuentasBancarias(setCuentas);
    const u2 = subscribeToAsientos(setAsientos, 10000);
    getConfigEmpresa().then(setEmpresa).catch(() => {});
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    const activas = cuentas.filter(c => c.activa);
    if (!cuentaSel && activas.length === 1) setCuentaSel(activas[0].id);
  }, [cuentas, cuentaSel]);

  useEffect(() => {
    if (!cuentaSel) { setMovs([]); setExtractos([]); setCierres([]); setMarcas([]); return; }
    setLoading(true);
    const u1 = subscribeToMovimientosBancarios(cuentaSel, d => { setMovs(d); setLoading(false); },
      () => { toast.error('No se pudieron cargar los movimientos'); setLoading(false); });
    const u2 = subscribeToExtractos(cuentaSel, setExtractos, () => {});
    const u3 = subscribeToConciliaciones(cuentaSel, setCierres, () => {});
    const u4 = subscribeToMarcas(cuentaSel, setMarcas, () => {});
    return () => { u1(); u2(); u3(); u4(); };
  }, [cuentaSel]);

  const cuenta = useMemo(() => cuentas.find(c => c.id === cuentaSel) ?? null, [cuentas, cuentaSel]);

  const datos: DatosConciliacion | null = useMemo(() => {
    if (!cuenta?.cuentaContableCodigo) return null;
    const marcasVisto: MarcaVisto[] = marcas.map(k => ({ asientoId: k.asientoId, tipo: k.tipo ?? 'visto' as const, fechaBanco: aFecha(k.fechaBanco) }));
    return {
      cuentaCodigo: cuenta.cuentaContableCodigo, saldoInicialCuenta: cuenta.saldoInicial,
      movimientos: movs, asientos, marcas: marcasVisto, extractos, cierres,
    };
  }, [cuenta, movs, asientos, marcas, extractos, cierres]);

  const filas = useMemo(() => (datos ? resumenConciliaciones(datos) : []), [datos]);
  const anios = useMemo(() => [...new Set(filas.map(f => f.periodo.slice(0, 4)))].sort().reverse(), [filas]);
  const filasVisibles = useMemo(() => (anio === 'todos' ? filas : filas.filter(f => f.periodo.startsWith(anio))), [filas, anio]);

  // El mes del detalle: por defecto el más reciente de los visibles
  useEffect(() => {
    if (filasVisibles.length === 0) { setPeriodo(''); return; }
    if (!filasVisibles.some(f => f.periodo === periodo)) setPeriodo(filasVisibles[0].periodo);
  }, [filasVisibles, periodo]);

  const det = useMemo(() => (datos && periodo ? detalleMes(periodo, datos) : null), [datos, periodo]);

  const cabecera: CabeceraReporte | null = cuenta && cuenta.cuentaContableCodigo ? {
    empresa: empresa?.nombreEmpresa ?? 'Empresa', ruc: empresa?.ruc,
    banco: cuenta.banco, numeroCuenta: cuenta.numeroCuenta, cuentaContable: cuenta.cuentaContableCodigo,
  } : null;

  const kpis = useMemo(() => ({
    total: filasVisibles.length,
    cerradas: filasVisibles.filter(f => f.estado === 'cerrada').length,
    conDiferencia: filasVisibles.filter(f => f.estado === 'diferencia').length,
    cambiadas: filasVisibles.filter(f => f.cambioDespuesDelCierre).length,
    sinEstadoCuenta: filasVisibles.filter(f => !f.conEstadoCuenta).length,
  }), [filasVisibles]);

  const nombreBase = cuenta ? `conciliacion-${cuenta.numeroCuenta}` : 'conciliacion';
  const pdfMes = () => { if (cabecera && det) descargarPdf(generarPdfMes(cabecera, det), `${nombreBase}-${det.fila.periodo}.pdf`); };
  const pdfResumen = () => { if (cabecera) descargarPdf(generarPdfResumen(cabecera, filasVisibles), `${nombreBase}-resumen.pdf`); };
  const excel = () => { if (cabecera) descargarExcel(cabecera, filasVisibles, det, `${nombreBase}${det ? `-${det.fila.periodo}` : ''}.xlsx`); };

  const Linea = ({ etiqueta, valor, fuerte, signo }: { etiqueta: string; valor: number; fuerte?: boolean; signo?: string }) => (
    <div className={`flex justify-between gap-3 py-1 text-sm ${fuerte ? 'border-t font-semibold text-slate-900' : 'text-slate-700'}`}>
      <span><span className="text-slate-400 mr-1.5">{signo}</span>{etiqueta}</span>
      <span className="tabular-nums shrink-0">{currency(valor)}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reporte de Conciliaciones"
        description="Estado de cada mes: saldos del banco y de libros, partidas en tránsito, diferencia y quién cerró la conciliación"
        action={
          <Link href="/conciliacion-bancaria"><Button variant="outline" size="sm">Ir a Conciliación</Button></Link>
        }
      />

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-64">
          <Label className="text-xs">Cuenta bancaria</Label>
          <Select value={cuentaSel} onValueChange={v => { setCuentaSel(v); setPeriodo(''); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar cuenta…" /></SelectTrigger>
            <SelectContent>
              {cuentas.filter(c => c.activa).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.banco} <span className="text-slate-400 ml-2 text-xs">{c.numeroCuenta}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Label className="text-xs">Año</Label>
          <Select value={anio} onValueChange={setAnio} disabled={anios.length === 0}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {anios.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={pdfResumen} disabled={!cabecera || filasVisibles.length === 0}>
            <FileText className="mr-2 h-4 w-4" /> PDF resumen
          </Button>
          <Button variant="outline" size="sm" onClick={pdfMes} disabled={!cabecera || !det}>
            <Download className="mr-2 h-4 w-4" /> PDF del mes
          </Button>
          <Button variant="outline" size="sm" onClick={excel} disabled={!cabecera || filasVisibles.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {!cuentaSel ? (
        <div className="bg-white rounded-xl border py-14 text-center text-sm text-slate-400">
          Elige la cuenta bancaria para ver sus conciliaciones.
        </div>
      ) : !cuenta?.cuentaContableCodigo ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          Esta cuenta bancaria no está vinculada a una cuenta contable: vincúlala en{' '}
          <Link href="/movimientos-bancarios" className="underline">Movimientos Bancarios</Link>.
        </div>
      ) : loading ? (
        <Skeleton className="h-64 w-full" />
      ) : filas.length === 0 ? (
        <div className="bg-white rounded-xl border py-14 text-center text-sm text-slate-400">
          Esta cuenta no tiene movimientos ni estados de cuenta importados.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { t: 'Meses', v: kpis.total, c: 'text-slate-800' },
              { t: 'Cerrados', v: kpis.cerradas, c: 'text-green-700' },
              { t: 'Con diferencia', v: kpis.conDiferencia, c: kpis.conDiferencia ? 'text-amber-700' : 'text-slate-800' },
              { t: 'Sin estado de cuenta', v: kpis.sinEstadoCuenta, c: kpis.sinEstadoCuenta ? 'text-amber-700' : 'text-slate-800' },
            ].map(k => (
              <div key={k.t} className="bg-white rounded-xl border p-3">
                <p className="text-xs text-slate-400">{k.t}</p>
                <p className={`text-xl font-bold ${k.c}`}>{k.v}</p>
              </div>
            ))}
          </div>
          {kpis.cambiadas > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              {kpis.cambiadas} mes(es) cerrado(s) tienen cifras distintas a las del cierre: se registró o cambió algo en los libros después de cerrar. Revísalos.
            </div>
          )}

          {/* ── Resumen por mes ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Mes</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Saldo banco</TableHead>
                    <TableHead className="text-right">En tránsito</TableHead>
                    <TableHead className="text-right">Saldo libros</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                    <TableHead className="text-right">Sin contabilizar</TableHead>
                    <TableHead>Cerrada por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filasVisibles.map(f => (
                    <TableRow key={f.periodo} onClick={() => setPeriodo(f.periodo)}
                      className={`cursor-pointer ${f.periodo === periodo ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                      <TableCell className="font-medium whitespace-nowrap">{nombrePeriodo(f.periodo)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${ESTILO_ESTADO[f.estado].clase}`}>
                          {f.estado === 'cerrada' && <Lock className="h-3 w-3" />}{ESTILO_ESTADO[f.estado].texto}
                        </span>
                        {f.cambioDespuesDelCierre && <span className="ml-1.5 text-[10px] text-red-600">cambió</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {currency(f.saldoBanco)}
                        {!f.conEstadoCuenta && <span className="block text-[10px] text-amber-600">calculado</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-600">
                        {currency(f.depositosTransito - f.pagosPendientes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{currency(f.saldoLibros)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${Math.abs(f.diferencia) < 0.005 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {currency(f.diferencia)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.pendientesMes}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {f.cierre ? `${f.cierre.usuarioNombre} · ${fmt(f.cierre.cerradaAt)}` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* ── Detalle del mes elegido ─────────────────────────────────── */}
          {det && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-5 py-3 border-b bg-slate-50">
                <p className="font-semibold text-slate-800">
                  Conciliación al {format(det.fila.corte, 'dd/MM/yyyy')} — {nombrePeriodo(det.fila.periodo)}
                </p>
                <p className="text-xs text-slate-400">
                  {det.fila.cierre ? `Cerrada por ${det.fila.cierre.usuarioNombre} el ${fmt(det.fila.cierre.cerradaAt)}` : ESTILO_ESTADO[det.fila.estado].texto}
                  {!det.fila.conEstadoCuenta && ' · saldo del banco calculado (sin estado de cuenta guardado)'}
                </p>
              </div>
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Según el banco</p>
                  <Linea etiqueta="Saldo según estado de cuenta" valor={det.fila.saldoBanco} />
                  <Linea etiqueta={`Depósitos en tránsito (${det.fila.nDepositosTransito})`} valor={det.fila.depositosTransito} signo="+" />
                  <Linea etiqueta={`Pagos y cheques no cobrados (${det.fila.nPagosPendientes})`} valor={det.fila.pagosPendientes} signo="−" />
                  <Linea etiqueta="Saldo bancario conciliado" valor={det.fila.saldoBancoConciliado} fuerte />
                </div>
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Según libros</p>
                  <Linea etiqueta="Saldo según contabilidad" valor={det.fila.saldoLibros} />
                  <Linea etiqueta={`Créditos del banco sin contabilizar (${det.conc.creditosNoRegistrados.length})`} valor={det.fila.creditosNoRegistrados} signo="+" />
                  <Linea etiqueta={`Débitos del banco sin contabilizar (${det.conc.debitosNoRegistrados.length})`} valor={det.fila.debitosNoRegistrados} signo="−" />
                  <Linea etiqueta="Saldo contable conciliado" valor={det.fila.saldoLibrosConciliado} fuerte />
                </div>
              </div>
              <div className={`px-5 py-3 border-t flex items-center justify-between ${Math.abs(det.fila.diferencia) < 0.005 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <span className="text-sm text-slate-600">Diferencia por explicar</span>
                <span className={`text-lg font-bold tabular-nums ${Math.abs(det.fila.diferencia) < 0.005 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {currency(det.fila.diferencia)}
                </span>
              </div>

              <div className="border-t divide-y text-sm">
                {([
                  ['Depósitos en tránsito', det.conc.depositosTransito],
                  ['Pagos y cheques no cobrados', det.conc.pagosPendientes],
                ] as const).map(([titulo, lista]) => lista.length > 0 && (
                  <details key={titulo} className="px-5 py-2.5">
                    <summary className="cursor-pointer font-medium text-slate-600">{titulo} ({lista.length})</summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600 max-h-56 overflow-y-auto">
                      {lista.map(p => (
                        <li key={p.asiento.id} className="flex justify-between gap-3">
                          <span className="truncate">{fmt(p.asiento.fecha)} · {p.asiento.numero} · {p.asiento.concepto}</span>
                          <span className="shrink-0 tabular-nums">{currency(p.monto)}{p.dias > 30 && <span className="ml-2 text-amber-600">{p.dias} días</span>}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
                {([
                  ['Créditos del banco sin contabilizar', det.conc.creditosNoRegistrados],
                  ['Débitos del banco sin contabilizar', det.conc.debitosNoRegistrados],
                ] as const).map(([titulo, lista]) => lista.length > 0 && (
                  <details key={titulo} className="px-5 py-2.5">
                    <summary className="cursor-pointer font-medium text-slate-600">{titulo} ({lista.length})</summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600 max-h-56 overflow-y-auto">
                      {lista.map(m => (
                        <li key={m.id} className="flex justify-between gap-3">
                          <span className="truncate">{fmt(m.fecha)} · {m.descripcion}{m.referencia ? ` · ${m.referencia}` : ''}</span>
                          <span className="shrink-0 tabular-nums">{currency(m.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
                {det.conc.excluidos.length > 0 && (
                  <details className="px-5 py-2.5">
                    <summary className="cursor-pointer font-medium text-slate-600">
                      Asientos excluidos de la conciliación ({det.conc.excluidos.length}): no cuentan en ningún saldo
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {det.conc.excluidos.map(x => (
                        <li key={x.asiento.id} className="flex justify-between gap-3">
                          <span className="truncate">{fmt(x.asiento.fecha)} · {x.asiento.numero} · {x.asiento.concepto}</span>
                          <span className="shrink-0 tabular-nums">{currency(x.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {det.conc.descuadres.length > 0 && (
                  <details className="px-5 py-2.5" open>
                    <summary className="cursor-pointer font-medium text-red-600">
                      {det.conc.descuadres.length} movimiento(s) conciliado(s) con monto distinto al del asiento
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {det.conc.descuadres.map(d => (
                        <li key={d.movimiento.id}>
                          {fmt(d.movimiento.fecha)} · {d.movimiento.descripcion} — banco {currency(d.montoBanco)} vs libros {currency(d.montoLibros)} (asiento {d.asiento.numero})
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
