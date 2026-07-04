'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Warehouse, Star } from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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

import { Bodega } from '@/types';
import { subscribeToBodegas, createBodega, updateBodega, deleteBodega } from '@/lib/firebase/bodegas';

const schema = z.object({
  codigo:            z.string().min(1, 'El código es requerido').max(10),
  nombre:            z.string().min(1, 'El nombre es requerido'),
  direccion:         z.string().optional(),
  responsable:       z.string().optional(),
  esPrincipal:       z.boolean(),
  cuentaInventario:  z.string().optional(),
  cuentaCostoVentas: z.string().optional(),
  activa:            z.boolean(),
});
type BodegaForm = z.infer<typeof schema>;

export default function BodegasPage() {
  const [bodegas,    setBodegas]    = useState<Bodega[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<Bodega | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<BodegaForm>({ resolver: zodResolver(schema) });

  useEffect(() => {
    return subscribeToBodegas((data) => { setBodegas(data); setLoading(false); });
  }, []);

  const openCreate = () => {
    setEditing(null);
    reset({ codigo:'', nombre:'', direccion:'', responsable:'',
      esPrincipal: bodegas.length === 0,
      cuentaInventario:'', cuentaCostoVentas:'', activa: true });
    setDialogOpen(true);
  };

  const openEdit = (b: Bodega) => {
    setEditing(b);
    reset({
      codigo: b.codigo, nombre: b.nombre,
      direccion: b.direccion ?? '', responsable: b.responsable ?? '',
      esPrincipal: b.esPrincipal,
      cuentaInventario: b.cuentaInventario ?? '',
      cuentaCostoVentas: b.cuentaCostoVentas ?? '',
      activa: b.activa,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: BodegaForm) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        cuentaInventario:  data.cuentaInventario  || undefined,
        cuentaCostoVentas: data.cuentaCostoVentas || undefined,
      };
      if (editing) {
        await updateBodega(editing.id, payload);
        toast.success('Bodega actualizada');
      } else {
        await createBodega({ ...payload, activa: true });
        toast.success('Bodega creada');
      }
      setDialogOpen(false);
    } catch {
      toast.error('Error al guardar la bodega');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteBodega(deletingId);
      toast.success('Bodega eliminada');
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Bodegas"
        description="Gestión de bodegas y puntos de almacenamiento. Módulo opcional."
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nueva Bodega
          </Button>
        }
      />

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-24">Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead className="text-center w-28">Cuentas config.</TableHead>
              <TableHead className="text-center w-24">Estado</TableHead>
              <TableHead className="text-center w-24">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : bodegas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                  <Warehouse className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay bodegas registradas.</p>
                  <p className="text-xs mt-1">Si no usas múltiples bodegas, puedes omitir este módulo.</p>
                </TableCell>
              </TableRow>
            ) : (
              bodegas.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-sm font-medium">{b.codigo}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {b.esPrincipal && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                      <span className="font-medium">{b.nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">{b.responsable || '—'}</TableCell>
                  <TableCell className="text-slate-500 text-sm truncate max-w-[160px]">{b.direccion || '—'}</TableCell>
                  <TableCell className="text-center">
                    {b.cuentaInventario ? (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-300">Configuradas</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-slate-400">Sin config.</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={b.activa ? 'default' : 'secondary'}>
                      {b.activa ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(b)}
                        className="h-8 w-8 text-slate-500 hover:text-blue-600">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeletingId(b.id)}
                        className="h-8 w-8 text-slate-500 hover:text-red-600"
                        disabled={b.esPrincipal}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Bodega' : 'Nueva Bodega'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Datos generales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código *</Label>
                <Input placeholder="BOD-01" {...register('codigo')} />
                {errors.codigo && <p className="text-xs text-red-500">{errors.codigo.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input placeholder="Bodega Principal" {...register('nombre')} />
                {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Input placeholder="Nombre del responsable" {...register('responsable')} />
            </div>

            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input placeholder="Dirección de la bodega" {...register('direccion')} />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="esPrincipal"
                className="h-4 w-4 rounded border-slate-300" {...register('esPrincipal')} />
              <Label htmlFor="esPrincipal">Es la bodega principal</Label>
            </div>

            <Separator />

            {/* Cuentas contables */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">
                Configuración Contable
                <span className="ml-2 text-xs font-normal text-slate-400">(opcional)</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Cuenta de Inventario</Label>
                  <Input placeholder="ej: 1.1.05.001" {...register('cuentaInventario')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cuenta Costo de Ventas</Label>
                  <Input placeholder="ej: 5.1.01.001" {...register('cuentaCostoVentas')} />
                </div>
              </div>
            </div>

            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="activa-bod"
                  className="h-4 w-4 rounded border-slate-300" {...register('activa')} />
                <Label htmlFor="activa-bod">Bodega activa</Label>
              </div>
            )}
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
            <AlertDialogTitle>¿Eliminar bodega?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Asegúrate de que no tenga movimientos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}