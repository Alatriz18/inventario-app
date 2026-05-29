'use client';

import { useEffect, useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader   from '@/components/shared/PageHeader';
import { Button }   from '@/components/ui/button';
import { Separator }from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge }    from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { FacturaProveedor, ConfigRetencion } from '@/types';
import { subscribeToFacturasProveedor } from '@/lib/firebase/facturas-proveedor';
import { subscribeToRetenciones }       from '@/lib/firebase/retenciones-config';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function currency(v: number) { return `$${v.toFixed(2)}`; }

export default function Form103Page() {
  const [compras,     setCompras]     = useState<FacturaProveedor[]>([]);
  const [retenciones, setRetenciones] = useState<ConfigRetencion[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [anio,        setAnio]        = useState(String(new Date().getFullYear()));
  const [mes,         setMes]         = useState(String(new Date().getMonth() + 1));

  useEffect(() => {
    const u1 = subscribeToFacturasProveedor(d => { setCompras(d); setLoading(false); });
    const u2 = subscribeToRetenciones(setRetenciones);
    return () => { u1(); u2(); };
  }, []);

  const comprasMes = useMemo(() => compras.filter(f => {
    const fecha = (f.fechaEmision as any)?.toDate?.() ?? new Date(f.fechaEmision as any);
    return fecha.getFullYear() === Number(anio) && fecha.getMonth() + 1 === Number(mes);
  }), [compras, anio, mes]);

  // Calcular retenciones por código basado en las compras del mes
  // En producción esto vendría de retenciones reales aplicadas en cada factura
  // Por ahora calculamos en base a las compras y retenciones configuradas
  const resumenRetenciones = useMemo(() => {
    const totalBase = comprasMes.reduce((s, f) => s + f.subtotal12 + f.subtotal0, 0);
    return retenciones
      .filter(r => r.tipo === 'fuente_ir' && r.activo)
      .map(r => ({
        codigo:     r.codigo,
        descripcion:r.descripcion,
        porcentaje: r.porcentaje,
        // Simulación — en producción debería venir de retenciones reales por factura
        baseImponible: 0,
        valorRetenido: 0,
      }));
  }, [comprasMes, retenciones]);

  const totalRetenido = resumenRetenciones.reduce((s, r) => s + r.valorRetenido, 0);

  const exportar = () => {
    const rows = resumenRetenciones.map(r => ({
      Código:       r.codigo,
      Descripción:  r.descripcion,
      Porcentaje:   r.porcentaje + '%',
      Base:         r.baseImponible,
      Retención:    r.valorRetenido,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Form103');
    XLSX.writeFile(wb, `Form103_RetIR_${anio}_${mes.padStart(2,'0')}.xlsx`);
  };

  const anios = Array.from({length:4}, (_,i) => String(new Date().getFullYear() - 1 + i));

  return (
    <div>
      <PageHeader
        title="Formulario 103 — Retenciones en la Fuente IR"
        description="Resumen mensual de retenciones practicadas a proveedores"
        action={
          <Button variant="outline" onClick={exportar} disabled={loading}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-700">
        ℹ️ Para que el formulario se calcule automáticamente, registra el <strong>código de retención</strong> en
        cada factura de proveedor al momento de pagarla. Esta vista muestra los códigos configurados.
      </div>

      <div className="bg-white rounded-xl border p-4 flex gap-3 items-center mb-5">
        <Select onValueChange={setAnio} defaultValue={anio}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anios.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select onValueChange={setMes} defaultValue={mes}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-400">Facturas proveedores en el período</p>
              <p className="text-2xl font-bold mt-1">{comprasMes.length}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-400">Base total de compras</p>
              <p className="text-2xl font-bold mt-1">
                {currency(comprasMes.reduce((s,f) => s + f.total, 0))}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50">
              <p className="font-semibold text-slate-700 text-sm">
                Códigos de retención configurados — {MESES[Number(mes)-1]} {anio}
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-center">Aplica a</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retenciones.filter(r => r.tipo === 'fuente_ir' && r.activo).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-400 text-sm">
                      Sin retenciones configuradas. Ve a Tributario → Retenciones.
                    </TableCell>
                  </TableRow>
                ) : retenciones.filter(r => r.tipo === 'fuente_ir' && r.activo).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-bold">{r.codigo}</TableCell>
                    <TableCell className="text-sm">{r.descripcion}</TableCell>
                    <TableCell className="text-right font-semibold">{r.porcentaje}%</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs capitalize">{r.aplicaA}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="bg-slate-50 rounded-xl border p-4 text-sm text-slate-500">
            <p className="font-semibold text-slate-700 mb-1">Próxima versión</p>
            <p>El cálculo automático del Formulario 103 se habilitará cuando se implemente
            el módulo de comprobantes de retención electrónicos.</p>
          </div>
        </div>
      )}
    </div>
  );
}