'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Lock, Unlock, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { PeriodoContable } from '@/types';
import {
  subscribeToPeriodos, createPeriodo, cerrarPeriodo, abrirPeriodo,
} from '@/lib/firebase/periodos-contables';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function PeriodosPage() {
  const [periodos,   setPeriodos]   = useState<PeriodoContable[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mesNuevo,   setMesNuevo]   = useState('1');
  const [anioNuevo,  setAnioNuevo]  = useState(String(new Date().getFullYear()));
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    return subscribeToPeriodos(d => { setPeriodos(d); setLoading(false); });
  }, []);

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
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Período</TableHead>
              <TableHead className="text-center">Año</TableHead>
              <TableHead className="text-center">Mes</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-32">Acción</TableHead>
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
    </div>
  );
}