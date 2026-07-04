'use client';

import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Skeleton }from '@/components/ui/skeleton';
import { Badge }   from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { Venta } from '@/types';
import { subscribeToVentas } from '@/lib/firebase/ventas';
import { getConfigEmpresa }  from '@/lib/firebase/config-empresa';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function currency(v: number) { return `$${Math.abs(v).toFixed(2)}`; }

// Cuotas fijas Negocios Populares (SRI, según tabla vigente)
// Fuente: Resolución SRI NAC-DGERCGC22-00000026
const CUOTAS_NEGOCIOS_POPULARES: Record<string, number> = {
  '2024': 60.00,
  '2025': 65.00,
  '2026': 65.00,
};

interface CampoRIMPE {
  campo:       string;
  descripcion: string;
  valor:       number | string;
  tipo?:       'normal' | 'subtotal' | 'total' | 'info';
}

export default function FormRIMPEPage() {
  const [ventas,    setVentas]    = useState<Venta[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [anio,      setAnio]      = useState(String(new Date().getFullYear()));
  const [mes,       setMes]       = useState(String(new Date().getMonth() + 1));
  const [regimen,   setRegimen]   = useState<'emprendedor' | 'negocio_popular'>('emprendedor');

  useEffect(() => {
    getConfigEmpresa().then(c => {
      if (c?.regimen === 'rimpe_negocio_popular') setRegimen('negocio_popular');
      else setRegimen('emprendedor');
    }).catch(() => {});
    return subscribeToVentas(d => { setVentas(d); setLoading(false); });
  }, []);

  const ventasFiltradas = useMemo(() => {
    return ventas.filter(v => {
      if (v.estado === 'anulada') return false;
      const f = (v.fecha as any)?.toDate?.() ?? new Date(v.fecha);
      return f.getFullYear() === Number(anio) && f.getMonth() + 1 === Number(mes);
    });
  }, [ventas, anio, mes]);

  // Para RIMPE Emprendedor: acumulado anual hasta el mes seleccionado
  const ventasAnuales = useMemo(() => {
    return ventas.filter(v => {
      if (v.estado === 'anulada') return false;
      const f = (v.fecha as any)?.toDate?.() ?? new Date(v.fecha);
      return f.getFullYear() === Number(anio) && f.getMonth() + 1 <= Number(mes);
    });
  }, [ventas, anio, mes]);

  const ingresosMes     = ventasFiltradas.reduce((s, v) => s + v.total, 0);
  const ingresosAnuales = ventasAnuales.reduce((s, v) => s + v.total, 0);

  // RIMPE Emprendedor: 2% sobre ingresos brutos (tasa vigente 2024)
  const impuestoEmprendedor = parseFloat((ingresosAnuales * 0.02).toFixed(2));

  // RIMPE Negocio Popular: cuota fija mensual
  const cuotaFija = CUOTAS_NEGOCIOS_POPULARES[anio] ?? 65.00;

  const camposEmprendedor: CampoRIMPE[] = [
    { campo: '101',  descripcion: 'Ingresos brutos del mes',                       valor: ingresosMes,         tipo: 'normal' },
    { campo: '102',  descripcion: 'Ingresos brutos acumulados del ejercicio',       valor: ingresosAnuales,     tipo: 'subtotal' },
    { campo: '---',  descripcion: '(Régimen RIMPE Emprendedor — tasa 2%)',          valor: '',                  tipo: 'info' },
    { campo: '201',  descripcion: 'Impuesto RIMPE causado (2% × ingresos anuales)', valor: impuestoEmprendedor, tipo: 'total' },
    { campo: '202',  descripcion: 'Crédito tributario períodos anteriores',         valor: 0,                   tipo: 'normal' },
    { campo: '299',  descripcion: 'Impuesto a pagar',                               valor: impuestoEmprendedor, tipo: 'total' },
  ];

  const camposNegocioPopular: CampoRIMPE[] = [
    { campo: '101',  descripcion: 'Ingresos brutos del mes (solo informativo)',     valor: ingresosMes,         tipo: 'normal' },
    { campo: '---',  descripcion: '(Régimen RIMPE Negocio Popular — cuota fija)',   valor: '',                  tipo: 'info' },
    { campo: '201',  descripcion: `Cuota mensual fija ${anio}`,                    valor: cuotaFija,            tipo: 'total' },
    { campo: '299',  descripcion: 'Valor a pagar este mes',                         valor: cuotaFija,            tipo: 'total' },
  ];

  const campos = regimen === 'emprendedor' ? camposEmprendedor : camposNegocioPopular;

  const anios = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 2 + i));

  function exportar() {
    const rows = campos.map(c => ({
      Campo:       c.campo,
      Descripcion: c.descripcion,
      Valor:       typeof c.valor === 'number' ? `$${c.valor.toFixed(2)}` : c.valor,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RIMPE');
    XLSX.writeFile(wb, `RIMPE_${MESES[Number(mes)-1]}_${anio}.xlsx`);
    toast.success('Exportado a Excel');
  }

  return (
    <div>
      <PageHeader
        title="Declaración RIMPE"
        description="Resumen de obligaciones tributarias bajo el Régimen RIMPE (Emprendedor o Negocio Popular)"
        action={
          <Button variant="outline" onClick={exportar}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Año:</span>
          <Select value={anio} onValueChange={setAnio}>
            <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anios.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Mes:</span>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Tipo RIMPE:</span>
          <Select value={regimen} onValueChange={v => setRegimen(v as any)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="emprendedor">Emprendedor (2%)</SelectItem>
              <SelectItem value="negocio_popular">Negocio Popular (cuota fija)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Ingresos del mes</p>
          {loading ? <Skeleton className="h-6 w-24" /> :
            <p className="text-xl font-bold text-slate-800">{currency(ingresosMes)}</p>}
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Ingresos acumulados {anio}</p>
          {loading ? <Skeleton className="h-6 w-24" /> :
            <p className="text-xl font-bold text-blue-700">{currency(ingresosAnuales)}</p>}
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">N° Ventas del mes</p>
          {loading ? <Skeleton className="h-6 w-16" /> :
            <p className="text-xl font-bold text-slate-800">{ventasFiltradas.length}</p>}
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">
            {regimen === 'emprendedor' ? 'Impuesto estimado (2%)' : 'Cuota fija mensual'}
          </p>
          {loading ? <Skeleton className="h-6 w-24" /> :
            <p className="text-xl font-bold text-green-700">
              {currency(regimen === 'emprendedor' ? impuestoEmprendedor : cuotaFija)}
            </p>}
        </div>
      </div>

      {/* Tabla campos del formulario */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-center gap-3">
          <FileSpreadsheet className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-sm text-slate-700">
            Campos del Formulario — {MESES[Number(mes)-1]} {anio}
          </span>
          <Badge variant={regimen === 'emprendedor' ? 'default' : 'secondary'}>
            {regimen === 'emprendedor' ? 'RIMPE Emprendedor' : 'RIMPE Negocio Popular'}
          </Badge>
        </div>

        <div className="divide-y">
          {campos.map((c, i) => (
            <div key={i} className={`flex items-center px-5 py-3 gap-4 ${
              c.tipo === 'total'    ? 'bg-green-50 font-semibold' :
              c.tipo === 'subtotal' ? 'bg-blue-50' :
              c.tipo === 'info'     ? 'bg-slate-50 italic text-slate-500 text-xs' : ''
            }`}>
              <span className="w-16 font-mono text-sm text-slate-500 shrink-0">{c.campo}</span>
              <span className="flex-1 text-sm">{c.descripcion}</span>
              <span className={`text-sm font-mono ${
                c.tipo === 'total' ? 'text-green-700 font-bold text-base' :
                c.tipo === 'subtotal' ? 'text-blue-700 font-semibold' :
                c.tipo === 'info' ? '' : 'text-slate-800'
              }`}>
                {typeof c.valor === 'number' ? currency(c.valor) : c.valor}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <strong>Nota importante:</strong> Esta declaración es un resumen estimado basado en las ventas registradas.
        La declaración definitiva debe presentarse en el portal del SRI (sri.gob.ec → Servicios en Línea → RIMPE)
        dentro de los primeros 28 días del mes siguiente.
        {regimen === 'negocio_popular' && (
          <> Para Negocios Populares, la cuota fija no depende de los ingresos — siempre es el mismo valor mensual.</>
        )}
      </div>
    </div>
  );
}
