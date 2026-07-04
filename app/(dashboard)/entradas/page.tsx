'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, Trash2, PackagePlus, Search, ChevronDown, XCircle,
} from 'lucide-react';

import QuickCreateProveedor from '@/components/shared/QuickCreateProveedor';
import { crearAsientoCompra } from '@/lib/contabilidad/motor-asientos';
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

import { Entrada, Producto, Proveedor, Bodega } from '@/types';
import { subscribeToEntradas, createEntrada, anularEntrada } from '@/lib/firebase/entradas';
import { subscribeToProductos }   from '@/lib/firebase/productos';
import { subscribeToProveedores } from '@/lib/firebase/proveedores';
import { subscribeToBodegas }     from '@/lib/firebase/bodegas';
import { useAuth } from '@/context/AuthContext';

const itemSchema = z.object({
  productoId:     z.string().min(1, 'Selecciona un producto'),
  sku:            z.string(),
  nombre:         z.string(),
  cantidad:       z.coerce.number().min(1, 'Mínimo 1'),
  precioUnitario: z.coerce.number().min(0, 'Precio inválido'),
  subtotal:       z.number().default(0),
});

const schema = z.object({
  proveedorId: z.string().min(1, 'Selecciona un proveedor'),
  bodegaId:    z.string().optional(),
  fecha:       z.string().min(1, 'La fecha es requerida'),
  items:       z.array(itemSchema).min(1, 'Agrega al menos un producto'),
  notas:       z.string().optional(),
});

type EntradaForm = z.infer<typeof schema>;

function formatCurrency(v: number) { return `$${v.toFixed(2)}`; }

export default function EntradasPage() {
  const { user } = useAuth();

  const [entradas,       setEntradas]       = useState<Entrada[]>([]);
  const [productos,      setProductos]      = useState<Producto[]>([]);
  const [proveedores,    setProveedores]    = useState<Proveedor[]>([]);
  const [bodegas,        setBodegas]        = useState<Bodega[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [detailId,       setDetailId]       = useState<string | null>(null);
  const [anulando,       setAnulando]       = useState<string | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [search,         setSearch]         = useState('');
  const [busquedaProd,   setBusquedaProd]   = useState('');
  const [quickProveedor, setQuickProveedor] = useState(false);

  const { register, handleSubmit, reset, watch, setValue, control, formState: { errors } } =
    useForm<EntradaForm>({
      resolver: zodResolver(schema) as any,
      defaultValues: { fecha: new Date().toISOString().split('T')[0], items: [] },
    });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = watch('items');

  const subtotal = watchItems?.reduce((s, i) => s + (i.cantidad * i.precioUnitario || 0), 0) ?? 0;
  const iva      = subtotal * 0.15;
  const total    = subtotal + iva;

  useEffect(() => {
    const u1 = subscribeToEntradas((d) => { setEntradas(d); setLoading(false); });
    const u2 = subscribeToProductos(setProductos);
    const u3 = subscribeToProveedores(setProveedores);
    const u4 = subscribeToBodegas(setBodegas);
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  const productosFiltrados = productos.filter(
    (p) => p.activo && (
      p.nombre.toLowerCase().includes(busquedaProd.toLowerCase()) ||
      p.sku.toLowerCase().includes(busquedaProd.toLowerCase())
    )
  );

  const agregarProducto = (prod: Producto) => {
    const existe = fields.findIndex((f) => f.productoId === prod.id);
    if (existe >= 0) {
      const qty = watchItems[existe].cantidad;
      setValue(`items.${existe}.cantidad`, qty + 1);
      setValue(`items.${existe}.subtotal`, (qty + 1) * watchItems[existe].precioUnitario);
    } else {
      append({
        productoId: prod.id, sku: prod.sku, nombre: prod.nombre,
        cantidad: 1, precioUnitario: prod.precioCompra, subtotal: prod.precioCompra,
      });
    }
    setBusquedaProd('');
  };

  const openCreate = () => {
    reset({ proveedorId: '', bodegaId: '', fecha: new Date().toISOString().split('T')[0], items: [], notas: '' });
    setBusquedaProd('');
    setDialogOpen(true);
  };

  const onSubmit = async (data: EntradaForm) => {
    if (!user) return;
    setSaving(true);
    try {
      const prov   = proveedores.find((p) => p.id === data.proveedorId);
      const bodega = bodegas.find((b) => b.id === data.bodegaId);
      const items  = data.items.map((i) => ({ ...i, subtotal: i.cantidad * i.precioUnitario }));

      const entradaId = await createEntrada(
        {
          fecha:           new Date(data.fecha),
          proveedorId:     data.proveedorId,
          proveedorNombre: prov?.nombre ?? '',
          bodegaId:        data.bodegaId || undefined,
          bodegaNombre:    bodega?.nombre,
          items,
          subtotal,
          iva,
          total,
          usuarioId:       user.uid,
          usuarioNombre:   user.nombre,
          notas:           data.notas,
          createdAt:       new Date(),
        },
        user.uid,
        user.nombre
      );

      // ── Motor contable automático (background) ──
      crearAsientoCompra({
        entradaId,
        fecha:           new Date(data.fecha),
        proveedorNombre: prov?.nombre ?? '',
        subtotal,
        iva,
        total,
        usuarioId:       user.uid,
        usuarioNombre:   user.nombre,
      }).catch(() => {});

      toast.success('Entrada registrada y stock actualizado');
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar la entrada');
    } finally {
      setSaving(false);
    }
  };

  const confirmarAnulacion = async () => {
    if (!anulando || !user) return;
    try {
      await anularEntrada(anulando, user.uid, user.nombre);
      toast.success('Entrada anulada y stock revertido');
    } catch { toast.error('Error al anular la entrada'); }
    finally { setAnulando(null); }
  };

  const filtered       = entradas.filter((e) => e.proveedorNombre.toLowerCase().includes(search.toLowerCase()));
  const entradaDetalle = entradas.find((e) => e.id === detailId);

  return (
    <div>
      <PageHeader
        title="Entradas de Inventario"
        description="Registro de compras a proveedores — ajusta el stock automáticamente"
        action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Nueva Entrada</Button>}
      />

      <div className="mb-4">
        <Input placeholder="Buscar por proveedor..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead className="text-center">Productos</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IVA 15%</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-24">Acc.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                  <PackagePlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay entradas registradas aún.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map((e) => (
              <TableRow key={e.id} className={(e as any).anulada ? 'opacity-50' : ''}>
                <TableCell className="text-sm">
                  {format((e.fecha as any)?.toDate?.() ?? new Date(e.fecha), 'dd/MM/yyyy', { locale: es })}
                </TableCell>
                <TableCell className="font-medium">{e.proveedorNombre}</TableCell>
                <TableCell className="text-slate-500 text-sm">{e.bodegaNombre || '—'}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{e.items.length} ítem(s)</Badge>
                </TableCell>
                <TableCell className="text-right text-sm">{formatCurrency(e.subtotal)}</TableCell>
                <TableCell className="text-right text-sm">{formatCurrency(e.iva)}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(e.total)}</TableCell>
                <TableCell className="text-center">
                  {(e as any).anulada
                    ? <Badge variant="destructive">Anulada</Badge>
                    : <Badge variant="default">Activa</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setDetailId(e.id)}
                      className="h-8 w-8 text-slate-500 hover:text-blue-600">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    {!(e as any).anulada && (
                      <Button variant="ghost" size="icon" onClick={() => setAnulando(e.id)}
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

      {/* ─── DIALOG NUEVA ENTRADA ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Entrada de Inventario</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Proveedor *</Label>
                  <button type="button" onClick={() => setQuickProveedor(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Nuevo
                  </button>
                </div>
                <Select onValueChange={(v) => setValue('proveedorId', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {proveedores.filter((p) => p.activo).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.proveedorId && <p className="text-xs text-red-500">{errors.proveedorId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Bodega</Label>
                <Select onValueChange={(v) => setValue('bodegaId', v)}>
                  <SelectTrigger><SelectValue placeholder="Sin bodega específica" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin bodega específica</SelectItem>
                    {bodegas.filter((b) => b.activa).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input type="date" {...register('fecha')} />
                {errors.fecha && <p className="text-xs text-red-500">{errors.fecha.message}</p>}
              </div>
            </div>

            <Separator />

            <div>
              <Label>Agregar Productos</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Buscar por nombre o SKU..." className="pl-9"
                  value={busquedaProd} onChange={(e) => setBusquedaProd(e.target.value)} />
              </div>
              {busquedaProd && (
                <div className="mt-1 border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {productosFiltrados.length === 0 ? (
                    <p className="text-sm text-slate-400 p-3">Sin resultados</p>
                  ) : productosFiltrados.map((p) => (
                    <button key={p.id} type="button" onClick={() => agregarProducto(p)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{p.nombre}</p>
                        <p className="text-xs text-slate-400">{p.sku} — Stock: {p.stockActual}</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{formatCurrency(p.precioCompra)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

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
                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <p className="font-medium text-sm">{field.nombre}</p>
                            <p className="text-xs text-slate-400">{field.sku}</p>
                          </TableCell>
                          <TableCell>
                            <Input type="number" min="1" className="text-center h-8"
                              {...register(`items.${idx}.cantidad`)} />
                          </TableCell>
                          <TableCell>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                              <Input type="number" step="0.01" min="0"
                                className="pl-6 h-8 text-right" {...register(`items.${idx}.precioUnitario`)} />
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
                <div className="bg-slate-50 px-4 py-3 flex justify-end gap-8 text-sm border-t">
                  <div className="text-slate-500">Subtotal: <span className="font-semibold text-slate-700">{formatCurrency(subtotal)}</span></div>
                  <div className="text-slate-500">IVA 15%: <span className="font-semibold text-slate-700">{formatCurrency(iva)}</span></div>
                  <div className="text-slate-600 font-bold">Total: <span className="text-slate-900">{formatCurrency(total)}</span></div>
                </div>
              </div>
            )}

            {errors.items && (
              <p className="text-xs text-red-500">{errors.items.message ?? errors.items.root?.message}</p>
            )}

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea placeholder="Observaciones de la entrada..." rows={2} {...register('notas')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => handleSubmit(onSubmit)()} disabled={saving || fields.length === 0}>
              {saving ? 'Registrando...' : 'Registrar Entrada'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG DETALLE ─── */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Detalle de Entrada</DialogTitle></DialogHeader>
          {entradaDetalle && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-400 text-xs">Proveedor</p><p className="font-medium">{entradaDetalle.proveedorNombre}</p></div>
                <div><p className="text-slate-400 text-xs">Bodega</p><p className="font-medium">{entradaDetalle.bodegaNombre || '—'}</p></div>
                <div><p className="text-slate-400 text-xs">Registrado por</p><p className="font-medium">{entradaDetalle.usuarioNombre}</p></div>
                <div><p className="text-slate-400 text-xs">Estado</p>
                  <Badge variant={(entradaDetalle as any).anulada ? 'destructive' : 'default'}>
                    {(entradaDetalle as any).anulada ? 'Anulada' : 'Activa'}
                  </Badge>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                {entradaDetalle.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-sm py-1 border-b last:border-0">
                    <div>
                      <p className="font-medium">{item.nombre}</p>
                      <p className="text-xs text-slate-400">{item.sku} × {item.cantidad} unid.</p>
                    </div>
                    <p className="font-semibold">{formatCurrency(item.cantidad * item.precioUnitario)}</p>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 rounded-lg p-3 flex justify-between text-sm font-semibold">
                <span>Total</span><span>{formatCurrency(entradaDetalle.total)}</span>
              </div>
              {entradaDetalle.notas && <p className="text-xs text-slate-500">📝 {entradaDetalle.notas}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── ALERT ANULAR ─── */}
      <AlertDialog open={!!anulando} onOpenChange={() => setAnulando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular esta entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              Se revertirá el stock de todos los productos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAnulacion} className="bg-red-600 hover:bg-red-700">
              Anular entrada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── QUICK CREATE PROVEEDOR ─── */}
      <QuickCreateProveedor
        open={quickProveedor}
        onClose={() => setQuickProveedor(false)}
        onCreated={(id, nombre) => {
          toast.success(`Proveedor "${nombre}" creado — selecciónalo en la lista`);
          setQuickProveedor(false);
        }}
      />
    </div>
  );
}