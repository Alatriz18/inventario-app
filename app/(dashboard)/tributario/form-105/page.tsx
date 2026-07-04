'use client';

import { useEffect, useState, useMemo } from 'react';
import { Download, Coins } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Skeleton }from '@/components/ui/skeleton';
import { Separator}from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { ConfigICE, Venta } from '@/types';
import { subscribeToICE }      from '@/lib/firebase/retenciones-config';
import { subscribeToVentas }   from '@/lib/firebase/ventas';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function currency(v: number) { return `$${v.toFixed(2)}`; }

export default function Form105Page() {
  const [ventas,  setVentas]  = useState<Venta[]>([]);
  const [tarifas, setTarifas] = useState<ConfigICE[]>([]);
  const [loading, setLoading] = useState(true);
  const [anio,    setAnio]    = useState(String(new Date().getFullYear()));
  const [mes,     setMes]     = useState(String(new Date().getMonth() + 1));

  useEffect(() => {
    const u1 = subscribeToVentas(d => { setVentas(d); setLoading(false); });
    const u2 = subscribeToICE(setTarifas);
    return () => { u1(); u2(); };
  }, []);

  const ventasMes = useMemo(() => ventas.filter(v => {
    if (v.estado === 'anulada') return false;
    const f = (v.fecha as any)?.toDate?.() ?? new Date(v.fecha as any);
    return f.getFullYear() === Number(anio) && f.getMonth() + 1 === Number(mes);
  }), [ventas, anio, mes]);

  // Calcular ICE por tarifa basado en productos vendidos
  const resumenICE = useMemo(() => {
    return tarifas.filter(t => t.activo).map(t => ({
      ...t,
      cantidadUnidades: 0,    // En producción: vincular con productos que tienen código ICE
      baseImponible:    0,
      iceCalculado:     0,
    }));
  }, [tarifas, ventasMes]);

  const totalICE = resumenICE.reduce((s, r) => s + r.iceCalculado, 0);

  const exportar = () => {
    const rows = resumenICE.map(r => ({
      Código:       r.codigo,
      Descripción:  r.descripcion,
      TipoTarifa:   r.tipoTarifa,
      TarifaEsp:    r.tarifaEspecifica ?? '—',
      TarifaAdVal:  r.tarifaAdValorem != null ? r.tarifaAdValorem + '%' : '—',
      Unidades:     r.cantidadUnidades,
      BaseImponible:r.baseImponible,
      ICECalculado: r.iceCalculado,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Form105 ICE');
    XLSX.writeFile(wb, `Form105_ICE_${anio}_${mes.padStart(2,'0')}.xlsx`);
  };

  const anios = Array.from({length:4}, (_,i) => String(new Date().getFullYear() - 1 + i));

  return (
    <div>
      <PageHeader
        title="Formulario 105 — Declaración ICE"
        description="Impuesto a los Consumos Especiales — tabacos, licores y similares"
        action={
          <Button variant="outline" onClick={exportar} disabled={loading}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700">
        ℹ️ Para el cálculo automático del ICE, los productos deben tener asignado su
        <strong> código ICE</strong> correspondiente. Próximamente disponible.
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center mb-5">
        <Select onValueChange={setAnio} defaultValue={anio}>
          <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anios.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select onValueChange={setMes} defaultValue={mes}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-400">Ventas en el período</p>
              <p className="text-2xl font-bold mt-1">{ventasMes.length}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-400">Total ventas</p>
              <p className="text-2xl font-bold mt-1">
                {currency(ventasMes.reduce((s,v) => s + v.total, 0))}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50">
              <p className="font-semibold text-slate-700 text-sm">Tarifas ICE configuradas</p>
            </div>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                  <TableHead className="text-right">Tarifa esp.</TableHead>
                  <TableHead className="text-right">Ad valorem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarifas.filter(t => t.activo).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-slate-400 text-sm">
                      <Coins className="h-6 w-6 mx-auto mb-1 opacity-30" />
                      Sin tarifas ICE. Ve a Tributario → ICE.
                    </TableCell>
                  </TableRow>
                ) : tarifas.filter(t => t.activo).map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono font-bold">{t.codigo}</TableCell>
                    <TableCell className="text-sm">{t.descripcion}</TableCell>
                    <TableCell className="text-center text-xs capitalize">{t.tipoTarifa}</TableCell>
                    <TableCell className="text-right text-sm">
                      {t.tarifaEspecifica != null ? `$${t.tarifaEspecifica.toFixed(4)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {t.tarifaAdValorem != null ? `${t.tarifaAdValorem}%` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}