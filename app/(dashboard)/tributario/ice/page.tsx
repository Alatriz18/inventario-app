'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Coins, RefreshCw } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { ConfigICE } from '@/types';
import { subscribeToICE, createICE, updateICE, deleteICE, seedICE } from '@/lib/firebase/retenciones-config';

const schema = z.object({
  codigo:             z.string().min(1, 'Requerido'),
  descripcion:        z.string().min(1, 'Requerido'),
  tipoTarifa:         z.enum(['especifica','ad_valorem','mixta']),
  tarifaEspecifica:   z.coerce.number().optional(),
  tarifaAdValorem:    z.coerce.number().optional(),
  unidad:             z.string().optional(),
  activo:             z.boolean(),
});

type ICEForm = z.infer<typeof schema>;

export default function ICEPage() {
  const [items,      setItems]      = useState<ConfigICE[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [seeding,    setSeeding]    = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<ConfigICE | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<ICEForm>({ resolver: zodResolver(schema) as any });

  const tipoTarifa = watch('tipoTarifa');

  useEffect(() => {
    return subscribeToICE(d => { setItems(d); setLoading(false); });
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try { await seedICE(); toast.success('Tarifas ICE cargadas'); }
    catch { toast.error('Error'); }
    finally { setSeeding(false); }
  };

  const openCreate = () => {
    setEditing(null);
    reset({ codigo:'', descripcion:'', tipoTarifa:'ad_valorem', activo:true });
    setDialogOpen(true);
  };

  const openEdit = (item: ConfigICE) => {
    setEditing(item);
    reset({
      codigo:item.codigo, descripcion:item.descripcion, tipoTarifa:item.tipoTarifa,
      tarifaEspecifica:item.tarifaEspecifica, tarifaAdValorem:item.tarifaAdValorem,
      unidad:item.unidad, activo:item.activo,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: ICEForm) => {
    setSaving(true);
    try {
      if (editing) { await updateICE(editing.id, data); toast.success('ICE actualizado'); }
      else { await createICE(data); toast.success('ICE creado'); }
      setDialogOpen(false);
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader
        title="Configuración ICE"
        description="Impuesto a los Consumos Especiales — tabacos, licores y otros"
        action={
          items.length === 0 ? (
            <Button variant="outline" onClick={handleSeed} disabled={seeding}>
              <RefreshCw className={`mr-2 h-4 w-4 ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? 'Cargando...' : 'Cargar Tarifas SRI'}
            </Button>
          ) : (
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Nuevo</Button>
          )
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700">
        ⚠️ Las tarifas ICE son actualizadas periódicamente por el SRI. Verifica siempre con la
        <strong> Resolución NAC-DGERCGC vigente</strong> antes de declarar.
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-center">Tipo Tarifa</TableHead>
              <TableHead className="text-right">T. Específica</TableHead>
              <TableHead className="text-right">T. Ad Valorem</TableHead>
              <TableHead className="text-center">Unidad</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-20">Acc.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({length:4}).map((_,i) => (
                <TableRow key={i}>{Array.from({length:8}).map((_,j) =>
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  <Coins className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin tarifas ICE. Carga las tarifas oficiales.</p>
                </TableCell>
              </TableRow>
            ) : items.map(item => (
              <TableRow key={item.id} className={!item.activo ? 'opacity-50' : ''}>
                <TableCell className="font-mono font-bold text-sm">{item.codigo}</TableCell>
                <TableCell className="text-sm">{item.descripcion}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-xs capitalize">{item.tipoTarifa}</Badge>
                </TableCell>
                <TableCell className="text-right text-sm">
                  {item.tarifaEspecifica != null ? `$${item.tarifaEspecifica.toFixed(4)}` : '—'}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {item.tarifaAdValorem != null ? `${item.tarifaAdValorem}%` : '—'}
                </TableCell>
                <TableCell className="text-center text-sm text-slate-500">{item.unidad ?? '—'}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={item.activo ? 'default' : 'secondary'} className="text-xs">
                    {item.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}
                      className="h-7 w-7 text-slate-400 hover:text-blue-600">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletingId(item.id)}
                      className="h-7 w-7 text-slate-400 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {items.length > 0 && (
        <div className="flex justify-end mt-3">
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Nueva Tarifa ICE</Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar' : 'Nueva'} Tarifa ICE</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código SRI *</Label>
                <Input placeholder="3610" {...register('codigo')} />
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Input placeholder="litro, unidad, kg" {...register('unidad')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción *</Label>
              <Input placeholder="Cigarrillos rubios..." {...register('descripcion')} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de tarifa</Label>
              <Select onValueChange={v => setValue('tipoTarifa', v as any)}
                defaultValue={editing?.tipoTarifa ?? 'ad_valorem'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="especifica">Específica ($ por unidad)</SelectItem>
                  <SelectItem value="ad_valorem">Ad Valorem (%)</SelectItem>
                  <SelectItem value="mixta">Mixta (ambas)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(tipoTarifa === 'especifica' || tipoTarifa === 'mixta') && (
                <div className="space-y-1.5">
                  <Label>Tarifa específica ($)</Label>
                  <Input type="number" step="0.0001" min="0" {...register('tarifaEspecifica')} />
                </div>
              )}
              {(tipoTarifa === 'ad_valorem' || tipoTarifa === 'mixta') && (
                <div className="space-y-1.5">
                  <Label>Tarifa ad valorem (%)</Label>
                  <Input type="number" step="0.1" min="0" {...register('tarifaAdValorem')} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => handleSubmit(onSubmit)()} disabled={saving}>
              {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tarifa ICE?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await deleteICE(deletingId!); toast.success('Eliminada'); setDeletingId(null); }}
              className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}