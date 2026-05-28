'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Landmark } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
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

import { CentroCosto } from '@/types';
import {
  subscribeToCentrosCosto, createCentroCosto,
  updateCentroCosto, deleteCentroCosto,
} from '@/lib/firebase/centros-costo';

const schema = z.object({
  codigo: z.string().min(1, 'Requerido'),
  nombre: z.string().min(1, 'Requerido'),
  activo: z.boolean(),
});

type CentroForm = z.infer<typeof schema>;

export default function CentrosCostoPage() {
  const [centros,    setCentros]    = useState<CentroCosto[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<CentroCosto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<CentroForm>({ resolver: zodResolver(schema) as any });

  useEffect(() => {
    return subscribeToCentrosCosto(d => { setCentros(d); setLoading(false); });
  }, []);

  const openCreate = () => {
    setEditing(null);
    reset({ codigo: '', nombre: '', activo: true });
    setDialogOpen(true);
  };

  const openEdit = (c: CentroCosto) => {
    setEditing(c);
    reset({ codigo: c.codigo, nombre: c.nombre, activo: c.activo });
    setDialogOpen(true);
  };

  const onSubmit = async (data: CentroForm) => {
    setSaving(true);
    try {
      if (editing) {
        await updateCentroCosto(editing.id, data);
        toast.success('Centro de costo actualizado');
      } else {
        await createCentroCosto(data);
        toast.success('Centro de costo creado');
      }
      setDialogOpen(false);
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader
        title="Centros de Costo"
        description="Clasifica los gastos e ingresos por área o departamento"
        action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Nuevo</Button>}
      />

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-24">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({length:3}).map((_,i) => (
                <TableRow key={i}>{Array.from({length:4}).map((_,j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : centros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-slate-400">
                  <Landmark className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay centros de costo. Crea el primero.</p>
                </TableCell>
              </TableRow>
            ) : centros.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-semibold">{c.codigo}</TableCell>
                <TableCell className="font-medium">{c.nombre}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.activo ? 'default' : 'secondary'}>
                    {c.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}
                      className="h-8 w-8 text-slate-500 hover:text-blue-600">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletingId(c.id)}
                      className="h-8 w-8 text-slate-500 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar' : 'Nuevo'} Centro de Costo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input placeholder="ej: ADM, VEN, OPE" {...register('codigo')} />
              {errors.codigo && <p className="text-xs text-red-500">{errors.codigo.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input placeholder="ej: Administración" {...register('nombre')} />
              {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="activo-cc" className="h-4 w-4" {...register('activo')} />
                <Label htmlFor="activo-cc">Activo</Label>
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
            <AlertDialogTitle>¿Eliminar centro de costo?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteCentroCosto(deletingId!);
                toast.success('Eliminado');
                setDeletingId(null);
              }}
              className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}