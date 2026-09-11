'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { Plus, Upload, Building2, Receipt, Ban } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { CuentaBancaria, MovimientoBancario, CuentaContable } from '@/types';
import {
  subscribeToCuentasBancarias, createCuentaBancaria,
  subscribeToMovimientosBancarios, importarMovimientosBancarios,
  registrarMovimientoBancario, anularMovimientoBancario,
} from '@/lib/firebase/cuentas-bancarias';
import { subscribeToCuentas }  from '@/lib/firebase/plan-cuentas';
import { crearAsientoMovimientoBancario, crearAsientoReversion } from '@/lib/contabilidad/motor-asientos';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;

const ESTADO_LABEL: Record<string, string> = {
  no_conciliado: 'Pendiente', conciliado: 'Conciliado', ignorado: 'Ignorado', anulado: 'Anulado',
};
const ESTADO_COLOR: Record<string, string> = {
  no_conciliado: 'bg-amber-100 text-amber-700', conciliado: 'bg-green-100 text-green-700',
  ignorado: 'bg-slate-100 text-slate-500', anulado: 'bg-red-100 text-red-500',
};

export default function MovimientosBancariosPage() {
  const { user } = useAuth();
  const [cuentas,   setCuentas]   = useState<CuentaBancaria[]>([]);
  const [cuentaSel, setCuentaSel] = useState<string>('');
  const [movs,      setMovs]      = useState<MovimientoBancario[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const [planCuentas, setPlanCuentas] = useState<CuentaContable[]>([]);

  // Dialog nueva cuenta
  const [dlgCuenta,  setDlgCuenta]  = useState(false);
  const [formCuenta, setFormCuenta] = useState({
    banco: '', tipoCuenta: 'corriente' as 'corriente' | 'ahorros',
    numeroCuenta: '', titular: '', saldoInicial: '', moneda: 'USD',
    cuentaContableCodigo: '',
  });

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

  const movsFiltrados = useMemo(() => {
    if (filtroEstado === 'todos') return movs;
    return movs.filter(m => m.estado === filtroEstado);
  }, [movs, filtroEstado]);

  const saldoCalculado = useMemo(() => {
    if (!cuentaSelObj) return 0;
    return movs.filter(m => m.estado !== 'ignorado' && m.estado !== 'anulado').reduce((s, m) => {
      return m.tipo === 'credito' ? s + m.monto : s - m.monto;
    }, cuentaSelObj.saldoInicial);
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
      // Formato esperado: fecha,descripcion,tipo,monto,saldo,referencia
      // tipo: credito o debito — referencia (n° de comprobante/documento) es opcional
      const nuevosMovs: Omit<MovimientoBancario, 'id' | 'createdAt'>[] = [];
      for (const line of lines.slice(1)) { // skip header
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        if (cols.length < 4) continue;
        const [fechaStr, descripcion, tipo, montoStr, saldoStr, referenciaStr] = cols;
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
          ...(saldoStr ? { saldo: parseFloat(saldoStr) } : {}),
          ...(referenciaStr ? { referencia: referenciaStr } : {}),
          estado:'no_conciliado',
        });
      }
      if (nuevosMovs.length === 0) {
        toast.error('No se encontraron movimientos válidos en el archivo');
        return;
      }
      await importarMovimientosBancarios(nuevosMovs);
      toast.success(`${nuevosMovs.length} movimientos importados — ve a Conciliación Bancaria para cuadrarlos con la contabilidad`);
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
        estado: 'conciliado',
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
        const { conciliarMovimiento } = await import('@/lib/firebase/cuentas-bancarias');
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Movimientos Bancarios"
        description="Registro de todo lo que entra y sale de tus cuentas bancarias — comisiones, cargos, depósitos, extractos importados"
        action={
          <Button size="sm" onClick={() => setDlgCuenta(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva Cuenta
          </Button>
        }
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        Aquí registras e importas los movimientos de cada cuenta bancaria. Para cuadrarlos contra tus asientos
        contables (pagos, cobros, ventas), ve a <strong>Conciliación Bancaria</strong>.
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
          <>
            <div className="text-sm">
              <p className="text-xs text-slate-400">Saldo calculado</p>
              <p className="font-bold text-slate-800">{currency(saldoCalculado)}</p>
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
          Formato CSV esperado: <code className="font-mono bg-white px-1 py-0.5 rounded border">fecha,descripcion,tipo,monto,saldo,referencia</code>
          &nbsp;— tipo: <em>credito</em> o <em>debito</em> — fecha: dd/MM/yyyy — saldo y referencia (n° de comprobante) son opcionales
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
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-slate-700">Movimientos</p>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="no_conciliado">Pendientes</SelectItem>
                <SelectItem value="conciliado">Conciliados</SelectItem>
                <SelectItem value="ignorado">Ignorados</SelectItem>
                <SelectItem value="anulado">Anulados</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}</TableRow>
                  ))
                ) : movsFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-slate-400">
                      No hay movimientos en esta categoría.
                    </TableCell>
                  </TableRow>
                ) : movsFiltrados.map(m => (
                  <TableRow key={m.id} className={m.estado === 'anulado' ? 'opacity-50' : ''}>
                    <TableCell className="text-sm text-slate-500">
                      {format((m.fecha as any)?.toDate?.() ?? new Date(m.fecha), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className={`text-sm max-w-64 truncate ${m.estado === 'anulado' ? 'line-through' : ''}`}>{m.descripcion}</TableCell>
                    <TableCell className="text-xs font-mono text-slate-500">{m.referencia ?? '—'}</TableCell>
                    <TableCell className="text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.tipo === 'credito' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
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
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[m.estado] ?? ''}`}>
                        {ESTADO_LABEL[m.estado] ?? m.estado}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {m.estado !== 'anulado' && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                          title="Anular" onClick={() => handleAnularMov(m)}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
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
