'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { Plus, Upload, Check, X, Eye, Building2, Receipt, Ban } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { CuentaBancaria, MovimientoBancario, AsientoContable, CuentaContable } from '@/types';
import {
  subscribeToCuentasBancarias, createCuentaBancaria,
  subscribeToMovimientosBancarios, importarMovimientosBancarios,
  conciliarMovimiento, ignorarMovimiento, revertirConciliacion,
  registrarMovimientoBancario, anularMovimientoBancario,
} from '@/lib/firebase/cuentas-bancarias';
import { subscribeToAsientos } from '@/lib/firebase/asientos';
import { subscribeToCuentas }  from '@/lib/firebase/plan-cuentas';
import { crearAsientoMovimientoBancario, crearAsientoReversion } from '@/lib/contabilidad/motor-asientos';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;

export default function ConciliacionBancariaPage() {
  const { user } = useAuth();
  const [cuentas,   setCuentas]   = useState<CuentaBancaria[]>([]);
  const [cuentaSel, setCuentaSel] = useState<string>('');
  const [movs,      setMovs]      = useState<MovimientoBancario[]>([]);
  const [loading,   setLoading]   = useState(false);

  // Plan de cuentas + asientos (para conciliar contra el libro contable)
  const [planCuentas, setPlanCuentas] = useState<CuentaContable[]>([]);
  const [asientos,    setAsientos]    = useState<AsientoContable[]>([]);

  // Dialog nueva cuenta
  const [dlgCuenta,  setDlgCuenta]  = useState(false);
  const [formCuenta, setFormCuenta] = useState({
    banco: '', tipoCuenta: 'corriente' as 'corriente' | 'ahorros',
    numeroCuenta: '', titular: '', saldoInicial: '', moneda: 'USD',
    cuentaContableCodigo: '',
  });

  // Dialog de conciliación (elegir asiento)
  const [dlgConciliar, setDlgConciliar] = useState(false);
  const [movConciliar, setMovConciliar] = useState<MovimientoBancario | null>(null);

  // Importar movimientos CSV
  const fileRef  = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Dialog registrar movimiento bancario directo (comisión, cargo, interés…)
  const [dlgMov, setDlgMov] = useState(false);
  const [savingMov, setSavingMov] = useState(false);
  const [formMov, setFormMov] = useState({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    concepto: '', monto: '', referencia: '',
    tipo: 'cargo' as 'cargo' | 'abono',
    cuentaContrapartidaCodigo: '',
  });

  useEffect(() => {
    const u1 = subscribeToCuentasBancarias(setCuentas);
    const u2 = subscribeToCuentas(setPlanCuentas);
    const u3 = subscribeToAsientos(setAsientos, 100000);
    return () => { u1(); u2(); u3(); };
  }, []);

  useEffect(() => {
    if (!cuentaSel) return;
    setLoading(true);
    const unsub = subscribeToMovimientosBancarios(cuentaSel, d => {
      setMovs(d);
      setLoading(false);
    });
    return unsub;
  }, [cuentaSel]);

  const cuentaSelObj = useMemo(() => cuentas.find(c => c.id === cuentaSel) ?? null, [cuentas, cuentaSel]);

  const movsAgrupados = useMemo(() => ({
    pendientes: movs.filter(m => m.estado === 'no_conciliado'),
    conciliados:movs.filter(m => m.estado === 'conciliado'),
    ignorados:  movs.filter(m => m.estado === 'ignorado'),
    anulados:   movs.filter(m => m.estado === 'anulado'),
  }), [movs]);

  const saldoCalculado = useMemo(() => {
    if (!cuentaSelObj) return 0;
    const suma = movs.filter(m => m.estado !== 'ignorado' && m.estado !== 'anulado').reduce((s, m) => {
      return m.tipo === 'credito' ? s + m.monto : s - m.monto;
    }, cuentaSelObj.saldoInicial);
    return suma;
  }, [movs, cuentaSelObj]);

  // Crear cuenta bancaria
  const handleCrearCuenta = async () => {
    if (!formCuenta.banco || !formCuenta.numeroCuenta) {
      toast.error('Banco y número de cuenta son requeridos');
      return;
    }
    try {
      const ctaContable = planCuentas.find(c => c.codigo === formCuenta.cuentaContableCodigo);
      await createCuentaBancaria({
        banco:        formCuenta.banco,
        tipoCuenta:   formCuenta.tipoCuenta,
        numeroCuenta: formCuenta.numeroCuenta,
        titular:      formCuenta.titular,
        moneda:       formCuenta.moneda,
        saldoInicial: parseFloat(formCuenta.saldoInicial) || 0,
        cuentaContableCodigo: ctaContable?.codigo,
        cuentaContableNombre: ctaContable?.nombre,
        activa: true,
      });
      toast.success('Cuenta bancaria creada');
      setDlgCuenta(false);
      setFormCuenta({ banco: '', tipoCuenta: 'corriente', numeroCuenta: '', titular: '', saldoInicial: '', moneda: 'USD', cuentaContableCodigo: '' });
    } catch (e: any) {
      toast.error(e.message ?? 'Error al crear cuenta');
    }
  };

  // Importar CSV del banco
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cuentaSel) return;
    setImporting(true);
    try {
      const text  = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      // Formato esperado: fecha,descripcion,tipo,monto,saldo
      // tipo: credito o debito
      const nuevosMovs: Omit<MovimientoBancario, 'id' | 'createdAt'>[] = [];
      for (const line of lines.slice(1)) { // skip header
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        if (cols.length < 4) continue;
        const [fechaStr, descripcion, tipo, montoStr, saldoStr] = cols;
        const partes = fechaStr.split('/');
        const fecha  = partes.length === 3
          ? new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]))
          : new Date(fechaStr);
        if (isNaN(fecha.getTime())) continue;
        nuevosMovs.push({
          cuentaBancariaId: cuentaSel,
          fecha,
          descripcion,
          tipo:  (tipo.toLowerCase().includes('cred') ? 'credito' : 'debito') as 'credito' | 'debito',
          monto: Math.abs(parseFloat(montoStr) || 0),
          saldo: saldoStr ? parseFloat(saldoStr) : undefined,
          estado:'no_conciliado',
        });
      }
      if (nuevosMovs.length === 0) {
        toast.error('No se encontraron movimientos válidos en el archivo');
        return;
      }
      await importarMovimientosBancarios(nuevosMovs);
      toast.success(`${nuevosMovs.length} movimientos importados`);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al importar CSV');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Registrar movimiento bancario directo (comisión, cargo, interés ganado…)
  const handleRegistrarMov = async () => {
    if (!user || !cuentaSelObj?.cuentaContableCodigo) return;
    const monto = parseFloat(formMov.monto) || 0;
    if (!formMov.concepto.trim())         { toast.error('Ingresa el concepto'); return; }
    if (!formMov.fecha)                   { toast.error('Ingresa la fecha'); return; }
    if (monto <= 0)                       { toast.error('El monto debe ser mayor a 0'); return; }
    if (!formMov.cuentaContrapartidaCodigo) { toast.error('Selecciona la cuenta contable de contrapartida'); return; }

    setSavingMov(true);
    try {
      const fecha = new Date(formMov.fecha + 'T12:00:00');
      const movId = await registrarMovimientoBancario({
        cuentaBancariaId: cuentaSel,
        fecha,
        descripcion: formMov.concepto.trim(),
        tipo:   formMov.tipo === 'cargo' ? 'debito' : 'credito',
        monto,
        ...(formMov.referencia.trim() ? { referencia: formMov.referencia.trim() } : {}),
        estado: 'no_conciliado',
      });

      const asientoId = await crearAsientoMovimientoBancario({
        movId, fecha,
        concepto: formMov.concepto.trim(),
        monto,
        cuentaBancoCodigo:         cuentaSelObj.cuentaContableCodigo,
        cuentaContrapartidaCodigo: formMov.cuentaContrapartidaCodigo,
        tipo: formMov.tipo,
        usuarioId: user.uid, usuarioNombre: user.nombre,
      });

      if (asientoId) {
        await conciliarMovimiento(movId, asientoId);
        toast.success('Movimiento bancario registrado y contabilizado');
      } else {
        toast.warning('El movimiento se registró, pero el asiento contable NO se pudo generar. Revísalo en Contabilidad → Libro Diario.', { duration: 12000 });
      }
      setDlgMov(false);
      setFormMov({ fecha: format(new Date(), 'yyyy-MM-dd'), concepto: '', monto: '', referencia: '', tipo: 'cargo', cuentaContrapartidaCodigo: '' });
    } catch (e: any) {
      toast.error(e.message ?? 'Error al registrar el movimiento');
    } finally {
      setSavingMov(false);
    }
  };

  // Anular un movimiento bancario (revierte su asiento si fue creado con "Comisión/Cargo";
  // si el movimiento se concilió con el asiento de un pago/cobro/venta, no se toca desde aquí).
  const handleAnularMov = async (mov: MovimientoBancario) => {
    if (!user) return;
    if (!window.confirm(`¿Anular el movimiento "${mov.descripcion}" de ${currency(mov.monto)}?`)) return;
    try {
      if (mov.asientoId) {
        const rev = await crearAsientoReversion({
          referenciaId: mov.id, referenciaTipo: 'movimiento_bancario',
          fecha: new Date(), concepto: `Anulación: ${mov.descripcion}`,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        if (!rev.ok) {
          toast.error(`No se pudo anular desde aquí (${rev.advertencia}). Si es un pago, cobro o venta, anúlalo desde esa pantalla — ahí se revierte su asiento correctamente.`, { duration: 12000 });
          return;
        }
      }
      await anularMovimientoBancario(mov.id);
      toast.success('Movimiento bancario anulado' + (mov.asientoId ? ' y asiento revertido' : ''));
    } catch (e: any) {
      toast.error(e.message ?? 'Error al anular el movimiento');
    }
  };

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
      toast.error('Primero vincula esta cuenta bancaria a una cuenta contable (editando la cuenta).');
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
        description="Gestión de cuentas bancarias y conciliación con asientos contables"
        action={
          <Button size="sm" onClick={() => setDlgCuenta(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva Cuenta
          </Button>
        }
      />

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
          <>
            <div className="text-sm">
              <p className="text-xs text-slate-400">Saldo calculado</p>
              <p className="font-bold text-slate-800">{currency(saldoCalculado)}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-slate-400">Pendientes</p>
              <p className="font-bold text-orange-600">{movsAgrupados.pendientes.length}</p>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImportCSV}
              />
              <Button variant="outline" size="sm" disabled={importing}
                onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {importing ? 'Importando…' : 'Importar CSV'}
              </Button>
              <Button variant="outline" size="sm"
                disabled={!cuentaSelObj?.cuentaContableCodigo}
                title={!cuentaSelObj?.cuentaContableCodigo ? 'Primero vincula esta cuenta a una cuenta contable' : undefined}
                onClick={() => setDlgMov(true)}>
                <Receipt className="mr-2 h-4 w-4" /> Comisión / Cargo
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Formato CSV info */}
      {cuentaSel && (
        <div className="bg-slate-50 border rounded-xl p-3 text-xs text-slate-500">
          Formato CSV esperado: <code className="font-mono bg-white px-1 py-0.5 rounded border">fecha,descripcion,tipo,monto,saldo</code>
          &nbsp;— tipo: <em>credito</em> o <em>debito</em> — fecha: dd/MM/yyyy
        </div>
      )}

      {!cuentaSel ? (
        <div className="bg-white rounded-xl border flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Selecciona una cuenta bancaria para ver sus movimientos</p>
          {cuentas.length === 0 && (
            <Button className="mt-4" size="sm" onClick={() => setDlgCuenta(true)}>
              Crear primera cuenta bancaria
            </Button>
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
            <TabsTrigger value="anulados">
              Anulados ({movsAgrupados.anulados.length})
            </TabsTrigger>
          </TabsList>

          {(['pendientes', 'conciliados', 'ignorados', 'anulados'] as const).map(tab => (
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
                      <TableRow key={m.id} className={tab === 'anulados' ? 'opacity-50' : ''}>
                        <TableCell className="text-sm text-slate-500">
                          {format((m.fecha as any)?.toDate?.() ?? new Date(m.fecha), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className={`text-sm max-w-64 truncate ${tab === 'anulados' ? 'line-through' : ''}`}>{m.descripcion}</TableCell>
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
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                                title="Anular" onClick={() => handleAnularMov(m)}>
                                <Ban className="h-3.5 w-3.5" />
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
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                                title="Anular (revierte el asiento)" onClick={() => handleAnularMov(m)}>
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                          {tab === 'ignorados' && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
                              onClick={() => handleRevertir(m.id)}>
                              Revertir
                            </Button>
                          )}
                          {tab === 'anulados' && (
                            <span className="text-xs text-slate-400">Anulado</span>
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

      {/* Dialog nueva cuenta */}
      <Dialog open={dlgCuenta} onOpenChange={setDlgCuenta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Cuenta Bancaria</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Banco *</Label>
              <Input value={formCuenta.banco}
                onChange={e => setFormCuenta(f => ({ ...f, banco: e.target.value }))}
                placeholder="Ej: Banco Pichincha" className="mt-1" />
            </div>
            <div>
              <Label>Tipo de cuenta</Label>
              <Select value={formCuenta.tipoCuenta}
                onValueChange={v => setFormCuenta(f => ({ ...f, tipoCuenta: v as 'corriente'|'ahorros' }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corriente">Corriente</SelectItem>
                  <SelectItem value="ahorros">Ahorros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Número de cuenta *</Label>
              <Input value={formCuenta.numeroCuenta}
                onChange={e => setFormCuenta(f => ({ ...f, numeroCuenta: e.target.value }))}
                className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Titular</Label>
              <Input value={formCuenta.titular}
                onChange={e => setFormCuenta(f => ({ ...f, titular: e.target.value }))}
                className="mt-1" />
            </div>
            <div>
              <Label>Saldo inicial ($)</Label>
              <Input type="number" step="0.01" value={formCuenta.saldoInicial}
                onChange={e => setFormCuenta(f => ({ ...f, saldoInicial: e.target.value }))}
                className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Cuenta contable vinculada *</Label>
              <Select value={formCuenta.cuentaContableCodigo}
                onValueChange={v => setFormCuenta(f => ({ ...f, cuentaContableCodigo: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecciona la cuenta de bancos del plan…" />
                </SelectTrigger>
                <SelectContent>
                  {planCuentas
                    .filter(c => c.aceptaMovimientos && c.tipo === 'activo')
                    .map(c => (
                      <SelectItem key={c.id} value={c.codigo}>
                        <span className="font-mono text-xs">{c.codigo}</span> · {c.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                Permite conciliar los movimientos del extracto contra los asientos que afectan esta cuenta.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgCuenta(false)}>Cancelar</Button>
            <Button onClick={handleCrearCuenta}>Crear cuenta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  (pago, cobro, comisión bancaria…) en Contabilidad → Asientos.
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

      {/* Dialog registrar comisión / cargo / interés bancario */}
      <Dialog open={dlgMov} onOpenChange={setDlgMov}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Comisión / Cargo Bancario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo de movimiento *</Label>
              <Select value={formMov.tipo}
                onValueChange={v => setFormMov(f => ({ ...f, tipo: v as 'cargo' | 'abono' }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cargo">Cargo / Comisión (disminuye el saldo del banco)</SelectItem>
                  <SelectItem value="abono">Abono / Interés ganado (aumenta el saldo del banco)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Concepto *</Label>
              <Input value={formMov.concepto}
                onChange={e => setFormMov(f => ({ ...f, concepto: e.target.value }))}
                placeholder="Ej: Comisión mantenimiento de cuenta" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha *</Label>
                <Input type="date" value={formMov.fecha}
                  onChange={e => setFormMov(f => ({ ...f, fecha: e.target.value }))}
                  max={new Date().toISOString().split('T')[0]} className="mt-1" />
              </div>
              <div>
                <Label>Monto *</Label>
                <Input type="number" min="0" step="0.01" value={formMov.monto}
                  onChange={e => setFormMov(f => ({ ...f, monto: e.target.value }))}
                  placeholder="0.00" className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Referencia / N° comprobante</Label>
              <Input value={formMov.referencia}
                onChange={e => setFormMov(f => ({ ...f, referencia: e.target.value }))}
                placeholder="Opcional — n° de nota de débito del banco, etc." className="mt-1" />
            </div>
            <div>
              <Label>Cuenta contable de contrapartida *</Label>
              <Select value={formMov.cuentaContrapartidaCodigo}
                onValueChange={v => setFormMov(f => ({ ...f, cuentaContrapartidaCodigo: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={formMov.tipo === 'cargo' ? 'Cuenta de gasto (ej. Gastos Bancarios)…' : 'Cuenta de ingreso (ej. Intereses Ganados)…'} />
                </SelectTrigger>
                <SelectContent>
                  {planCuentas
                    .filter(c => c.aceptaMovimientos && c.tipo === (formMov.tipo === 'cargo' ? 'gasto' : 'ingreso'))
                    .map(c => (
                      <SelectItem key={c.id} value={c.codigo}>
                        <span className="font-mono text-xs">{c.codigo}</span> · {c.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">
                {formMov.tipo === 'cargo'
                  ? 'Ej: comisiones de mantenimiento, cargos por transferencia, IVA sobre comisión.'
                  : 'Ej: interés ganado por saldo en la cuenta.'}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
              Se creará el movimiento en <strong>{cuentaSelObj?.banco}</strong> ya conciliado con su propio asiento contable
              (no necesitas conciliarlo manualmente después).
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgMov(false)}>Cancelar</Button>
            <Button onClick={handleRegistrarMov} disabled={savingMov}>
              {savingMov ? 'Registrando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
