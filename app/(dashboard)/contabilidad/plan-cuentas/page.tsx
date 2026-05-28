'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, BookMarked, Download, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { CuentaContable, TipoCuenta, NaturalezaCuenta } from '@/types';
import { subscribeToCuentas, createCuenta, updateCuenta, seedPlanCuentas } from '@/lib/firebase/plan-cuentas';

const TIPO_COLORS: Record<string, string> = {
  activo:    'bg-blue-50 text-blue-700',
  pasivo:    'bg-red-50 text-red-700',
  patrimonio:'bg-purple-50 text-purple-700',
  ingreso:   'bg-green-50 text-green-700',
  costo:     'bg-orange-50 text-orange-700',
  gasto:     'bg-slate-100 text-slate-600',
};

const schema = z.object({
  codigo:           z.string().min(1, 'Requerido'),
  nombre:           z.string().min(1, 'Requerido'),
  tipo:             z.enum(['activo','pasivo','patrimonio','ingreso','costo','gasto']),
  naturaleza:       z.enum(['deudora','acreedora']),
  nivel:            z.coerce.number().min(1).max(5),
  aceptaMovimientos:z.boolean(),
  activa:           z.boolean(),
});

type CuentaForm = z.infer<typeof schema>;

export default function PlanCuentasPage() {
  const [cuentas,    setCuentas]    = useState<CuentaContable[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [seeding,    setSeeding]    = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<CuentaContable | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const { register, handleSubmit, reset, setValue, formState: { errors } } =
    useForm<CuentaForm>({ resolver: zodResolver(schema) as any });

  useEffect(() => {
    return subscribeToCuentas((d) => { setCuentas(d); setLoading(false); });
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedPlanCuentas();
      toast.success('Plan de cuentas cargado correctamente');
    } catch { toast.error('Error al cargar el plan de cuentas'); }
    finally { setSeeding(false); }
  };

  const openCreate = () => {
    setEditing(null);
    reset({ codigo:'', nombre:'', tipo:'activo', naturaleza:'deudora', nivel:3, aceptaMovimientos:true, activa:true });
    setDialogOpen(true);
  };

  const openEdit = (c: CuentaContable) => {
    setEditing(c);
    reset({ codigo:c.codigo, nombre:c.nombre, tipo:c.tipo, naturaleza:c.naturaleza,
      nivel:c.nivel, aceptaMovimientos:c.aceptaMovimientos, activa:c.activa });
    setDialogOpen(true);
  };

  const onSubmit = async (data: CuentaForm) => {
    setSaving(true);
    try {
      const payload = { ...data, nivel: data.nivel as 1|2|3|4|5 };
      if (editing) {
        await updateCuenta(editing.id, payload);
        toast.success('Cuenta actualizada');
      } else {
        await createCuenta({ ...payload, activa: true });
        toast.success('Cuenta creada');
      }
      setDialogOpen(false);
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  const exportar = () => {
    const rows = filtered.map(c => ({
      Código: c.codigo, Nombre: c.nombre, Tipo: c.tipo,
      Naturaleza: c.naturaleza, Nivel: c.nivel,
      AceptaMovimientos: c.aceptaMovimientos ? 'SÍ' : 'NO',
      Activa: c.activa ? 'SÍ' : 'NO',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plan de Cuentas');
    XLSX.writeFile(wb, 'plan_cuentas.xlsx');
  };

  const filtered = cuentas.filter(c => {
    const matchSearch = !search ||
      c.codigo.includes(search) ||
      c.nombre.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filtroTipo === 'todos' || c.tipo === filtroTipo;
    return matchSearch && matchTipo;
  });

  return (
    <div>
      <PageHeader
        title="Plan de Cuentas"
        description="Plan de cuentas contable NEC/NIIF para Ecuador"
        action={
          <div className="flex gap-2">
            {cuentas.length === 0 && (
              <Button variant="outline" onClick={handleSeed} disabled={seeding}>
                <RefreshCw className={`mr-2 h-4 w-4 ${seeding ? 'animate-spin' : ''}`} />
                {seeding ? 'Cargando...' : 'Cargar Plan Estándar'}
              </Button>
            )}
            <Button variant="outline" onClick={exportar} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Nueva Cuenta
            </Button>
          </div>
        }
      />

      {cuentas.length === 0 && !loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-700">
          📋 El plan de cuentas está vacío. Carga el plan estándar ecuatoriano (NEC/NIIF) con el botón
          <strong> "Cargar Plan Estándar"</strong> o crea las cuentas manualmente.
        </div>
      )}

      <div className="flex gap-3 mb-4 flex-wrap">
        <Input placeholder="Buscar por código o nombre..."
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select onValueChange={setFiltroTipo} defaultValue="todos">
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activo">Activo</SelectItem>
            <SelectItem value="pasivo">Pasivo</SelectItem>
            <SelectItem value="patrimonio">Patrimonio</SelectItem>
            <SelectItem value="ingreso">Ingresos</SelectItem>
            <SelectItem value="costo">Costos</SelectItem>
            <SelectItem value="gasto">Gastos</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="self-center">{filtered.length} cuenta(s)</Badge>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-28">Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center">Tipo</TableHead>
              <TableHead className="text-center">Naturaleza</TableHead>
              <TableHead className="text-center w-16">Nivel</TableHead>
              <TableHead className="text-center">Movim.</TableHead>
              <TableHead className="text-center w-24">Acc.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({length:8}).map((_,i) => (
                <TableRow key={i}>{Array.from({length:7}).map((_,j) =>
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                  <BookMarked className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay cuentas registradas.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(c => (
              <TableRow key={c.id}
                className={`${!c.activa ? 'opacity-40' : ''} ${c.nivel === 1 ? 'bg-slate-50 font-bold' : c.nivel === 2 ? 'bg-slate-50/50' : ''}`}
                style={{ paddingLeft: `${(c.nivel - 1) * 16}px` }}>
                <TableCell className="font-mono text-sm font-semibold">{c.codigo}</TableCell>
                <TableCell>
                  <span style={{ marginLeft: `${(c.nivel - 1) * 12}px` }}
                    className={c.nivel <= 2 ? 'font-semibold' : ''}>
                    {c.nombre}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[c.tipo]}`}>
                    {c.tipo}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className={`text-xs ${c.naturaleza === 'deudora' ? 'text-blue-600' : 'text-red-600'}`}>
                    {c.naturaleza}
                  </span>
                </TableCell>
                <TableCell className="text-center text-sm text-slate-500">{c.nivel}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.aceptaMovimientos ? 'default' : 'secondary'} className="text-xs">
                    {c.aceptaMovimientos ? 'Sí' : 'No'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}
                    className="h-7 w-7 text-slate-400 hover:text-blue-600">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Cuenta' : 'Nueva Cuenta Contable'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input placeholder="ej: 1.1.09" {...register('codigo')} />
              {errors.codigo && <p className="text-xs text-red-500">{errors.codigo.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nivel (1-5) *</Label>
              <Input type="number" min="1" max="5" {...register('nivel')} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Nombre *</Label>
              <Input placeholder="Nombre de la cuenta" {...register('nombre')} />
              {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select onValueChange={v => setValue('tipo', v as TipoCuenta)}
                defaultValue={editing?.tipo ?? 'activo'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['activo','pasivo','patrimonio','ingreso','costo','gasto'].map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Naturaleza *</Label>
              <Select onValueChange={v => setValue('naturaleza', v as NaturalezaCuenta)}
                defaultValue={editing?.naturaleza ?? 'deudora'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deudora">Deudora</SelectItem>
                  <SelectItem value="acreedora">Acreedora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="acepta" className="h-4 w-4"
                  {...register('aceptaMovimientos')} />
                <Label htmlFor="acepta">Acepta movimientos</Label>
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="activa" className="h-4 w-4"
                    {...register('activa')} />
                  <Label htmlFor="activa">Activa</Label>
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
    </div>
  );
}