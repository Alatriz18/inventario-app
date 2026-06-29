'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Package, ImageIcon, X } from 'lucide-react';

import QuickCreateCategoria from '@/components/shared/QuickCreateCategoria';
import PageHeader from '@/components/shared/PageHeader';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { Producto, Categoria } from '@/types';
import { subscribeToProductos, createProducto, updateProducto, deleteProducto } from '@/lib/firebase/productos';
import { subscribeToCategorias } from '@/lib/firebase/categorias';
import { comprimirImagenBase64 } from '@/lib/utils/imagen';
import { tieneAccesoAccion } from '@/lib/permisos';
import { useAuth } from '@/context/AuthContext';

const schema = z.object({
  sku:          z.string().min(1, 'El SKU es requerido'),
  nombre:       z.string().min(1, 'El nombre es requerido'),
  descripcion:  z.string().optional(),
  categoriaId:  z.string().min(1, 'Selecciona una categoría'),
  precioCompra: z.coerce.number().min(0, 'Precio inválido'),
  precioVenta:  z.coerce.number().min(0.01, 'Precio inválido'),
  stockActual:  z.coerce.number().min(0),
  stockMinimo:  z.coerce.number().min(0),
  activo:       z.boolean(),
});

type ProductoForm = z.infer<typeof schema>;

function formatCurrency(val: number) { return `$${val.toFixed(2)}`; }

function MargenBadge({ compra, venta }: { compra: number; venta: number }) {
  if (venta === 0) return null;
  const pct = ((venta - compra) / venta) * 100;
  const color = pct >= 30 ? 'bg-green-100 text-green-700'
    : pct >= 10 ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-700';
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{pct.toFixed(0)}%</span>;
}

export default function ProductosPage() {
  const { user } = useAuth();
  const puedeEditar  = user ? tieneAccesoAccion(user.rol, 'editar_productos') : false;
  const puedePrecios = user ? tieneAccesoAccion(user.rol, 'editar_precios')   : false;
  const verCostos    = user ? tieneAccesoAccion(user.rol, 'ver_costos')       : false;
  const verGanancias = user ? tieneAccesoAccion(user.rol, 'ver_ganancias')    : false;

  const [productos,    setProductos]    = useState<Producto[]>([]);
  const [categorias,   setCategorias]   = useState<Categoria[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [editing,      setEditing]      = useState<Producto | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null); // base64 (data URL)
  const [procesandoImg,setProcesandoImg]= useState(false);
  const [search,       setSearch]       = useState('');
  const [quickCat,     setQuickCat]     = useState(false); // ← dentro del componente
  const fileRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<ProductoForm>({ resolver: zodResolver(schema) as any });

  const precioCompra = watch('precioCompra') || 0;
  const precioVenta  = watch('precioVenta')  || 0;

  useEffect(() => {
    const u1 = subscribeToProductos((d) => { setProductos(d); setLoading(false); });
    const u2 = subscribeToCategorias(setCategorias);
    return () => { u1(); u2(); };
  }, []);

  const openCreate = () => {
    setEditing(null);
    setImagePreview(null);
    reset({ sku: '', nombre: '', descripcion: '', categoriaId: '',
      precioCompra: 0, precioVenta: 0, stockActual: 0, stockMinimo: 5, activo: true });
    setDialogOpen(true);
  };

  const openEdit = (p: Producto) => {
    setEditing(p);
    setImagePreview(p.imagen || null);
    reset({
      sku: p.sku, nombre: p.nombre, descripcion: p.descripcion ?? '',
      categoriaId: p.categoriaId, precioCompra: p.precioCompra,
      precioVenta: p.precioVenta, stockActual: p.stockActual,
      stockMinimo: p.stockMinimo, activo: p.activo,
    });
    setDialogOpen(true);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen no puede superar 5MB'); return; }
    setProcesandoImg(true);
    try {
      // Se comprime a una miniatura base64 (~400px) para guardarla en Firestore
      const base64 = await comprimirImagenBase64(file, 400, 0.7);
      setImagePreview(base64);
    } catch {
      toast.error('No se pudo procesar la imagen');
    } finally {
      setProcesandoImg(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onSubmit = async (data: ProductoForm) => {
    setSaving(true);
    try {
      const categoria = categorias.find((c) => c.id === data.categoriaId);
      const payload: Omit<Producto, 'id'> = {
        ...data, categoriaNombre: categoria?.nombre ?? '',
        imagen: imagePreview ?? '', createdAt: editing?.createdAt ?? new Date(), updatedAt: new Date(),
      };
      if (editing) {
        await updateProducto(editing.id, payload);
        toast.success('Producto actualizado');
      } else {
        await createProducto(payload);
        toast.success('Producto creado');
      }
      setDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar el producto');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteProducto(deletingId!);
      toast.success('Producto eliminado');
    } catch { toast.error('Error al eliminar'); }
    finally { setDeletingId(null); }
  };

  const filtered = productos.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Productos"
        description="Catálogo de productos con control de stock"
        action={puedeEditar ? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nuevo Producto</Button> : undefined}
      />

      <div className="mb-4">
        <Input placeholder="Buscar por nombre o SKU..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-16">Imagen</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              {verCostos && <TableHead className="text-right">P. Compra</TableHead>}
              <TableHead className="text-right">P. Venta</TableHead>
              {verGanancias && <TableHead className="text-center">Margen</TableHead>}
              <TableHead className="text-center">Stock</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-24">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10 - (verCostos ? 0 : 1) - (verGanancias ? 0 : 1)} className="text-center py-12 text-slate-400">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{search ? 'Sin resultados.' : 'No hay productos aún.'}</p>
                </TableCell>
              </TableRow>
            ) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {p.imagen ? (
                    <div className="h-10 w-10 rounded-lg overflow-hidden border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imagen} alt={p.nombre} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                      <Package className="h-4 w-4 text-slate-300" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-500">{p.sku}</TableCell>
                <TableCell className="font-medium">{p.nombre}</TableCell>
                <TableCell>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {p.categoriaNombre || '—'}
                  </span>
                </TableCell>
                {verCostos && <TableCell className="text-right text-sm">{formatCurrency(p.precioCompra)}</TableCell>}
                <TableCell className="text-right text-sm font-medium">{formatCurrency(p.precioVenta)}</TableCell>
                {verGanancias && (
                  <TableCell className="text-center">
                    <MargenBadge compra={p.precioCompra} venta={p.precioVenta} />
                  </TableCell>
                )}
                <TableCell className="text-center">
                  <span className={`font-semibold text-sm ${p.stockActual <= p.stockMinimo ? 'text-red-600' : 'text-slate-700'}`}>
                    {p.stockActual}
                  </span>
                  {p.stockActual <= p.stockMinimo && <span className="ml-1 text-xs text-red-400">⚠</span>}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={p.activo ? 'default' : 'secondary'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
                </TableCell>
                <TableCell>
                  {puedeEditar ? (
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
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Crear / Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">

            {/* Imagen */}
            <div className="col-span-2">
              <Label>Imagen del producto</Label>
              <div className="mt-1.5 flex items-center gap-4">
                <div className="h-24 w-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden cursor-pointer hover:border-slate-400 transition-colors relative"
                  onClick={() => fileRef.current?.click()}>
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview} alt="preview" className="absolute inset-0 h-full w-full object-cover rounded-xl" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-300">
                      <ImageIcon className="h-8 w-8" /><span className="text-xs">{procesandoImg ? '...' : 'Subir'}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={procesandoImg}
                    onClick={() => fileRef.current?.click()}>
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {procesandoImg ? 'Procesando…' : imagePreview ? 'Cambiar imagen' : 'Seleccionar imagen'}
                  </Button>
                  {imagePreview && (
                    <Button type="button" variant="ghost" size="sm" className="text-red-500"
                      onClick={() => setImagePreview(null)}>
                      <X className="mr-2 h-4 w-4" /> Quitar imagen
                    </Button>
                  )}
                  <p className="text-xs text-slate-400">JPG, PNG o WEBP. Se guarda optimizada (~400px).</p>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>SKU / Código *</Label>
              <Input placeholder="TAB-001" {...register('sku')} />
              {errors.sku && <p className="text-xs text-red-500">{errors.sku.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input placeholder="Tabaco Cohiba No.4" {...register('nombre')} />
              {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
            </div>

            {/* Categoría con botón inline */}
            <div className="space-y-1.5 col-span-2">
              <div className="flex items-center justify-between">
                <Label>Categoría *</Label>
                <button type="button" onClick={() => setQuickCat(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Nueva
                </button>
              </div>
              <Select onValueChange={(v) => setValue('categoriaId', v)} defaultValue={editing?.categoriaId}>
                <SelectTrigger><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                <SelectContent>
                  {categorias.filter((c) => c.activo).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoriaId && <p className="text-xs text-red-500">{errors.categoriaId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Precio de compra *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-7"
                  disabled={!puedePrecios} {...register('precioCompra')} />
              </div>
              {!puedePrecios && <p className="text-xs text-amber-500">No tienes permiso para modificar precios</p>}
              {errors.precioCompra && <p className="text-xs text-red-500">{errors.precioCompra.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Precio de venta *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-7"
                  disabled={!puedePrecios} {...register('precioVenta')} />
              </div>
              {errors.precioVenta && <p className="text-xs text-red-500">{errors.precioVenta.message}</p>}
            </div>

            {precioVenta > 0 && verGanancias && (
              <div className="col-span-2 bg-slate-50 rounded-lg p-3 flex gap-6">
                <div>
                  <p className="text-xs text-slate-400">Ganancia unitaria</p>
                  <p className="font-semibold text-slate-700">{formatCurrency(precioVenta - precioCompra)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Margen</p>
                  <p className="font-semibold text-slate-700">
                    {(((precioVenta - precioCompra) / precioVenta) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Stock inicial</Label>
              <Input type="number" min="0" placeholder="0" {...register('stockActual')} />
            </div>

            <div className="space-y-1.5">
              <Label>Stock mínimo (alerta)</Label>
              <Input type="number" min="0" placeholder="5" {...register('stockMinimo')} />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Descripción</Label>
              <Textarea placeholder="Descripción del producto..." rows={2} {...register('descripcion')} />
            </div>

            {editing && (
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="activo-prod"
                  className="h-4 w-4 rounded border-slate-300" {...register('activo')} />
                <Label htmlFor="activo-prod">Producto activo</Label>
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

      {/* Alert Eliminar */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará el producto y su imagen. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── QUICK CREATE CATEGORÍA ─── */}
      <QuickCreateCategoria
        open={quickCat}
        onClose={() => setQuickCat(false)}
        onCreated={(nombre) => {
          toast.success(`Categoría "${nombre}" creada — selecciónala en la lista`);
          setQuickCat(false);
        }}
      />
    </div>
  );
}