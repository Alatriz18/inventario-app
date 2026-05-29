'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FileMinus, RefreshCw } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

import { ConfigRetencion } from '@/types';
import {
  subscribeToRetenciones, createRetencion,
  updateRetencion, deleteRetencion, seedRetenciones,
} from '@/lib/firebase/retenciones-config';

const schema = z.object({
  tipo:        z.enum(['fuente_ir','iva']),
  codigo:      z.string().min(1, 'Requerido'),
  descripcion: z.string().min(1, 'Requerido'),
  porcentaje:  z.coerce.number().min(0).max(100),
  aplicaA:     z.enum(['bienes','servicios','ambos']),
  activo:      z.boolean(),
});

type RetencionForm = z.infer<typeof schema>;

export default function RetencionesPage() {
  const [retenciones, setRetenciones] = useState<ConfigRetencion[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [seeding,     setSeeding]     = useState(false);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editing,     setEditing]     = useState<ConfigRetencion | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);

  const { register, handleSubmit, reset, setValue, formState: { errors } } =
    useForm<RetencionForm>({ resolver: zodResolver(schema) as any });

  useEffect(() => {
    return subscribeToRetenciones(d => { setRetenciones(d); setLoading(false); });
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedRetenciones();
      toast.success('Retenciones cargadas correctamente');
    } catch { toast.error('Error al cargar'); }
    finally { setSeeding(false); }
  };

  const openCreate = (tipo: 'fuente_ir' | 'iva') => {
    setEditing(null);
    reset({ tipo, codigo:'', descripcion:'', porcentaje:0, aplicaA:'ambos', activo:true });
    setDialogOpen(true);
  };

  const openEdit = (r: ConfigRetencion) => {
    setEditing(r);
    reset({ tipo:r.tipo, codigo:r.codigo, descripcion:r.descripcion,
      porcentaje:r.porcentaje, aplicaA:r.aplicaA, activo:r.activo });
    setDialogOpen(true);
  };

  const onSubmit = async (data: RetencionForm) => {
    setSaving(true);
    try {
      if (editing) {
        await updateRetencion(editing.id, data);
        toast.success('Retencion actualizada');
      } else {
        await createRetencion(data);
        toast.success('Retencion creada');
      }
      setDialogOpen(false);
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const ir  = retenciones.filter(r => r.tipo === 'fuente_ir');
  const iva = retenciones.filter(r => r.tipo === 'iva');

  const RetencionTable = ({ items, tipo }: { items: ConfigRetencion[], tipo: 'fuente_ir' | 'iva' }) => (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 border-b">
        <span className="font-semibold text-slate-700 text-sm">
          {tipo === 'fuente_ir' ? 'Retenciones en la Fuente IR' : 'Retenciones IVA'}
        </span>
        <Button size="sm" onClick={() => openCreate(tipo)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Nueva
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Código</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-center">Aplica a</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead className="text-center w-20">Acc.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({length:3}).map((_,i) => (
              <TableRow key={i}>{Array.from({length:6}).map((_,j) =>
                <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            ))
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-slate-400 text-sm">
                Sin retenciones configuradas.
              </TableCell>
            </TableRow>
          ) : items.map(r => (
            <TableRow key={r.id} className={!r.activo ? 'opacity-50' : ''}>
              <TableCell className="font-mono font-bold text-sm">{r.codigo}</TableCell>
              <TableCell className="text-sm">{r.descripcion}</TableCell>
              <TableCell className="text-right font-bold text-slate-700">{r.porcentaje}%</TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="text-xs capitalize">{r.aplicaA}</Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant={r.activo ? 'default' : 'secondary'} className="text-xs">
                  {r.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}
                    className="h-7 w-7 text-slate-400 hover:text-blue-600">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeletingId(r.id)}
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
  );

  return (
    <div>
      <PageHeader
        title="Configuración de Retenciones"
        description="Porcentajes de retención en la fuente IR y retenciones IVA del SRI Ecuador"
        action={
          retenciones.length === 0 ? (
            <Button variant="outline" onClick={handleSeed} disabled={seeding}>
              <RefreshCw className={`mr-2 h-4 w-4 ${seeding ? 'animate-spin' : ''}`} />
              {seeding ? 'Cargando...' : 'Cargar Retenciones SRI'}
            </Button>
          ) : null
        }
      />

      {retenciones.length === 0 && !loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-700">
          📋 No hay retenciones configuradas. Carga las <strong>retenciones oficiales del SRI Ecuador</strong> con el botón superior o créalas manualmente.
        </div>
      )}

      <Tabs defaultValue="fuente_ir">
        <TabsList className="mb-4">
          <TabsTrigger value="fuente_ir">Retenciones IR ({ir.length})</TabsTrigger>
          <TabsTrigger value="iva">Retenciones IVA ({iva.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="fuente_ir"><RetencionTable items={ir} tipo="fuente_ir" /></TabsContent>
        <TabsContent value="iva"><RetencionTable items={iva} tipo="iva" /></TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar' : 'Nueva'} Retención</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código SRI *</Label>
                <Input placeholder="303" {...register('codigo')} />
                {errors.codigo && <p className="text-xs text-red-500">{errors.codigo.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Porcentaje (%) *</Label>
                <Input type="number" step="0.1" min="0" max="100" {...register('porcentaje')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción *</Label>
              <Input placeholder="Honorarios profesionales y demás pagos..." {...register('descripcion')} />
              {errors.descripcion && <p className="text-xs text-red-500">{errors.descripcion.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select onValueChange={v => setValue('tipo', v as any)}
                  defaultValue={editing?.tipo ?? 'fuente_ir'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fuente_ir">Fuente IR</SelectItem>
                    <SelectItem value="iva">IVA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Aplica a</Label>
                <Select onValueChange={v => setValue('aplicaA', v as any)}
                  defaultValue={editing?.aplicaA ?? 'ambos'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bienes">Bienes</SelectItem>
                    <SelectItem value="servicios">Servicios</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="activo-ret" className="h-4 w-4" {...register('activo')} />
                <Label htmlFor="activo-ret">Activo</Label>
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
            <AlertDialogTitle>¿Eliminar retención?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await deleteRetencion(deletingId!); toast.success('Eliminada'); setDeletingId(null); }}
              className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}