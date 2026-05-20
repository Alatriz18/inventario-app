'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, Globe, MapPin, CreditCard, BookOpen } from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import { Button }    from '@/components/ui/button';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Badge }     from '@/components/ui/badge';
import { Skeleton }  from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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

import { Cliente, TipoIdentificacionCliente, TipoCliente, TipoPago } from '@/types';
import { subscribeToClientes, createCliente, updateCliente, deleteCliente } from '@/lib/firebase/clientes';
import { PROVINCIAS_ECUADOR, PAISES } from '@/lib/constants/ecuador';

const CONSUMIDOR_FINAL_ID = '9999999999999';

const schema = z.object({
  tipoIdentificacion: z.enum(['ruc','cedula','pasaporte','consumidor_final','identificacion_exterior']),
  identificacion:     z.string().min(1, 'La identificación es requerida'),
  nombre:             z.string().min(1, 'El nombre es requerido'),
  nombreComercial:    z.string().optional(),
  tipoCliente:        z.enum(['local','extranjero']),
  email:              z.string().email('Email inválido').optional().or(z.literal('')),
  telefono:           z.string().optional(),
  pais:               z.string().min(1),
  codigoPais:         z.string(),
  provincia:          z.string().optional(),
  ciudad:             z.string().optional(),
  direccion:          z.string().optional(),
  tipoPago:           z.enum(['contado','credito']),
  diasCredito:        z.coerce.number().min(0).optional(),
  limiteCredito:      z.coerce.number().min(0).optional(),
  cuentaCxC:          z.string().optional(),
  activo:             z.boolean(),
});

type ClienteForm = z.infer<typeof schema>;

const TIPO_ID_LABELS: Record<string, string> = {
  ruc: 'RUC', cedula: 'Cédula', pasaporte: 'Pasaporte',
  consumidor_final: 'Consumidor Final', identificacion_exterior: 'ID Exterior',
};

export default function ClientesPage() {
  const [clientes,   setClientes]   = useState<Cliente[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<Cliente | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useForm<ClienteForm>({ resolver: zodResolver(schema) as any });

  const tipoPago          = watch('tipoPago');
  const tipoIdentificacion = watch('tipoIdentificacion');
  const esConsumidorFinal  = tipoIdentificacion === 'consumidor_final';

  // Auto-fill consumidor final
  useEffect(() => {
    if (esConsumidorFinal) {
      setValue('identificacion', CONSUMIDOR_FINAL_ID);
      setValue('nombre', 'CONSUMIDOR FINAL');
    }
  }, [esConsumidorFinal, setValue]);

  useEffect(() => {
    return subscribeToClientes((data) => { setClientes(data); setLoading(false); });
  }, []);

  const defaultValues = (): ClienteForm => ({
    tipoIdentificacion: 'cedula', identificacion: '', nombre: '', nombreComercial: '',
    tipoCliente: 'local', email: '', telefono: '',
    pais: 'Ecuador', codigoPais: 'EC', provincia: '', ciudad: '', direccion: '',
    tipoPago: 'contado', diasCredito: 30, limiteCredito: 0,
    cuentaCxC: '', activo: true,
  });

  const openCreate = () => {
    setEditing(null);
    reset(defaultValues());
    setDialogOpen(true);
  };

  const openEdit = (c: Cliente) => {
    setEditing(c);
    reset({
      tipoIdentificacion: c.tipoIdentificacion,
      identificacion: c.identificacion, nombre: c.nombre,
      nombreComercial: c.nombreComercial ?? '',
      tipoCliente: c.tipoCliente,
      email: c.email ?? '', telefono: c.telefono ?? '',
      pais: c.pais, codigoPais: c.codigoPais,
      provincia: c.provincia ?? '', ciudad: c.ciudad ?? '',
      direccion: c.direccion ?? '',
      tipoPago: c.tipoPago, diasCredito: c.diasCredito ?? 30,
      limiteCredito: c.limiteCredito ?? 0,
      cuentaCxC: c.cuentaCxC ?? '', activo: c.activo,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: ClienteForm) => {
    setSaving(true);
    try {
      const clean = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? undefined : v])
      ) as unknown as Cliente;
      if (editing) {
        await updateCliente(editing.id, clean);
        toast.success('Cliente actualizado');
      } else {
        await createCliente({ ...clean, activo: true });
        toast.success('Cliente creado');
      }
      setDialogOpen(false);
    } catch {
      toast.error('Error al guardar el cliente');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteCliente(deletingId);
      toast.success('Cliente eliminado');
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = clientes.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.identificacion.includes(search)
  );

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Gestión de clientes con datos SRI completos"
        action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nuevo Cliente</Button>}
      />

      <div className="mb-4">
        <Input placeholder="Buscar por nombre o identificación..."
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Identificación</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Email / Teléfono</TableHead>
              <TableHead className="text-center">Pago</TableHead>
              <TableHead className="text-center">Días</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-20">Acc.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{search ? 'Sin resultados.' : 'No hay clientes. Agrega el primero.'}</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-mono text-xs text-slate-400">{TIPO_ID_LABELS[c.tipoIdentificacion]}</p>
                  <p className="font-medium text-sm">{c.identificacion}</p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{c.nombre}</p>
                  {c.nombreComercial && <p className="text-xs text-slate-400">{c.nombreComercial}</p>}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.tipoCliente === 'local' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                  }`}>
                    {c.tipoCliente === 'local' ? 'Local' : 'Extranjero'}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-slate-500">
                  <div>{c.email || '—'}</div>
                  <div className="text-xs">{c.telefono || ''}</div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.tipoPago === 'credito' ? 'outline' : 'secondary'} className="text-xs">
                    {c.tipoPago === 'credito' ? 'Crédito' : 'Contado'}
                  </Badge>
                </TableCell>
                <TableCell className="text-center text-sm">
                  {c.tipoPago === 'credito' ? `${c.diasCredito ?? 0}d` : '—'}
                </TableCell>
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

      {/* ─── DIALOG ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">

            {/* IDENTIFICACIÓN */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Identificación SRI</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de Identificación *</Label>
                  <Select onValueChange={v => setValue('tipoIdentificacion', v as TipoIdentificacionCliente)}
                    defaultValue={editing?.tipoIdentificacion ?? 'cedula'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ruc">RUC</SelectItem>
                      <SelectItem value="cedula">Cédula</SelectItem>
                      <SelectItem value="pasaporte">Pasaporte</SelectItem>
                      <SelectItem value="consumidor_final">Consumidor Final</SelectItem>
                      <SelectItem value="identificacion_exterior">Identificación Exterior</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Número de Identificación *</Label>
                  <Input
                    placeholder={esConsumidorFinal ? CONSUMIDOR_FINAL_ID : '0000000000'}
                    disabled={esConsumidorFinal}
                    {...register('identificacion')}
                  />
                  {errors.identificacion && <p className="text-xs text-red-500">{errors.identificacion.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Nombre / Razón Social *</Label>
                  <Input placeholder="Juan Pérez" disabled={esConsumidorFinal} {...register('nombre')} />
                  {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Nombre Comercial</Label>
                  <Input placeholder="(opcional)" {...register('nombreComercial')} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Tipo de Cliente *</Label>
                  <Select onValueChange={v => setValue('tipoCliente', v as TipoCliente)}
                    defaultValue={editing?.tipoCliente ?? 'local'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local (Ecuador)</SelectItem>
                      <SelectItem value="extranjero">Extranjero</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* CONTACTO Y DIRECCIÓN */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Contacto y Dirección</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Teléfono</Label>
                  <Input placeholder="0999999999" {...register('telefono')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" placeholder="cliente@email.com" {...register('email')} />
                  {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>País *</Label>
                  <Select onValueChange={v => {
                    const p = PAISES.find(x => x.nombre === v);
                    setValue('pais', v);
                    setValue('codigoPais', p?.codigo ?? 'OT');
                  }} defaultValue={editing?.pais ?? 'Ecuador'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAISES.map(p => <SelectItem key={p.codigo} value={p.nombre}>{p.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Provincia</Label>
                  <Select onValueChange={v => setValue('provincia', v)}
                    defaultValue={editing?.provincia}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      {PROVINCIAS_ECUADOR.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ciudad</Label>
                  <Input placeholder="Quito" {...register('ciudad')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Dirección</Label>
                  <Input placeholder="Av. Principal 123" {...register('direccion')} />
                </div>
              </div>
            </div>

            <Separator />

            {/* CONDICIONES COMERCIALES */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Condiciones Comerciales</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de Pago *</Label>
                  <Select onValueChange={v => setValue('tipoPago', v as TipoPago)}
                    defaultValue={editing?.tipoPago ?? 'contado'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contado">Contado</SelectItem>
                      <SelectItem value="credito">Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Días de Crédito</Label>
                  <Input type="number" min="0" placeholder="30"
                    disabled={tipoPago !== 'credito'} {...register('diasCredito')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Límite de Crédito ($)</Label>
                  <Input type="number" min="0" placeholder="0.00"
                    disabled={tipoPago !== 'credito'} {...register('limiteCredito')} />
                </div>
              </div>
            </div>

            <Separator />

            {/* CUENTAS CONTABLES */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Configuración Contable</p>
                <span className="text-xs text-slate-400">(opcional — Sprint 7)</span>
              </div>
              <div className="space-y-1.5 max-w-xs">
                <Label className="text-xs">Cuenta CxC de este cliente</Label>
                <Input placeholder="ej: 1.1.03.001" {...register('cuentaCxC')} />
              </div>
            </div>

            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="activo-cli"
                  className="h-4 w-4 rounded border-slate-300" {...register('activo')} />
                <Label htmlFor="activo-cli">Cliente activo</Label>
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
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}