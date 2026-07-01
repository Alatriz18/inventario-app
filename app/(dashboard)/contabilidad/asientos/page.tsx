'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Trash2, BookOpen, ChevronDown, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Separator }from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { AsientoContable, CuentaContable, TipoAsiento } from '@/types';
import { subscribeToAsientos, createAsiento, confirmarAsiento, editarAsiento } from '@/lib/firebase/asientos';
import { subscribeToCuentas } from '@/lib/firebase/plan-cuentas';
import { useAuth } from '@/context/AuthContext';

const lineaSchema = z.object({
  cuentaCodigo: z.string().min(1, 'Requerido'),
  descripcion:  z.string().optional(),
  debe:         z.coerce.number().min(0),
  haber:        z.coerce.number().min(0),
});

const schema = z.object({
  fecha:    z.string().min(1, 'Requerida'),
  concepto: z.string().min(1, 'Requerido'),
  tipo:     z.enum(['manual','apertura','ajuste_inventario','cierre']),
  lineas:   z.array(lineaSchema).min(2, 'Mínimo 2 líneas'),
});

type AsientoForm = z.infer<typeof schema>;

function currency(v: number) { return `$${v.toFixed(2)}`; }

const TIPO_LABELS: Record<string, string> = {
  venta_factura: 'Venta c/Factura', venta_nota: 'Venta s/Factura',
  compra_proveedor: 'Compra', pago_proveedor: 'Pago Proveedor',
  cobro_cliente: 'Cobro Cliente', ajuste_inventario: 'Ajuste Inv.',
  apertura: 'Apertura', cierre: 'Cierre', manual: 'Manual',
};

const TIPO_COLORS: Record<string, string> = {
  venta_factura: 'bg-green-50 text-green-700',
  venta_nota:    'bg-green-50 text-green-700',
  compra_proveedor: 'bg-blue-50 text-blue-700',
  pago_proveedor:'bg-orange-50 text-orange-700',
  manual:        'bg-slate-100 text-slate-600',
  apertura:      'bg-purple-50 text-purple-700',
  cierre:        'bg-red-50 text-red-700',
};

export default function AsientosPage() {
  const { user } = useAuth();
  const [asientos,   setAsientos]   = useState<AsientoContable[]>([]);
  const [cuentas,    setCuentas]    = useState<CuentaContable[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null); // null = crear, string = editar
  const [detailId,   setDetailId]   = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');

  const { register, handleSubmit, reset, watch, setValue, control, formState: { errors } } =
    useForm<AsientoForm>({
      resolver: zodResolver(schema) as any,
      defaultValues: { fecha: new Date().toISOString().split('T')[0], tipo: 'manual', lineas: [{},{},] as any },
    });

  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' });
  const watchLineas = watch('lineas');

  const totalDebe  = watchLineas?.reduce((s, l) => s + (Number(l.debe)  || 0), 0) ?? 0;
  const totalHaber = watchLineas?.reduce((s, l) => s + (Number(l.haber) || 0), 0) ?? 0;
  const cuadra     = Math.abs(totalDebe - totalHaber) < 0.01;

  useEffect(() => {
    const u1 = subscribeToAsientos((d) => { setAsientos(d); setLoading(false); });
    const u2 = subscribeToCuentas(setCuentas);
    return () => { u1(); u2(); };
  }, []);

  const openCreate = () => {
    setEditId(null);
    reset({
      fecha: new Date().toISOString().split('T')[0],
      concepto: '', tipo: 'manual',
      lineas: [
        { cuentaCodigo: '', descripcion: '', debe: 0, haber: 0 },
        { cuentaCodigo: '', descripcion: '', debe: 0, haber: 0 },
      ],
    });
    setDialogOpen(true);
  };

  const openEdit = (asiento: AsientoContable) => {
    if (asiento.bloqueado) {
      toast.error('Asiento bloqueado — el período contable está cerrado');
      return;
    }
    setEditId(asiento.id);
    const fechaDate = (asiento.fecha as any)?.toDate?.() ?? new Date(asiento.fecha as any);
    reset({
      fecha:    fechaDate.toISOString().split('T')[0],
      concepto: asiento.concepto,
      tipo:     (['manual','apertura','ajuste_inventario','cierre'].includes(asiento.tipo)
                  ? asiento.tipo : 'manual') as any,
      lineas: asiento.lineas.map(l => ({
        cuentaCodigo: l.cuentaCodigo,
        descripcion:  l.descripcion ?? '',
        debe:         l.debe,
        haber:        l.haber,
      })),
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: AsientoForm) => {
    if (!cuadra) { toast.error('El asiento no cuadra — Debe = Haber'); return; }
    if (!user) return;
    setSaving(true);
    try {
      const lineas = data.lineas.map((l, i) => {
        const cuenta = cuentas.find(c => c.codigo === l.cuentaCodigo);
        return {
          id:           `${i}-${Date.now()}`,
          cuentaId:     cuenta?.id    ?? l.cuentaCodigo,
          cuentaCodigo: l.cuentaCodigo,
          cuentaNombre: cuenta?.nombre ?? l.cuentaCodigo,
          debe:         Number(l.debe)  || 0,
          haber:        Number(l.haber) || 0,
          descripcion:  l.descripcion  || '',
        };
      });

      if (editId) {
        // EDITAR asiento existente
        await editarAsiento(
          editId,
          { concepto: data.concepto, fecha: new Date(data.fecha), lineas },
          user.uid, user.nombre
        );
        toast.success('Asiento actualizado');
      } else {
        // CREAR nuevo asiento manual
        await createAsiento({
          fecha:              new Date(data.fecha),
          concepto:           data.concepto,
          tipo:               data.tipo as TipoAsiento,
          lineas,
          totalDebe,
          totalHaber,
          estado:             'confirmado',
          bloqueado:          false,
          editadoManualmente: false,
          usuarioId:          user.uid,
          usuarioNombre:      user.nombre,
          createdAt:          new Date(),
        });
        toast.success('Asiento registrado');
      }
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al guardar el asiento');
    }
    finally { setSaving(false); }
  };


  const filtered = asientos.filter(a =>
    a.concepto.toLowerCase().includes(search.toLowerCase()) ||
    a.numero?.includes(search)
  );

  const detalle = asientos.find(a => a.id === detailId);

  const exportar = () => {
    const rows = asientos.flatMap(a =>
      a.lineas.map(l => ({
        Número:       a.numero,
        Fecha:        format((a.fecha as any)?.toDate?.() ?? new Date(a.fecha), 'dd/MM/yyyy'),
        Concepto:     a.concepto,
        Tipo:         TIPO_LABELS[a.tipo],
        Cuenta:       l.cuentaCodigo,
        NombreCuenta: l.cuentaNombre,
        Debe:         l.debe,
        Haber:        l.haber,
        Descripcion:  l.descripcion,
      }))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asientos');
    XLSX.writeFile(wb, 'libro_diario.xlsx');
  };

  return (
    <div>
      <PageHeader
        title="Asientos Contables"
        description="Registro de asientos manuales y automáticos"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportar}>
              <Download className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo Asiento
            </Button>
          </div>
        }
      />

      <div className="mb-4">
        <Input placeholder="Buscar por concepto o número..."
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="hidden sm:table-cell">Número</TableHead>
              <TableHead className="hidden sm:table-cell">Fecha</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-center hidden md:table-cell">Tipo</TableHead>
              <TableHead className="text-right">Debe</TableHead>
              <TableHead className="text-right">Haber</TableHead>
              <TableHead className="text-center hidden sm:table-cell">Estado</TableHead>
              <TableHead className="text-center w-16">Ver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({length:5}).map((_,i) => (
                <TableRow key={i}>{Array.from({length:8}).map((_,j) =>
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay asientos registrados.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(a => {
              const fecha = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
              return (
                <TableRow key={a.id} className={a.bloqueado ? 'opacity-60' : ''}>
                  <TableCell className="font-mono text-xs font-semibold hidden sm:table-cell">{a.numero}</TableCell>
                  <TableCell className="text-sm text-slate-500 hidden sm:table-cell">
                    {format(fecha, 'dd/MM/yyyy', { locale: es })}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span>{a.concepto}</span>
                      <div className="flex gap-1">
                        {a.editadoManualmente && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                            editado manualmente
                          </span>
                        )}
                        {a.referenciaId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {a.referenciaTipo}
                          </span>
                        )}
                        {a.bloqueado && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                            período cerrado
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[a.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
                      {TIPO_LABELS[a.tipo] ?? a.tipo}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold text-blue-600">{currency(a.totalDebe)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold text-red-600">{currency(a.totalHaber)}</TableCell>
                  <TableCell className="text-center hidden sm:table-cell">
                    <Badge variant={a.estado === 'confirmado' ? 'default' : 'secondary'} className="text-xs">
                      {a.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex gap-1 justify-center">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}
                        className="h-7 w-7 text-slate-400 hover:text-amber-600"
                        title="Editar asiento">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDetailId(a.id)}
                        className="h-7 w-7 text-slate-400 hover:text-blue-600"
                        title="Ver detalle">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* ─── DIALOG CREAR / EDITAR ASIENTO ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editId ? 'Editar Asiento Contable' : 'Nuevo Asiento Contable'}
            </DialogTitle>
            {editId && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-1">
                Este asiento fue generado automáticamente por el sistema. Al editarlo se marcará como "editado manualmente"
                y no se sobreescribirá si el documento origen cambia (salvo que uses "Recalcular desde origen").
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input type="date" {...register('fecha')} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Concepto *</Label>
                <Input placeholder="Descripción del asiento" {...register('concepto')} />
                {errors.concepto && <p className="text-xs text-red-500">{errors.concepto.message}</p>}
              </div>
            </div>

            <Separator />

            {/* Líneas del asiento */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Líneas del asiento</Label>
                <button type="button" onClick={() => append({ cuentaCodigo:'', descripcion:'', debe:0, haber:0 } as any)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Agregar línea
                </button>
              </div>
              <div className="border rounded-lg overflow-x-auto">
                <Table className="min-w-[480px]">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Código cuenta</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="w-28 text-right">Debe</TableHead>
                      <TableHead className="w-28 text-right">Haber</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, idx) => {
                      const codigo = watchLineas?.[idx]?.cuentaCodigo ?? '';
                      const cuenta = cuentas.find(c => c.codigo === codigo);
                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <Input className="h-7 font-mono text-xs w-24"
                              placeholder="1.1.01" {...register(`lineas.${idx}.cuentaCodigo`)} />
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {cuenta?.nombre ?? (codigo ? '⚠ No encontrada' : '')}
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" min="0" className="h-7 text-right w-24"
                              {...register(`lineas.${idx}.debe`)} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" min="0" className="h-7 text-right w-24"
                              {...register(`lineas.${idx}.haber`)} />
                          </TableCell>
                          <TableCell>
                            {fields.length > 2 && (
                              <button type="button" onClick={() => remove(idx)}
                                className="text-slate-300 hover:text-red-500">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {/* Totales */}
                <div className={`px-4 py-2.5 border-t flex justify-end gap-8 text-sm ${cuadra ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className="text-slate-500">
                    Debe: <span className="font-bold text-blue-600">{currency(totalDebe)}</span>
                  </span>
                  <span className="text-slate-500">
                    Haber: <span className="font-bold text-red-600">{currency(totalHaber)}</span>
                  </span>
                  <span className={`font-bold ${cuadra ? 'text-green-600' : 'text-red-600'}`}>
                    {cuadra ? '✓ Cuadra' : `Diferencia: ${currency(Math.abs(totalDebe - totalHaber))}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => handleSubmit(onSubmit)()} disabled={saving || !cuadra}>
              {saving ? 'Guardando...' : editId ? 'Guardar cambios' : 'Registrar Asiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG DETALLE ─── */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Detalle del Asiento</DialogTitle></DialogHeader>
          {detalle && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-xs text-slate-400">Número</p><p className="font-mono font-bold">{detalle.numero}</p></div>
                <div><p className="text-xs text-slate-400">Fecha</p>
                  <p className="font-medium">
                    {format((detalle.fecha as any)?.toDate?.() ?? new Date(detalle.fecha), 'dd/MM/yyyy')}
                  </p>
                </div>
                <div className="col-span-2"><p className="text-xs text-slate-400">Concepto</p><p className="font-medium">{detalle.concepto}</p></div>
              </div>
              <Separator />
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Cuenta</TableHead>
                    <TableHead className="text-right">Debe</TableHead>
                    <TableHead className="text-right">Haber</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalle.lineas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <p className="font-mono text-xs">{l.cuentaCodigo}</p>
                        <p className="text-xs text-slate-500">{l.cuentaNombre}</p>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-blue-600">
                        {l.debe > 0 ? currency(l.debe) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        {l.haber > 0 ? currency(l.haber) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="bg-slate-50 rounded-lg p-3 flex justify-end gap-8 text-sm">
                <span>Debe: <strong className="text-blue-600">{currency(detalle.totalDebe)}</strong></span>
                <span>Haber: <strong className="text-red-600">{currency(detalle.totalHaber)}</strong></span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}