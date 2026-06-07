'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { Plus, Upload, Check, X, Eye, Building2 } from 'lucide-react';
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

import { CuentaBancaria, MovimientoBancario } from '@/types';
import {
  subscribeToCuentasBancarias, createCuentaBancaria,
  subscribeToMovimientosBancarios, importarMovimientosBancarios,
  conciliarMovimiento, ignorarMovimiento, revertirConciliacion,
} from '@/lib/firebase/cuentas-bancarias';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;

export default function ConciliacionBancariaPage() {
  const { user } = useAuth();
  const [cuentas,   setCuentas]   = useState<CuentaBancaria[]>([]);
  const [cuentaSel, setCuentaSel] = useState<string>('');
  const [movs,      setMovs]      = useState<MovimientoBancario[]>([]);
  const [loading,   setLoading]   = useState(false);

  // Dialog nueva cuenta
  const [dlgCuenta,  setDlgCuenta]  = useState(false);
  const [formCuenta, setFormCuenta] = useState({
    banco: '', tipoCuenta: 'corriente' as 'corriente' | 'ahorros',
    numeroCuenta: '', titular: '', saldoInicial: '', moneda: 'USD',
  });

  // Importar movimientos CSV
  const fileRef  = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const unsub = subscribeToCuentasBancarias(setCuentas);
    return unsub;
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
  }), [movs]);

  const saldoCalculado = useMemo(() => {
    if (!cuentaSelObj) return 0;
    const suma = movs.filter(m => m.estado !== 'ignorado').reduce((s, m) => {
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
      await createCuentaBancaria({
        ...formCuenta,
        saldoInicial: parseFloat(formCuenta.saldoInicial) || 0,
        activa: true,
      });
      toast.success('Cuenta bancaria creada');
      setDlgCuenta(false);
      setFormCuenta({ banco: '', tipoCuenta: 'corriente', numeroCuenta: '', titular: '', saldoInicial: '', moneda: 'USD' });
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

  const handleConciliar = async (movId: string) => {
    try {
      // En producción, se abriría un diálogo para seleccionar el asiento
      await conciliarMovimiento(movId, 'manual');
      toast.success('Movimiento conciliado');
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
            <div>
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
          </TabsList>

          {(['pendientes', 'conciliados', 'ignorados'] as const).map(tab => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <div className="bg-white rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-center">Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}</TableRow>
                      ))
                    ) : movsAgrupados[tab].length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-slate-400">
                          No hay movimientos en esta categoría.
                        </TableCell>
                      </TableRow>
                    ) : movsAgrupados[tab].map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm text-slate-500">
                          {format((m.fecha as any)?.toDate?.() ?? new Date(m.fecha), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="text-sm max-w-64 truncate">{m.descripcion}</TableCell>
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
                                onClick={() => handleConciliar(m.id)}>
                                <Check className="h-3 w-3 mr-1" /> Conciliar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400"
                                onClick={() => handleIgnorar(m.id)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {(tab === 'conciliados' || tab === 'ignorados') && (
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
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgCuenta(false)}>Cancelar</Button>
            <Button onClick={handleCrearCuenta}>Crear cuenta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
