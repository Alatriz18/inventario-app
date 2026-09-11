'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Check, X, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { CuentaBancaria, MovimientoBancario, AsientoContable } from '@/types';
import {
  subscribeToCuentasBancarias,
  subscribeToMovimientosBancarios,
  conciliarMovimiento, ignorarMovimiento, revertirConciliacion,
} from '@/lib/firebase/cuentas-bancarias';
import { subscribeToAsientos } from '@/lib/firebase/asientos';

const currency = (v: number) => `$${v.toFixed(2)}`;

export default function ConciliacionBancariaPage() {
  const [cuentas,   setCuentas]   = useState<CuentaBancaria[]>([]);
  const [cuentaSel, setCuentaSel] = useState<string>('');
  const [movs,      setMovs]      = useState<MovimientoBancario[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [asientos,  setAsientos]  = useState<AsientoContable[]>([]);

  // Dialog de conciliación (elegir asiento)
  const [dlgConciliar, setDlgConciliar] = useState(false);
  const [movConciliar, setMovConciliar] = useState<MovimientoBancario | null>(null);

  useEffect(() => {
    const u1 = subscribeToCuentasBancarias(setCuentas);
    const u2 = subscribeToAsientos(setAsientos, 100000);
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    if (!cuentaSel) return;
    setLoading(true);
    const unsub = subscribeToMovimientosBancarios(cuentaSel, d => {
      setMovs(d);
      setLoading(false);
    }, () => {
      toast.error('No se pudieron cargar los movimientos de esta cuenta');
      setLoading(false);
    });
    return unsub;
  }, [cuentaSel]);

  const cuentaSelObj = useMemo(() => cuentas.find(c => c.id === cuentaSel) ?? null, [cuentas, cuentaSel]);

  const movsAgrupados = useMemo(() => ({
    pendientes: movs.filter(m => m.estado === 'no_conciliado'),
    conciliados:movs.filter(m => m.estado === 'conciliado'),
    ignorados:  movs.filter(m => m.estado === 'ignorado'),
  }), [movs]);

  // Asientos candidatos para un movimiento bancario: los que tocan la cuenta
  // contable de la cuenta bancaria, en el lado correcto (crédito→debe, débito→haber).
  const asientosCandidatos = useMemo(() => {
    if (!movConciliar || !cuentaSelObj?.cuentaContableCodigo) return [];
    const code = cuentaSelObj.cuentaContableCodigo;
    const yaConciliados = new Set(movs.filter(m => m.asientoId).map(m => m.asientoId));
    return asientos
      .map(a => {
        const linea = a.lineas.find(l => l.cuentaCodigo === code);
        if (!linea) return null;
        const montoLinea = movConciliar.tipo === 'credito' ? linea.debe : linea.haber;
        if (montoLinea <= 0) return null;
        const dif = Math.abs(montoLinea - movConciliar.monto);
        return { asiento: a, montoLinea, dif, yaUsado: yaConciliados.has(a.id) };
      })
      .filter((x): x is { asiento: AsientoContable; montoLinea: number; dif: number; yaUsado: boolean } => !!x && !x.yaUsado)
      .sort((a, b) => a.dif - b.dif)
      .slice(0, 30);
  }, [movConciliar, cuentaSelObj, asientos, movs]);

  const numeroAsiento = (id?: string | null) =>
    id ? (asientos.find(a => a.id === id)?.numero ?? id) : '—';

  const abrirConciliar = (mov: MovimientoBancario) => {
    if (!cuentaSelObj?.cuentaContableCodigo) {
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
    } catch (e: any) {
      toast.error(e.message ?? 'Error');
    }
  };

  const handleIgnorar = async (movId: string) => {
    try {
      await ignorarMovimiento(movId);
    } catch (e: any) {
      toast.error(e.message ?? 'Error');
    }
  };

  const handleRevertir = async (movId: string) => {
    try {
      await revertirConciliacion(movId);
    } catch (e: any) {
      toast.error(e.message ?? 'Error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Conciliación Bancaria"
        description="Cuadra los movimientos de tu extracto bancario contra los asientos contables (pagos, cobros, ventas, comisiones…)"
        action={
          <Link href="/movimientos-bancarios">
            <Button variant="outline" size="sm">
              <Building2 className="mr-2 h-4 w-4" /> Movimientos Bancarios
            </Button>
          </Link>
        }
      />

      <div className="bg-slate-50 border rounded-xl p-3 text-xs text-slate-500">
        Para crear una cuenta bancaria, importar el extracto CSV o registrar comisiones/cargos, ve a{' '}
        <Link href="/movimientos-bancarios" className="text-blue-600 underline">Movimientos Bancarios</Link>.
        Aquí solo se cuadra lo que ya está ahí contra tus asientos contables.
      </div>

      {/* Selector de cuenta */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-64">
          <Label className="text-xs">Cuenta bancaria</Label>
          <Select value={cuentaSel} onValueChange={setCuentaSel}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Seleccionar cuenta…" />
            </SelectTrigger>
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
        {cuentaSel && (
          <div className="text-sm">
            <p className="text-xs text-slate-400">Pendientes por conciliar</p>
            <p className="font-bold text-orange-600">{movsAgrupados.pendientes.length}</p>
          </div>
        )}
      </div>

      {!cuentaSel ? (
        <div className="bg-white rounded-xl border flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Selecciona una cuenta bancaria para ver sus movimientos</p>
          {cuentas.length === 0 && (
            <Link href="/movimientos-bancarios">
              <Button className="mt-4" size="sm">Crear primera cuenta bancaria</Button>
            </Link>
          )}
        </div>
      ) : (
        <Tabs defaultValue="pendientes">
          <TabsList>
            <TabsTrigger value="pendientes">
              Pendientes ({movsAgrupados.pendientes.length})
            </TabsTrigger>
            <TabsTrigger value="conciliados">
              Conciliados ({movsAgrupados.conciliados.length})
            </TabsTrigger>
            <TabsTrigger value="ignorados">
              Ignorados ({movsAgrupados.ignorados.length})
            </TabsTrigger>
          </TabsList>

          {(['pendientes', 'conciliados', 'ignorados'] as const).map(tab => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead className="text-center">Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}</TableRow>
                      ))
                    ) : movsAgrupados[tab].length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-slate-400">
                          No hay movimientos en esta categoría.
                        </TableCell>
                      </TableRow>
                    ) : movsAgrupados[tab].map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm text-slate-500">
                          {format((m.fecha as any)?.toDate?.() ?? new Date(m.fecha), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="text-sm max-w-64 truncate">{m.descripcion}</TableCell>
                        <TableCell className="text-xs font-mono text-slate-500">{m.referencia ?? '—'}</TableCell>
                        <TableCell className="text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            m.tipo === 'credito'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {m.tipo === 'credito' ? '+ Crédito' : '− Débito'}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${
                          m.tipo === 'credito' ? 'text-green-700' : 'text-red-600'
                        }`}>
                          {m.tipo === 'credito' ? '+' : '-'}{currency(m.monto)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-500">
                          {m.saldo != null ? currency(m.saldo) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {tab === 'pendientes' && (
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => abrirConciliar(m)}>
                                <Check className="h-3 w-3 mr-1" /> Conciliar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
                                onClick={() => handleIgnorar(m.id)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {tab === 'conciliados' && (
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-mono text-[10px] text-slate-500" title="Asiento contable">
                                {numeroAsiento(m.asientoId)}
                              </span>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
                                onClick={() => handleRevertir(m.id)}>
                                Revertir
                              </Button>
                            </div>
                          )}
                          {tab === 'ignorados' && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
                              onClick={() => handleRevertir(m.id)}>
                              Revertir
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Dialog conciliar: elegir el asiento contable que corresponde al movimiento */}
      <Dialog open={dlgConciliar} onOpenChange={setDlgConciliar}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conciliar movimiento</DialogTitle>
          </DialogHeader>
          {movConciliar && (
            <div className="space-y-3">
              <div className="bg-slate-50 border rounded-lg p-3 text-sm flex flex-wrap gap-4">
                <span><strong>Fecha:</strong> {format((movConciliar.fecha as any)?.toDate?.() ?? new Date(movConciliar.fecha), 'dd/MM/yyyy')}</span>
                <span><strong>Detalle:</strong> {movConciliar.descripcion}</span>
                <span className={movConciliar.tipo === 'credito' ? 'text-green-700' : 'text-red-600'}>
                  <strong>{movConciliar.tipo === 'credito' ? '+ Crédito' : '− Débito'}:</strong> {currency(movConciliar.monto)}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Asientos que afectan la cuenta <span className="font-mono">{cuentaSelObj?.cuentaContableCodigo}</span>.
                Ordenados por coincidencia de monto.
              </p>
              {asientosCandidatos.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No hay asientos sin conciliar que afecten esta cuenta. Registra primero el movimiento
                  (pago, cobro, comisión bancaria…) o revisa Contabilidad → Asientos.
                </div>
              ) : (
                <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                  {asientosCandidatos.map(({ asiento, montoLinea, dif }) => (
                    <button key={asiento.id}
                      onClick={() => handleConciliar(asiento.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{asiento.concepto}</p>
                        <p className="text-xs text-slate-400">
                          {asiento.numero} · {format((asiento.fecha as any)?.toDate?.() ?? new Date(asiento.fecha), 'dd/MM/yyyy')}
                        </p>
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
    </div>
  );
}
