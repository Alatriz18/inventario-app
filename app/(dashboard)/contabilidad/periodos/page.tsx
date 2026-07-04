'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Lock, Unlock, Receipt, BookOpen, BookMarked } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { PeriodoContable, AsientoContable, CuentaContable } from '@/types';
import {
  subscribeToPeriodos, createPeriodo, cerrarPeriodo, abrirPeriodo,
} from '@/lib/firebase/periodos-contables';
import { subscribeToAsientos } from '@/lib/firebase/asientos';
import { subscribeToCuentas }  from '@/lib/firebase/plan-cuentas';
import {
  crearAsientoApertura, crearAsientoCierre, LineaApertura,
} from '@/lib/contabilidad/motor-asientos';
import { useAuth } from '@/context/AuthContext';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface LineaAperturaForm { codigoCuenta: string; debe: string; haber: string; }

export default function PeriodosPage() {
  const { user }  = useAuth();
  const [periodos,   setPeriodos]   = useState<PeriodoContable[]>([]);
  const [asientos,   setAsientos]   = useState<AsientoContable[]>([]);
  const [cuentas,    setCuentas]    = useState<CuentaContable[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mesNuevo,   setMesNuevo]   = useState('1');
  const [anioNuevo,  setAnioNuevo]  = useState(String(new Date().getFullYear()));
  const [saving,     setSaving]     = useState(false);

  // Asiento de apertura
  const [aperturaOpen,  setAperturaOpen]  = useState(false);
  const [periodoSel,    setPeriodoSel]    = useState<PeriodoContable | null>(null);
  const [lineasApertura, setLineasApertura] = useState<LineaAperturaForm[]>([
    { codigoCuenta: '', debe: '', haber: '' },
  ]);
  const [savingApertura, setSavingApertura] = useState(false);

  // Asiento de cierre
  const [cierreOpen,    setCierreOpen]    = useState(false);
  const [totalIngresos, setTotalIngresos] = useState('');
  const [totalGastos,   setTotalGastos]   = useState('');
  const [savingCierre,  setSavingCierre]  = useState(false);

  useEffect(() => {
    const u1 = subscribeToPeriodos(d => { setPeriodos(d); setLoading(false); });
    const u2 = subscribeToAsientos(setAsientos, 100000);
    const u3 = subscribeToCuentas(setCuentas);
    return () => { u1(); u2(); u3(); };
  }, []);

  /** Calcula ingresos y gastos+costos de un período a partir de los asientos. */
  const calcularResultadoPeriodo = (p: PeriodoContable) => {
    const inicio = new Date(p.anio, p.mes - 1, 1);
    const fin    = new Date(p.anio, p.mes, 0, 23, 59, 59);
    let ingresos = 0, gastos = 0;
    asientos.forEach(a => {
      const f = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
      if (f < inicio || f > fin) return;
      if (a.tipo === 'cierre' || a.tipo === 'apertura') return; // no recursivo
      a.lineas.forEach(l => {
        const cuenta = cuentas.find(c => c.codigo === l.cuentaCodigo);
        if (!cuenta) return;
        if (cuenta.tipo === 'ingreso')                       ingresos += l.haber - l.debe;
        else if (cuenta.tipo === 'gasto' || cuenta.tipo === 'costo') gastos += l.debe - l.haber;
      });
    });
    return { ingresos: Math.max(0, ingresos), gastos: Math.max(0, gastos) };
  };

  const openCierre = (p: PeriodoContable) => {
    setPeriodoSel(p);
    const { ingresos, gastos } = calcularResultadoPeriodo(p);
    setTotalIngresos(ingresos.toFixed(2));
    setTotalGastos(gastos.toFixed(2));
    setCierreOpen(true);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createPeriodo(Number(anioNuevo), Number(mesNuevo));
      toast.success('Período creado');
      setDialogOpen(false);
    } catch { toast.error('Error al crear período'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (p: PeriodoContable) => {
    try {
      if (p.estado === 'abierto') {
        await cerrarPeriodo(p.id, p.anio, p.mes);
        toast.success(`Período ${p.nombre} cerrado — asientos bloqueados`);
      } else {
        await abrirPeriodo(p.id, p.anio, p.mes);
        toast.success(`Período ${p.nombre} reabierto — asientos desbloqueados`);
      }
    } catch { toast.error('Error al cambiar estado'); }
  };

  const handleApertura = async () => {
    if (!user || !periodoSel) return;
    const lineas: LineaApertura[] = lineasApertura
      .filter(l => l.codigoCuenta)
      .map(l => ({
        cuentaCodigo: l.codigoCuenta,
        debe:         parseFloat(l.debe)  || 0,
        haber:        parseFloat(l.haber) || 0,
      }));
    if (lineas.length === 0) { toast.error('Agrega al menos una línea'); return; }
    const sumDebe  = lineas.reduce((s, l) => s + l.debe,  0);
    const sumHaber = lineas.reduce((s, l) => s + l.haber, 0);
    if (Math.abs(sumDebe - sumHaber) > 0.01) {
      toast.error(`El asiento no cuadra — Debe: $${sumDebe.toFixed(2)} / Haber: $${sumHaber.toFixed(2)}`);
      return;
    }
    setSavingApertura(true);
    try {
      await crearAsientoApertura({
        periodoId:    periodoSel.id,
        fecha:        new Date(periodoSel.anio, periodoSel.mes - 1, 1),
        anio:         periodoSel.anio,
        lineas,
        usuarioId:    user.uid,
        usuarioNombre:user.nombre,
      });
      toast.success('Asiento de apertura creado');
      setAperturaOpen(false);
      setLineasApertura([{ codigoCuenta: '', debe: '', haber: '' }]);
    } catch { toast.error('Error al crear asiento de apertura'); }
    finally { setSavingApertura(false); }
  };

  const handleCierre = async () => {
    if (!user || !periodoSel) return;
    const ingresos = parseFloat(totalIngresos) || 0;
    const gastos   = parseFloat(totalGastos)   || 0;
    setSavingCierre(true);
    try {
      await crearAsientoCierre({
        periodoId:     periodoSel.id,
        fecha:         new Date(periodoSel.anio, periodoSel.mes - 1, 28),
        anio:          periodoSel.anio,
        totalIngresos: ingresos,
        totalGastos:   gastos,
        utilidad:      parseFloat((ingresos - gastos).toFixed(2)),
        usuarioId:     user.uid,
        usuarioNombre: user.nombre,
      });
      toast.success('Asiento de cierre creado');
      setCierreOpen(false);
      setTotalIngresos(''); setTotalGastos('');
    } catch { toast.error('Error al crear asiento de cierre'); }
    finally { setSavingCierre(false); }
  };

  const anios = Array.from({length: 5}, (_, i) => String(new Date().getFullYear() - 2 + i));

  return (
    <div>
      <PageHeader
        title="Períodos Contables"
        description="Gestiona los períodos de contabilidad — apertura y cierre mensual"
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo Período
          </Button>
        }
      />

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Período</TableHead>
              <TableHead className="text-center">Año</TableHead>
              <TableHead className="text-center">Mes</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center">Asiento</TableHead>
              <TableHead className="text-center w-32">Abrir/Cerrar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({length:4}).map((_,i) => (
                <TableRow key={i}>{Array.from({length:5}).map((_,j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : periodos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                  <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay períodos. Crea el período actual.</p>
                </TableCell>
              </TableRow>
            ) : periodos.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-semibold">{p.nombre}</TableCell>
                <TableCell className="text-center">{p.anio}</TableCell>
                <TableCell className="text-center">{MESES[p.mes - 1]}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={p.estado === 'abierto' ? 'default' : 'secondary'}>
                    {p.estado === 'abierto' ? '🟢 Abierto' : '🔒 Cerrado'}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="sm"
                      className="text-blue-600 hover:text-blue-700 h-7 px-2 text-xs"
                      onClick={() => { setPeriodoSel(p); setAperturaOpen(true); }}>
                      <BookOpen className="mr-1 h-3 w-3" /> Apertura
                    </Button>
                    <Button variant="ghost" size="sm"
                      className="text-purple-600 hover:text-purple-700 h-7 px-2 text-xs"
                      onClick={() => openCierre(p)}>
                      <BookMarked className="mr-1 h-3 w-3" /> Cierre
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(p)}
                    className={p.estado === 'abierto' ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}>
                    {p.estado === 'abierto'
                      ? <><Lock className="mr-1 h-3.5 w-3.5" /> Cerrar</>
                      : <><Unlock className="mr-1 h-3.5 w-3.5" /> Abrir</>}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nuevo Período Contable</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Año</label>
              <Select onValueChange={setAnioNuevo} defaultValue={anioNuevo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anios.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mes</label>
              <Select onValueChange={setMesNuevo} defaultValue={mesNuevo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => (
                    <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creando...' : 'Crear Período'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Asiento Apertura */}
      <Dialog open={aperturaOpen} onOpenChange={setAperturaOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asiento de Apertura — {periodoSel?.nombre}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            Ingresa los saldos iniciales de las cuentas (activos, pasivos, patrimonio).
            El asiento debe cuadrar (Debe = Haber).
          </p>
          <div className="space-y-2">
            {lineasApertura.map((l, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                <div className="col-span-2 space-y-1">
                  {i === 0 && <Label className="text-xs">Código de Cuenta</Label>}
                  <Input className="h-8 text-sm" value={l.codigoCuenta}
                    onChange={e => setLineasApertura(prev => prev.map((x, idx) => idx === i ? {...x, codigoCuenta: e.target.value} : x))}
                    placeholder="1.1.01.01" />
                </div>
                <div className="space-y-1">
                  {i === 0 && <Label className="text-xs">Debe</Label>}
                  <Input className="h-8 text-sm" type="number" step="0.01" value={l.debe}
                    onChange={e => setLineasApertura(prev => prev.map((x, idx) => idx === i ? {...x, debe: e.target.value} : x))}
                    placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  {i === 0 && <Label className="text-xs">Haber</Label>}
                  <Input className="h-8 text-sm" type="number" step="0.01" value={l.haber}
                    onChange={e => setLineasApertura(prev => prev.map((x, idx) => idx === i ? {...x, haber: e.target.value} : x))}
                    placeholder="0.00" />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() =>
              setLineasApertura(prev => [...prev, { codigoCuenta: '', debe: '', haber: '' }])}>
              + Agregar línea
            </Button>
            <div className="flex justify-between text-xs text-slate-600 pt-1 border-t">
              <span>Total Debe: <strong>${lineasApertura.reduce((s, l) => s + (parseFloat(l.debe)||0), 0).toFixed(2)}</strong></span>
              <span>Total Haber: <strong>${lineasApertura.reduce((s, l) => s + (parseFloat(l.haber)||0), 0).toFixed(2)}</strong></span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAperturaOpen(false)}>Cancelar</Button>
            <Button onClick={handleApertura} disabled={savingApertura}>
              {savingApertura ? 'Creando...' : 'Crear Asiento de Apertura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Asiento Cierre */}
      <Dialog open={cierreOpen} onOpenChange={setCierreOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Asiento de Cierre — {periodoSel?.nombre}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            Los totales se calcularon automáticamente desde los asientos del período.
            Puedes ajustarlos si es necesario antes de generar el asiento de cierre.
          </p>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Total Ingresos del período</Label>
              <Input type="number" step="0.01" value={totalIngresos}
                onChange={e => setTotalIngresos(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Total Gastos del período</Label>
              <Input type="number" step="0.01" value={totalGastos}
                onChange={e => setTotalGastos(e.target.value)} placeholder="0.00" />
            </div>
            {totalIngresos && totalGastos && (
              <div className={`p-3 rounded-lg text-sm font-semibold ${
                (parseFloat(totalIngresos)||0) >= (parseFloat(totalGastos)||0)
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                {(parseFloat(totalIngresos)||0) >= (parseFloat(totalGastos)||0) ? 'Utilidad' : 'Pérdida'}:&nbsp;
                ${Math.abs((parseFloat(totalIngresos)||0) - (parseFloat(totalGastos)||0)).toFixed(2)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCierreOpen(false)}>Cancelar</Button>
            <Button onClick={handleCierre} disabled={savingCierre}>
              {savingCierre ? 'Creando...' : 'Crear Asiento de Cierre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}