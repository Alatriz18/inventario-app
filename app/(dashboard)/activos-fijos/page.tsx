'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Calculator, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { ActivoFijo, MetodoDepreciacion } from '@/types';
import {
  subscribeToActivosFijos, createActivoFijo,
  generarCuotas, registrarDepreciacionMensual,
} from '@/lib/firebase/activos-fijos';
import { crearAsientoDepreciacion } from '@/lib/contabilidad/motor-asientos';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;

const CATEGORIAS = [
  'Muebles y Enseres', 'Equipos de Cómputo', 'Maquinaria y Equipo',
  'Vehículos', 'Edificios', 'Terrenos', 'Equipos de Oficina', 'Otros',
];

const TASAS_NIIF: Record<string, number> = {
  'Muebles y Enseres':   10,
  'Equipos de Cómputo':  33.33,
  'Maquinaria y Equipo': 10,
  'Vehículos':           20,
  'Edificios':           5,
  'Terrenos':            0,
  'Equipos de Oficina':  10,
  'Otros':               10,
};

const BADGE_ESTADO: Record<string, string> = {
  activo:         'bg-green-100 text-green-700',
  depreciado:     'bg-slate-100 text-slate-600',
  dado_de_baja:   'bg-red-100 text-red-700',
  vendido:        'bg-blue-100 text-blue-700',
};

export default function ActivosFijosPage() {
  const { user } = useAuth();
  const [activos,  setActivos]  = useState<ActivoFijo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Dialog crear
  const [dlgOpen, setDlgOpen] = useState(false);
  const [form, setForm] = useState({
    codigo: '', descripcion: '', categoria: 'Equipos de Cómputo',
    fechaAdquisicion: format(new Date(), 'yyyy-MM-dd'),
    valorAdquisicion: '', valorResidual: '0',
    vidaUtilAnios: '5', metodoDepreciacion: 'linea_recta' as MetodoDepreciacion,
    tasaDepreciacion: '20', ubicacion: '', notas: '',
    cuentaActivoCodigo: '1.2.01', cuentaDepAcumCodigo: '1.2.01.01', cuentaGastoDepCodigo: '5.2.01',
  });
  const [saving, setSaving] = useState(false);

  // Depreciación mensual
  const [dlgDep,       setDlgDep]       = useState(false);
  const [activoDepSel, setActivoDepSel] = useState<ActivoFijo | null>(null);
  const [mesSel,       setMesSel]       = useState(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`);
  const [savingDep,    setSavingDep]    = useState(false);

  useEffect(() => {
    const unsub = subscribeToActivosFijos(d => { setActivos(d); setLoading(false); });
    return unsub;
  }, []);

  const kpis = useMemo(() => ({
    totalAdquisicion: activos.reduce((s, a) => s + a.valorAdquisicion, 0),
    totalDepAcum:     activos.reduce((s, a) => s + a.depreciacionAcumulada, 0),
    totalLibros:      activos.reduce((s, a) => s + a.valorLibros, 0),
    countActivos:     activos.filter(a => a.estado === 'activo').length,
  }), [activos]);

  const cuotaPreview = useMemo(() => {
    const val  = parseFloat(form.valorAdquisicion) || 0;
    const res  = parseFloat(form.valorResidual)    || 0;
    const vida = parseInt(form.vidaUtilAnios)       || 1;
    if (form.metodoDepreciacion === 'linea_recta') {
      return (val - res) / (vida * 12);
    }
    const tasa = parseFloat(form.tasaDepreciacion) / 100 / 12;
    return val * tasa;
  }, [form]);

  const handleCrear = async () => {
    if (!form.codigo || !form.descripcion || !form.valorAdquisicion) {
      toast.error('Código, descripción y valor son requeridos');
      return;
    }
    setSaving(true);
    try {
      await createActivoFijo({
        codigo:              form.codigo,
        descripcion:         form.descripcion,
        categoria:           form.categoria,
        fechaAdquisicion:    new Date(form.fechaAdquisicion + 'T00:00:00'),
        valorAdquisicion:    parseFloat(form.valorAdquisicion),
        valorResidual:       parseFloat(form.valorResidual) || 0,
        vidaUtilAnios:       parseInt(form.vidaUtilAnios) || 5,
        metodoDepreciacion:  form.metodoDepreciacion,
        tasaDepreciacion:    parseFloat(form.tasaDepreciacion) || 20,
        estado:              'activo',
        ubicacion:           form.ubicacion || undefined,
        notas:               form.notas || undefined,
        cuentaActivoCodigo:  form.cuentaActivoCodigo,
        cuentaDepAcumCodigo: form.cuentaDepAcumCodigo,
        cuentaGastoDepCodigo:form.cuentaGastoDepCodigo,
      });
      toast.success('Activo fijo registrado');
      setDlgOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al registrar activo');
    } finally {
      setSaving(false);
    }
  };

  const abrirDepreciacion = (activo: ActivoFijo) => {
    setActivoDepSel(activo);
    const hoy = new Date();
    setMesSel(`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`);
    setDlgDep(true);
  };

  const cuotaDelMes = useMemo(() => {
    if (!activoDepSel || !mesSel) return null;
    const [anio, mes] = mesSel.split('-').map(Number);
    return activoDepSel.cuotas?.find(c => c.anio === anio && c.mes === mes) ?? null;
  }, [activoDepSel, mesSel]);

  const handleRegistrarDep = async () => {
    if (!activoDepSel || !cuotaDelMes || !user) return;
    setSavingDep(true);
    try {
      const [anio, mes] = mesSel.split('-').map(Number);
      const fechaDep    = new Date(anio, mes - 1, 1);

      const asientoId = await crearAsientoDepreciacion({
        activoId:            activoDepSel.id,
        activoDescripcion:   activoDepSel.descripcion,
        fecha:               fechaDep,
        cuota:               cuotaDelMes.cuota,
        cuentaActivoCodigo:  activoDepSel.cuentaActivoCodigo  ?? '1.2.01',
        cuentaDepAcumCodigo: activoDepSel.cuentaDepAcumCodigo ?? '1.2.01.01',
        cuentaGastoDepCodigo:activoDepSel.cuentaGastoDepCodigo ?? '5.2.01',
        usuarioId:           user.uid,
        usuarioNombre:       user.nombre ?? user.email ?? 'Usuario',
      });

      await registrarDepreciacionMensual(
        activoDepSel.id, anio, mes, asientoId ?? 'manual'
      );

      toast.success(`Depreciación ${mesSel} registrada — Cuota: ${currency(cuotaDelMes.cuota)}`);
      setDlgDep(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al registrar depreciación');
    } finally {
      setSavingDep(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activos Fijos"
        description="Registro y depreciación NIIF de activos fijos"
        action={
          <Button size="sm" onClick={() => setDlgOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo Activo
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Activos en uso',       value: kpis.countActivos,                color: 'text-slate-800' },
          { label: 'Costo de adquisición', value: currency(kpis.totalAdquisicion),  color: 'text-slate-800' },
          { label: 'Dep. acumulada',       value: currency(kpis.totalDepAcum),      color: 'text-orange-600' },
          { label: 'Valor en libros',      value: currency(kpis.totalLibros),       color: 'text-blue-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabla activos */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead></TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>F. Adquisición</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Dep. Acum.</TableHead>
              <TableHead className="text-right">Valor libros</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}</TableRow>
              ))
            ) : activos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-slate-400">
                  <Calculator className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No hay activos fijos registrados.
                </TableCell>
              </TableRow>
            ) : activos.map(a => (
              <React.Fragment key={a.id}>
                <TableRow className="cursor-pointer hover:bg-slate-50/50">
                  <TableCell>
                    <button
                      className="text-slate-400 hover:text-slate-700"
                      onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                    >
                      {expanded === a.id
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.codigo}</TableCell>
                  <TableCell className="font-medium text-sm">{a.descripcion}</TableCell>
                  <TableCell>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {a.categoria}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {format((a.fechaAdquisicion as any)?.toDate?.() ?? new Date(a.fechaAdquisicion), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="text-right">{currency(a.valorAdquisicion)}</TableCell>
                  <TableCell className="text-right text-orange-600">{currency(a.depreciacionAcumulada)}</TableCell>
                  <TableCell className="text-right font-semibold text-blue-700">{currency(a.valorLibros)}</TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_ESTADO[a.estado] ?? ''}`}>
                      {a.estado.replace('_', ' ')}
                    </span>
                  </TableCell>
                  <TableCell>
                    {a.estado === 'activo' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => abrirDepreciacion(a)}>
                        Depreciar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>

                {/* Tabla de cuotas expandida */}
                {expanded === a.id && a.cuotas && (
                  <TableRow>
                    <TableCell colSpan={10} className="bg-slate-50/60 p-4">
                      <p className="text-xs font-semibold text-slate-600 mb-2">
                        Tabla de depreciación — {a.metodoDepreciacion.replace('_', ' ')} — Vida útil: {a.vidaUtilAnios} años
                      </p>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-200/60">
                              <th className="text-left px-2 py-1">Período</th>
                              <th className="text-right px-2 py-1">Cuota</th>
                              <th className="text-right px-2 py-1">Dep. Acum.</th>
                              <th className="text-right px-2 py-1">Valor libros</th>
                              <th className="text-center px-2 py-1">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.cuotas.map(c => (
                              <tr key={c.id} className={c.registrado ? 'bg-green-50' : ''}>
                                <td className="px-2 py-0.5 font-mono">
                                  {String(c.mes).padStart(2,'0')}/{c.anio}
                                </td>
                                <td className="text-right px-2 py-0.5">{currency(c.cuota)}</td>
                                <td className="text-right px-2 py-0.5">{currency(c.depAcumulada)}</td>
                                <td className="text-right px-2 py-0.5">{currency(c.valorLibros)}</td>
                                <td className="text-center px-2 py-0.5">
                                  {c.registrado
                                    ? <span className="text-green-600 font-medium">✓ Registrado</span>
                                    : <span className="text-slate-400">Pendiente</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog crear activo */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Activo Fijo</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código *</Label>
              <Input value={form.codigo}
                onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                placeholder="AF-001" className="mt-1" />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={form.categoria}
                onValueChange={v => setForm(f => ({
                  ...f, categoria: v,
                  tasaDepreciacion: String(TASAS_NIIF[v] ?? 10),
                  vidaUtilAnios:    String(TASAS_NIIF[v] ? Math.round(100 / (TASAS_NIIF[v] || 1)) : 10),
                }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Descripción *</Label>
              <Input value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Ej: Laptop Dell Inspiron 15" className="mt-1" />
            </div>
            <div>
              <Label>Fecha de adquisición</Label>
              <Input type="date" value={form.fechaAdquisicion}
                onChange={e => setForm(f => ({ ...f, fechaAdquisicion: e.target.value }))}
                className="mt-1" />
            </div>
            <div>
              <Label>Ubicación</Label>
              <Input value={form.ubicacion}
                onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))}
                placeholder="Oficina principal" className="mt-1" />
            </div>
            <div>
              <Label>Valor de adquisición ($) *</Label>
              <Input type="number" step="0.01" value={form.valorAdquisicion}
                onChange={e => setForm(f => ({ ...f, valorAdquisicion: e.target.value }))}
                className="mt-1" />
            </div>
            <div>
              <Label>Valor residual ($)</Label>
              <Input type="number" step="0.01" value={form.valorResidual}
                onChange={e => setForm(f => ({ ...f, valorResidual: e.target.value }))}
                className="mt-1" />
            </div>
            <div>
              <Label>Método depreciación</Label>
              <Select value={form.metodoDepreciacion}
                onValueChange={v => setForm(f => ({ ...f, metodoDepreciacion: v as MetodoDepreciacion }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="linea_recta">Línea recta (NIIF)</SelectItem>
                  <SelectItem value="saldo_decreciente">Saldo decreciente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vida útil (años)</Label>
              <Input type="number" value={form.vidaUtilAnios}
                onChange={e => setForm(f => ({ ...f, vidaUtilAnios: e.target.value }))}
                className="mt-1" />
            </div>

            {/* Preview cuota */}
            {parseFloat(form.valorAdquisicion) > 0 && (
              <div className="col-span-2 bg-blue-50 rounded-lg p-3 text-sm">
                <p className="text-blue-800 font-medium">
                  Cuota mensual estimada: <strong>{currency(cuotaPreview)}</strong>
                  &nbsp;— Anual: <strong>{currency(cuotaPreview * 12)}</strong>
                </p>
              </div>
            )}

            <div className="col-span-2 border-t pt-3">
              <p className="text-xs font-semibold text-slate-600 mb-2">Cuentas contables</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Activo (cód.)</Label>
                  <Input value={form.cuentaActivoCodigo}
                    onChange={e => setForm(f => ({ ...f, cuentaActivoCodigo: e.target.value }))}
                    className="mt-1 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-xs">Dep. Acumulada</Label>
                  <Input value={form.cuentaDepAcumCodigo}
                    onChange={e => setForm(f => ({ ...f, cuentaDepAcumCodigo: e.target.value }))}
                    className="mt-1 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-xs">Gasto Dep.</Label>
                  <Input value={form.cuentaGastoDepCodigo}
                    onChange={e => setForm(f => ({ ...f, cuentaGastoDepCodigo: e.target.value }))}
                    className="mt-1 text-xs font-mono" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancelar</Button>
            <Button onClick={handleCrear} disabled={saving}>
              {saving ? 'Guardando…' : 'Registrar activo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog depreciar mes */}
      <Dialog open={dlgDep} onOpenChange={setDlgDep}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Depreciación Mensual</DialogTitle>
          </DialogHeader>
          {activoDepSel && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="font-medium">{activoDepSel.descripcion}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Valor libros: <strong>{currency(activoDepSel.valorLibros)}</strong>
                </p>
              </div>
              <div>
                <Label>Mes a depreciar (AAAA-MM)</Label>
                <Input type="month" value={mesSel}
                  onChange={e => setMesSel(e.target.value)} className="mt-1" />
              </div>
              {cuotaDelMes && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm">
                  {cuotaDelMes.registrado ? (
                    <p className="text-orange-600 font-medium">
                      Este período ya fue registrado.
                    </p>
                  ) : (
                    <>
                      <p className="text-blue-800">
                        Cuota: <strong>{currency(cuotaDelMes.cuota)}</strong>
                      </p>
                      <p className="text-blue-600 text-xs mt-1">
                        Dep. acumulada tras registro: {currency(cuotaDelMes.depAcumulada)}
                        &nbsp;— Valor libros: {currency(cuotaDelMes.valorLibros)}
                      </p>
                    </>
                  )}
                </div>
              )}
              {!cuotaDelMes && mesSel && (
                <p className="text-xs text-red-500">
                  No hay cuota programada para este período.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgDep(false)}>Cancelar</Button>
            <Button
              onClick={handleRegistrarDep}
              disabled={savingDep || !cuotaDelMes || cuotaDelMes.registrado}>
              {savingDep ? 'Registrando…' : 'Registrar y crear asiento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
