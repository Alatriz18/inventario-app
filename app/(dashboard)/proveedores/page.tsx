'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Truck, Globe, MapPin, CreditCard, BookOpen } from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import { Button }    from '@/components/ui/button';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Textarea }  from '@/components/ui/textarea';
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

import { Proveedor, TipoIdentificacionProv, TipoProveedor, TipoPago } from '@/types';
import { subscribeToProveedores, createProveedor, updateProveedor, deleteProveedor } from '@/lib/firebase/proveedores';
import { PROVINCIAS_ECUADOR, PAISES, CODIGOS_SUSTENTO, REGIMENES } from '@/lib/constants/ecuador';

const schema = z.object({
  tipoIdentificacion: z.enum(['ruc','cedula','pasaporte','identificacion_exterior']),
  ruc:                z.string().min(5, 'Identificación inválida'),
  nombre:             z.string().min(1, 'El nombre es requerido'),
  nombreComercial:    z.string().optional(),
  tipoProveedor:      z.enum(['local','extranjero_persona_natural','extranjero_persona_juridica']),
  regimen:            z.string().optional(),
  email:              z.string().email('Email inválido').optional().or(z.literal('')),
  telefono:           z.string().optional(),
  contacto:           z.string().optional(),
  pais:               z.string().min(1, 'Selecciona un país'),
  codigoPais:         z.string().default('EC'),
  provincia:          z.string().optional(),
  ciudad:             z.string().optional(),
  direccion:          z.string().optional(),
  tipoPago:           z.enum(['contado','credito']),
  diasCredito:        z.coerce.number().min(0).optional(),
  codigoSustento:     z.string().optional(),
  cuentaCxP:          z.string().optional(),
  cuentaGasto:        z.string().optional(),
  cuentaIVACompras:   z.string().optional(),
  activo:             z.boolean().default(true),
  notas:              z.string().optional(),
});

type ProveedorForm = z.infer<typeof schema>;

const TIPO_ID_LABELS: Record<string, string> = {
  ruc: 'RUC', cedula: 'Cédula',
  pasaporte: 'Pasaporte', identificacion_exterior: 'ID Exterior',
};

const TIPO_PROV_LABELS: Record<string, string> = {
  local: 'Local',
  extranjero_persona_natural: 'Extranjero P. Natural',
  extranjero_persona_juridica: 'Extranjero P. Jurídica',
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editing,     setEditing]     = useState<Proveedor | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState('');

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
    useForm<ProveedorForm>({ resolver: zodResolver(schema) });

  const tipoPago     = watch('tipoPago');
  const tipoProveedor = watch('tipoProveedor');

  useEffect(() => {
    return subscribeToProveedores((data) => { setProveedores(data); setLoading(false); });
  }, []);

  const defaultValues = (): ProveedorForm => ({
    tipoIdentificacion: 'ruc', ruc: '', nombre: '', nombreComercial: '',
    tipoProveedor: 'local', regimen: 'general',
    email: '', telefono: '', contacto: '',
    pais: 'Ecuador', codigoPais: 'EC', provincia: '', ciudad: '', direccion: '',
    tipoPago: 'contado', diasCredito: 30, codigoSustento: '01',
    cuentaCxP: '', cuentaGasto: '', cuentaIVACompras: '',
    activo: true, notas: '',
  });

  const openCreate = () => {
    setEditing(null);
    reset(defaultValues());
    setDialogOpen(true);
  };

  const openEdit = (p: Proveedor) => {
    setEditing(p);
    reset({
      tipoIdentificacion: p.tipoIdentificacion,
      ruc: p.ruc, nombre: p.nombre,
      nombreComercial: p.nombreComercial ?? '',
      tipoProveedor: p.tipoProveedor,
      regimen: p.regimen ?? 'general',
      email: p.email ?? '', telefono: p.telefono ?? '',
      contacto: p.contacto ?? '',
      pais: p.pais, codigoPais: p.codigoPais,
      provincia: p.provincia ?? '', ciudad: p.ciudad ?? '',
      direccion: p.direccion ?? '',
      tipoPago: p.tipoPago, diasCredito: p.diasCredito ?? 30,
      codigoSustento: p.codigoSustento ?? '01',
      cuentaCxP: p.cuentaCxP ?? '', cuentaGasto: p.cuentaGasto ?? '',
      cuentaIVACompras: p.cuentaIVACompras ?? '',
      activo: p.activo, notas: p.notas ?? '',
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: ProveedorForm) => {
    setSaving(true);
    try {
      const clean = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? undefined : v])
      ) as Proveedor;
      if (editing) {
        await updateProveedor(editing.id, clean);
        toast.success('Proveedor actualizado');
      } else {
        await createProveedor({ ...clean, activo: true });
        toast.success('Proveedor creado');
      }
      setDialogOpen(false);
    } catch {
      toast.error('Error al guardar el proveedor');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteProveedor(deletingId);
      toast.success('Proveedor eliminado');
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.ruc.includes(search)
  );

  return (
    <div>
      <PageHeader
        title="Proveedores"
        description="Gestión de proveedores con información SRI completa"
        action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nuevo Proveedor</Button>}
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
              <TableHead>Nombre / Razón Social</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Contacto</TableHead>
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
                  <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{search ? 'Sin resultados.' : 'No hay proveedores. Agrega el primero.'}</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  <div>
                    <p className="font-mono text-xs text-slate-500">{TIPO_ID_LABELS[p.tipoIdentificacion]}</p>
                    <p className="font-medium text-sm">{p.ruc}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{p.nombre}</p>
                    {p.nombreComercial && <p className="text-xs text-slate-400">{p.nombreComercial}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    p.tipoProveedor === 'local'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-orange-50 text-orange-700'
                  }`}>
                    {TIPO_PROV_LABELS[p.tipoProveedor]}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-slate-500">
                  <div>{p.contacto || '—'}</div>
                  <div className="text-xs">{p.email || ''}</div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={p.tipoPago === 'credito' ? 'outline' : 'secondary'} className="text-xs">
                    {p.tipoPago === 'credito' ? 'Crédito' : 'Contado'}
                  </Badge>
                </TableCell>
                <TableCell className="text-center text-sm">
                  {p.tipoPago === 'credito' ? `${p.diasCredito ?? 0}d` : '—'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={p.activo ? 'default' : 'secondary'}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}
                      className="h-8 w-8 text-slate-500 hover:text-blue-600">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeletingId(p.id)}
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
            <DialogTitle>{editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle>
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
                  <Select onValueChange={v => setValue('tipoIdentificacion', v as TipoIdentificacionProv)}
                    defaultValue={editing?.tipoIdentificacion ?? 'ruc'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ruc">RUC</SelectItem>
                      <SelectItem value="cedula">Cédula</SelectItem>
                      <SelectItem value="pasaporte">Pasaporte</SelectItem>
                      <SelectItem value="identificacion_exterior">Identificación Exterior</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Número de Identificación *</Label>
                  <Input placeholder="0990000000001" {...register('ruc')} />
                  {errors.ruc && <p className="text-xs text-red-500">{errors.ruc.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Razón Social / Nombre *</Label>
                  <Input placeholder="Empresa S.A." {...register('nombre')} />
                  {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Nombre Comercial</Label>
                  <Input placeholder="Nombre comercial (opcional)" {...register('nombreComercial')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de Proveedor *</Label>
                  <Select onValueChange={v => setValue('tipoProveedor', v as TipoProveedor)}
                    defaultValue={editing?.tipoProveedor ?? 'local'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local (Ecuador)</SelectItem>
                      <SelectItem value="extranjero_persona_natural">Extranjero – Persona Natural</SelectItem>
                      <SelectItem value="extranjero_persona_juridica">Extranjero – Persona Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Régimen Tributario</Label>
                  <Select onValueChange={v => setValue('regimen', v)}
                    defaultValue={editing?.regimen ?? 'general'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REGIMENES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
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
                  <Label>Persona de contacto</Label>
                  <Input placeholder="Juan Pérez" {...register('contacto')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Teléfono</Label>
                  <Input placeholder="0999999999" {...register('telefono')} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="proveedor@empresa.com" {...register('email')} />
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
                  <Input placeholder="Av. Principal y calle" {...register('direccion')} />
                </div>
              </div>
            </div>

            <Separator />

            {/* CONDICIONES COMERCIALES */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Condiciones Comerciales y SRI</p>
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
                    disabled={tipoPago !== 'credito'}
                    {...register('diasCredito')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Sustento Tributario</Label>
                  <Select onValueChange={v => setValue('codigoSustento', v)}
                    defaultValue={editing?.codigoSustento ?? '01'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CODIGOS_SUSTENTO.map(c =>
                        <SelectItem key={c.codigo} value={c.codigo}>{c.codigo} – {c.descripcion}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* CUENTAS CONTABLES */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-4 w-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Configuración Contable</p>
                <span className="text-xs text-slate-400">(opcional — Sprint 7)</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Cuenta CxP</Label>
                  <Input placeholder="ej: 2.1.01.001" {...register('cuentaCxP')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cuenta de Compras/Gasto</Label>
                  <Input placeholder="ej: 5.1.01.001" {...register('cuentaGasto')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cuenta IVA Compras</Label>
                  <Input placeholder="ej: 1.1.04.001" {...register('cuentaIVACompras')} />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea placeholder="Observaciones del proveedor..." rows={2} {...register('notas')} />
            </div>

            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="activo-prov"
                  className="h-4 w-4 rounded border-slate-300" {...register('activo')} />
                <Label htmlFor="activo-prov">Proveedor activo</Label>
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
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
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