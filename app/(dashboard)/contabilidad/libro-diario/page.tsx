'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileSpreadsheet, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Separator }from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { AsientoContable } from '@/types';
import { subscribeToAsientos } from '@/lib/firebase/asientos';

const TIPO_LABELS: Record<string, string> = {
  venta_factura:'Venta c/Factura', venta_nota:'Venta s/Factura',
  compra_proveedor:'Compra Proveedor', pago_proveedor:'Pago Proveedor',
  cobro_cliente:'Cobro Cliente', ajuste_inventario:'Ajuste Inventario',
  apertura:'Apertura', cierre:'Cierre', manual:'Manual',
};

function currency(v: number) { return `$${v.toFixed(2)}`; }

export default function LibroDiarioPage() {
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo,   setDateTo]   = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    return subscribeToAsientos(d => { setAsientos(d); setLoading(false); });
  }, []);

  const filtrados = useMemo(() => {
    const from = new Date(dateFrom + 'T00:00:00');
    const to   = new Date(dateTo   + 'T23:59:59');
    return asientos
      .filter(a => {
        const f = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
        return f >= from && f <= to;
      })
      .sort((a, b) => {
        const fa = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
        const fb = (b.fecha as any)?.toDate?.() ?? new Date(b.fecha);
        return fa.getTime() - fb.getTime();
      });
  }, [asientos, dateFrom, dateTo]);

  const totalDebe  = filtrados.reduce((s, a) => s + a.totalDebe, 0);
  const totalHaber = filtrados.reduce((s, a) => s + a.totalHaber, 0);

  const exportar = () => {
    const rows = filtrados.flatMap(a => {
      const fecha = format((a.fecha as any)?.toDate?.() ?? new Date(a.fecha), 'dd/MM/yyyy');
      return a.lineas.map(l => ({
        Número:   a.numero ?? '',
        Fecha:    fecha,
        Concepto: a.concepto,
        Tipo:     TIPO_LABELS[a.tipo] ?? a.tipo,
        Cuenta:   l.cuentaCodigo,
        NombreCuenta: l.cuentaNombre,
        Descripcion:  l.descripcion ?? '',
        Debe:     l.debe  > 0 ? l.debe  : '',
        Haber:    l.haber > 0 ? l.haber : '',
      }));
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Libro Diario');
    XLSX.writeFile(wb, `libro_diario_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <div>
      <PageHeader
        title="Libro Diario"
        description="Registro cronológico de todos los asientos contables"
        action={
          <Button variant="outline" onClick={exportar} disabled={filtrados.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Desde</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Hasta</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-8 text-sm" />
        </div>
        <Badge variant="outline">{filtrados.length} asiento(s)</Badge>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-28">Número</TableHead>
              <TableHead className="w-28">Fecha</TableHead>
              <TableHead>Concepto / Cuenta</TableHead>
              <TableHead className="text-right w-32">Debe</TableHead>
              <TableHead className="text-right w-32">Haber</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({length:6}).map((_,i) => (
                <TableRow key={i}>{Array.from({length:5}).map((_,j) =>
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                  <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay asientos en el período seleccionado.</p>
                </TableCell>
              </TableRow>
            ) : filtrados.map(a => {
              const fecha = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
              return (
                <>
                  {/* Encabezado del asiento */}
                  <TableRow key={`h-${a.id}`} className="bg-slate-50/60">
                    <TableCell className="font-mono text-xs font-bold">{a.numero}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {format(fecha, 'dd/MM/yyyy', { locale: es })}
                    </TableCell>
                    <TableCell className="font-semibold text-sm" colSpan={3}>
                      {a.concepto}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        ({TIPO_LABELS[a.tipo] ?? a.tipo})
                      </span>
                    </TableCell>
                  </TableRow>
                  {/* Líneas del asiento */}
                  {a.lineas.map((l, i) => (
                    <TableRow key={`l-${a.id}-${i}`}>
                      <TableCell />
                      <TableCell />
                      <TableCell className="text-sm">
                        <span className={`font-mono text-xs ${l.haber > 0 ? 'ml-6' : ''}`}>
                          {l.cuentaCodigo}
                        </span>
                        <span className="mx-2 text-slate-400">—</span>
                        <span className={l.haber > 0 ? 'text-slate-500' : 'font-medium'}>
                          {l.cuentaNombre}
                        </span>
                        {l.descripcion && (
                          <span className="ml-2 text-xs text-slate-400 italic">{l.descripcion}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {l.debe > 0 ? <span className="font-semibold text-blue-600">{currency(l.debe)}</span> : ''}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {l.haber > 0 ? <span className="font-semibold text-red-600">{currency(l.haber)}</span> : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Separador entre asientos */}
                  <TableRow key={`sep-${a.id}`}>
                    <TableCell colSpan={5} className="p-0">
                      <div className="border-b border-dashed border-slate-200" />
                    </TableCell>
                  </TableRow>
                </>
              );
            })}
          </TableBody>
        </Table>

        {filtrados.length > 0 && (
          <div className="px-4 py-3 border-t bg-slate-50 flex justify-end gap-8 text-sm font-bold">
            <span>TOTALES</span>
            <span className="text-blue-600">Debe: {currency(totalDebe)}</span>
            <span className="text-red-600">Haber: {currency(totalHaber)}</span>
          </div>
        )}
      </div>
    </div>
  );
}