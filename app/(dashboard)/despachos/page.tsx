'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Trash2, PackageMinus, Search, XCircle, ChevronDown } from 'lucide-react';

import PageHeader   from '@/components/shared/PageHeader';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator }from '@/components/ui/separator';
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

import { Producto, Bodega } from '@/types';
import { subscribeToDespachos, createDespacho, anularDespacho, Despacho } from '@/lib/firebase/despachos';
import { subscribeToProductos } from '@/lib/firebase/productos';
import { subscribeToBodegas }   from '@/lib/firebase/bodegas';
import { useAuth } from '@/context/AuthContext';

const MOTIVOS = [
  { value: 'ajuste',              label: 'Ajuste de inventario' },
  { value: 'muestra',             label: 'Muestra / regalo' },
  { value: 'devolucion_proveedor',label: 'Devolución a proveedor' },
  { value: 'otro',                label: 'Otro' },
];

const itemSchema = z.object({
  productoId:    z.string().min(1),
  sku:           z.string(),
  nombre:        z.string(),
  cantidad:      z.coerce.number().min(1, 'Mínimo 1'),
  precioUnitario:z.coerce.number().min(0),
  subtotal:      z.number().default(0),
});

const schema = z.object({
  fecha:         z.string().min(1, 'La fecha es requerida'),
  motivo:        z.enum(['venta','ajuste','muestra','devolucion_proveedor','otro']),
  motivoDetalle: z.string().optional(),
  bodegaId:      z.string().optional(),
  items:         z.array(itemSchema).min(1, 'Agrega al menos un producto'),
  notas:         z.string().optional(),
});

type DespachoForm = z.infer<typeof schema>;

function formatCurrency(v: number) {
  return `$${v.toFixed(2)}`;
}

const MOTIVO_COLORS: Record<string, string> = {
  venta:               'bg-blue-50 text-blue-700',
  ajuste:              'bg-amber-50 text-amber-700',
  muestra:             'bg-purple-50 text-purple-700',
  devolucion_proveedor:'bg-orange-50 text-orange-700',
  otro:                'bg-slate-100 text-slate-600',
};

export default function DespachosPage() {
  const { user } = useAuth();

  const [despachos,   setDespachos]   = useState<Despacho[]>([]);
  const [productos,   setProductos]   = useState<Producto[]>([]);
  const [bodegas,     setBodegas]     = useState<Bodega[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [detailId,    setDetailId]    = useState<string | null>(null);
  const [anulando,    setAnulando]    = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState('');
  const [busquedaProd,setBusquedaProd]= useState('');

  const { register, handleSubmit, reset, watch, setValue, control, formState: { errors } } =
    useForm<DespachoForm>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolver: zodResolver(schema) as any,
      defaultValues: {
        fecha:  new Date().toISOString().split('T')[0],
        motivo: 'ajuste',
        items:  [],
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = watch('items');
  const total = watchItems?.reduce((s, i) => s + ((i.cantidad * i.precioUnitario) || 0), 0) ?? 0;

  useEffect(() => {
    const u1 = subscribeToDespachos((d) => { setDespachos(d); setLoading(false); });
    const u2 = subscribeToProductos(setProductos);
    const u3 = subscribeToBodegas(setBodegas);
    return () => { u1(); u2(); u3(); };
  }, []);

  const productosFiltrados = productos.filter(
    (p) => p.activo && p.stockActual > 0 && (
      p.nombre.toLowerCase().includes(busquedaProd.toLowerCase()) ||
      p.sku.toLowerCase().includes(busquedaProd.toLowerCase())
    )
  );

  const agregarProducto = (prod: Producto) => {
    const existe = fields.findIndex((f) => f.productoId === prod.id);
    if (existe >= 0) {
      const qty = watchItems[existe].cantidad;
      setValue(`items.${existe}.cantidad`, qty + 1);
    } else {
      append({
        productoId:     prod.id,
        sku:            prod.sku,
        nombre:         prod.nombre,
        cantidad:       1,
        precioUnitario: prod.precioVenta,
        subtotal:       prod.precioVenta,
      });
    }
    setBusquedaProd('');
  };

  const openCreate = () => {
    reset({
      fecha:  new Date().toISOString().split('T')[0],
      motivo: 'ajuste', motivoDetalle: '',
      bodegaId: '', items: [], notas: '',
    });
    setBusquedaProd('');
    setDialogOpen(true);
  };

  const onSubmit = async (data: DespachoForm) => {
    if (!user) return;
    setSaving(true);
    try {
      const bodega = bodegas.find((b) => b.id === data.bodegaId);
      const items  = data.items.map((i) => ({
        ...i, subtotal: i.cantidad * i.precioUnitario,
      }));

      await createDespacho(
        {
          fecha:         new Date(data.fecha),
          motivo:        data.motivo,
          motivoDetalle: data.motivoDetalle,
          bodegaId:      data.bodegaId || undefined,
          bodegaNombre:  bodega?.nombre,
          items,
          total,
          usuarioId:     user.uid,
          usuarioNombre: user.nombre,
          notas:         data.notas,
          createdAt:     new Date(),
        },
        user.uid,
        user.nombre
      );

      toast.success('Despacho registrado y stock actualizado');
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar el despacho');
    } finally {
      setSaving(false);
    }
  };

  const confirmarAnulacion = async () => {
    if (!anulando || !user) return;
    try {
      await anularDespacho(anulando, user.uid, user.nombre);
      toast.success('Despacho anulado y stock revertido');
    } catch {
      toast.error('Error al anular el despacho');
    } finally {
      setAnulando(null);
    }
  };

  const filtered = despachos.filter((d) =>
    MOTIVOS.find((m) => m.value === d.motivo)?.label
      .toLowerCase().includes(search.toLowerCase()) ||
    d.usuarioNombre.toLowerCase().includes(search.toLowerCase())
  );

  const despachoDetalle = despachos.find((d) => d.id === detailId);

  return (
    <div>
      <PageHeader
        title="Despachos"
        description="Salidas de inventario por ajuste, muestra u otros motivos"
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo Despacho
          </Button>
        }
      />

      <div className="mb-4">
        <Input placeholder="Buscar por motivo o usuario..."
          value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Fecha</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead className="text-center">Ítems</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Registrado por</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-24">Acc.</TableHead>
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
                  <PackageMinus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay despachos registrados aún.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map((d) => (
              <TableRow key={d.id} className={d.anulado ? 'opacity-50' : ''}>
                <TableCell className="text-sm">
                  {format((d.fecha as any)?.toDate?.() ?? new Date(d.fecha), 'dd/MM/yyyy', { locale: es })}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MOTIVO_COLORS[d.motivo]}`}>
                    {MOTIVOS.find((m) => m.value === d.motivo)?.label}
                  </span>
                </TableCell>
                <TableCell className="text-slate-500 text-sm">{d.bodegaNombre || '—'}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{d.items.length} ítem(s)</Badge>
                </TableCell>
                <TableCell className="text-right font-semibold text-sm">
                  {formatCurrency(d.total)}
                </TableCell>
                <TableCell className="text-sm text-slate-500">{d.usuarioNombre}</TableCell>
                <TableCell className="text-center">
                  {d.anulado
                    ? <Badge variant="destructive">Anulado</Badge>
                    : <Badge variant="default">Activo</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setDetailId(d.id)}
                      className="h-8 w-8 text-slate-500 hover:text-blue-600">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    {!d.anulado && (
                      <Button variant="ghost" size="icon" onClick={() => setAnulando(d.id)}
                        className="h-8 w-8 text-slate-500 hover:text-red-600">
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* ─── DIALOG NUEVO DESPACHO ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Despacho</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input type="date" {...register('fecha')} />
                {errors.fecha && <p className="text-xs text-red-500">{errors.fecha.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Motivo *</Label>
                <Select onValueChange={(v) => setValue('motivo', v as any)} defaultValue="ajuste">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bodega</Label>
                <Select onValueChange={(v) => setValue('bodegaId', v)}>
                  <SelectTrigger><SelectValue placeholder="Sin bodega" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin bodega específica</SelectItem>
                    {bodegas.filter((b) => b.activa).map((b) =>
                      <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Detalle del motivo</Label>
              <Input placeholder="Especifica el motivo si es necesario..." {...register('motivoDetalle')} />
            </div>

            <Separator />

            {/* Buscador */}
            <div>
              <Label>Agregar Productos <span className="text-xs text-slate-400 ml-1">(solo con stock disponible)</span></Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Buscar por nombre o SKU..."
                  className="pl-9" value={busquedaProd}
                  onChange={(e) => setBusquedaProd(e.target.value)} />
              </div>
              {busquedaProd && (
                <div className="mt-1 border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {productosFiltrados.length === 0 ? (
                    <p className="text-sm text-slate-400 p-3">Sin resultados con stock disponible</p>
                  ) : productosFiltrados.map((p) => (
                    <button key={p.id} type="button" onClick={() => agregarProducto(p)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{p.nombre}</p>
                        <p className="text-xs text-slate-400">{p.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatCurrency(p.precioVenta)}</p>
                        <p className={`text-xs ${p.stockActual <= p.stockMinimo ? 'text-red-500' : 'text-slate-400'}`}>
                          Stock: {p.stockActual}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tabla items */}
            {fields.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Producto</TableHead>
                      <TableHead className="w-28 text-center">Cantidad</TableHead>
                      <TableHead className="w-36 text-right">Precio Unit.</TableHead>
                      <TableHead className="w-32 text-right">Subtotal</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, idx) => {
                      const qty   = watchItems?.[idx]?.cantidad       ?? 0;
                      const price = watchItems?.[idx]?.precioUnitario ?? 0;
                      const prod  = productos.find((p) => p.id === field.productoId);
                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{field.nombre}</p>
                              <p className="text-xs text-slate-400">
                                {field.sku} — Stock disponible: {prod?.stockActual ?? 0}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input type="number" min="1" max={prod?.stockActual}
                              className="text-center h-8"
                              {...register(`items.${idx}.cantidad`)} />
                          </TableCell>
                          <TableCell>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                              <Input type="number" step="0.01" min="0"
                                className="pl-6 h-8 text-right"
                                {...register(`items.${idx}.precioUnitario`)} />
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm">
                            {formatCurrency(qty * price)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => remove(idx)}
                              className="h-7 w-7 text-slate-400 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
                <div className="bg-slate-50 px-4 py-3 flex justify-end border-t">
                  <span className="text-sm text-slate-600 font-bold">
                    Total: <span className="text-slate-900">{formatCurrency(total)}</span>
                  </span>
                </div>
              </div>
            )}

            {errors.items && (
              <p className="text-xs text-red-500">{errors.items.message ?? errors.items.root?.message}</p>
            )}

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea placeholder="Observaciones del despacho..." rows={2} {...register('notas')} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => handleSubmit(onSubmit)()} disabled={saving || fields.length === 0}>
              {saving ? 'Registrando...' : 'Registrar Despacho'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG DETALLE ─── */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Detalle de Despacho</DialogTitle></DialogHeader>
          {despachoDetalle && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">Motivo</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MOTIVO_COLORS[despachoDetalle.motivo]}`}>
                    {MOTIVOS.find((m) => m.value === despachoDetalle.motivo)?.label}
                  </span>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Bodega</p>
                  <p className="font-medium">{despachoDetalle.bodegaNombre || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Registrado por</p>
                  <p className="font-medium">{despachoDetalle.usuarioNombre}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Estado</p>
                  <Badge variant={despachoDetalle.anulado ? 'destructive' : 'default'}>
                    {despachoDetalle.anulado ? 'Anulado' : 'Activo'}
                  </Badge>
                </div>
              </div>
              {despachoDetalle.motivoDetalle && (
                <p className="text-sm text-slate-600 bg-slate-50 rounded p-2">
                  📝 {despachoDetalle.motivoDetalle}
                </p>
              )}
              <Separator />
              <div className="space-y-2">
                {despachoDetalle.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-sm py-1 border-b last:border-0">
                    <div>
                      <p className="font-medium">{item.nombre}</p>
                      <p className="text-xs text-slate-400">{item.sku} × {item.cantidad} unid.</p>
                    </div>
                    <p className="font-semibold">{formatCurrency(item.subtotal)}</p>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 rounded-lg p-3 flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{formatCurrency(despachoDetalle.total)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── ALERT ANULAR ─── */}
      <AlertDialog open={!!anulando} onOpenChange={() => setAnulando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular este despacho?</AlertDialogTitle>
            <AlertDialogDescription>
              Se devolverá el stock de todos los productos al inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAnulacion} className="bg-red-600 hover:bg-red-700">
              Anular despacho
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}