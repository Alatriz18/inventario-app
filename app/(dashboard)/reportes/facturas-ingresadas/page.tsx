'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { FacturaProveedor, Proveedor, RetencionEmitida } from '@/types';
import { subscribeToFacturasProveedor }   from '@/lib/firebase/facturas-proveedor';
import { subscribeToProveedores }         from '@/lib/firebase/proveedores';
import { subscribeToRetencionesEmitidas } from '@/lib/firebase/retenciones-emitidas';
import { generarTablaPDF }                from '@/lib/reportes/tabla-pdf';

const REGIMEN_LABEL: Record<string, string> = {
  general:                'General',
  rimpe_emprendedor:      'RIMPE Emprendedor',
  rimpe_negocio_popular:  'RIMPE Negocio Popular',
  rimpe_artesano:         'RIMPE Artesano',
};

const PRESETS = [
  { label: 'Este mes', from: () => format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: () => format(endOfMonth(new Date()), 'yyyy-MM-dd') },
  { label: '30 días',  from: () => format(subDays(new Date(), 29), 'yyyy-MM-dd'),  to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Este año', from: () => format(startOfYear(new Date()), 'yyyy-MM-dd'),  to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Todo',     from: () => '2020-01-01',                                   to: () => format(new Date(), 'yyyy-MM-dd') },
];

function currency(v: number) { return `$${(v ?? 0).toFixed(2)}`; }
function toDate(d: any): Date { return d?.toDate?.() ?? new Date(d); }
function fechaStr(d: any) { return format(toDate(d), 'dd/MM/yyyy'); }

export default function ReporteFacturasIngresadasPage() {
  const [facturas,     setFacturas]     = useState<FacturaProveedor[]>([]);
  const [proveedores,  setProveedores]  = useState<Proveedor[]>([]);
  const [retenciones,  setRetenciones]  = useState<RetencionEmitida[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dateFrom,     setDateFrom]     = useState(PRESETS[0].from());
  const [dateTo,       setDateTo]       = useState(PRESETS[0].to());
  const [preset,       setPreset]       = useState('Este mes');

  useEffect(() => {
    const u1 = subscribeToFacturasProveedor(d => { setFacturas(d); setLoading(false); });
    const u2 = subscribeToProveedores(setProveedores);
    const u3 = subscribeToRetencionesEmitidas(setRetenciones);
    return () => { u1(); u2(); u3(); };
  }, []);

  const proveedoresPorId = useMemo(() => new Map(proveedores.map(p => [p.id, p])), [proveedores]);

  const retencionesPorFactura = useMemo(() => {
    const m = new Map<string, { iva: number; renta: number }>();
    retenciones.forEach(r => {
      const iva   = r.lineas.filter(l => l.tipo === 'iva').reduce((s, l) => s + l.valorRetenido, 0);
      const renta = r.lineas.filter(l => l.tipo === 'fuente_ir').reduce((s, l) => s + l.valorRetenido, 0);
      const prev = m.get(r.facturaProveedorId) ?? { iva: 0, renta: 0 };
      m.set(r.facturaProveedorId, { iva: prev.iva + iva, renta: prev.renta + renta });
    });
    return m;
  }, [retenciones]);

  const facturasFiltradas = useMemo(() => {
    return facturas
      .filter(f => f.estado !== 'anulada')
      .filter(f => {
        const fecha = format(toDate(f.fechaEmision), 'yyyy-MM-dd');
        return fecha >= dateFrom && fecha <= dateTo;
      })
      .sort((a, b) => toDate(a.fechaEmision).getTime() - toDate(b.fechaEmision).getTime());
  }, [facturas, dateFrom, dateTo]);

  const filas = useMemo(() => facturasFiltradas.map(f => {
    const prov = proveedoresPorId.get(f.proveedorId);
    const ret  = retencionesPorFactura.get(f.id) ?? { iva: 0, renta: 0 };
    const [serie, numero] = (() => {
      const parts = f.numeroFactura.split('-');
      return parts.length >= 3
        ? [`${parts[0]}-${parts[1]}`, parts[2]]
        : ['', f.numeroFactura];
    })();
    return {
      fecha:       fechaStr(f.fechaEmision),
      proveedor:   f.proveedorNombre,
      ruc:         f.proveedorRuc,
      regimen:     prov?.regimen ? (REGIMEN_LABEL[prov.regimen] ?? prov.regimen) : '-',
      serie,
      numero,
      autorizacion:f.claveAcceso ?? f.numeroAutorizacion ?? '-',
      base0:       f.subtotal0,
      baseGrav:    f.subtotal12,
      iva:         f.iva,
      total:       f.total,
      retIva:      ret.iva,
      retRenta:    ret.renta,
    };
  }), [facturasFiltradas, proveedoresPorId, retencionesPorFactura]);

  const totales = useMemo(() => filas.reduce((acc, f) => ({
    base0:    acc.base0    + f.base0,
    baseGrav: acc.baseGrav + f.baseGrav,
    iva:      acc.iva      + f.iva,
    total:    acc.total    + f.total,
    retIva:   acc.retIva   + f.retIva,
    retRenta: acc.retRenta + f.retRenta,
  }), { base0: 0, baseGrav: 0, iva: 0, total: 0, retIva: 0, retRenta: 0 }), [filas]);

  const rango = `${format(new Date(dateFrom), 'dd/MM/yyyy')} — ${format(new Date(dateTo), 'dd/MM/yyyy')}`;

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filas.map(f => ({
      'Fecha Emisión':  f.fecha,
      'Proveedor':      f.proveedor,
      'RUC':            f.ruc,
      'Tipo Contribuyente': f.regimen,
      'Serie':          f.serie,
      'Núm. Factura':   f.numero,
      'Autorización':   f.autorizacion,
      'Base 0%':        f.base0,
      'Base Gravada':   f.baseGrav,
      'IVA':            f.iva,
      'Total':          f.total,
      'Ret. IVA':       f.retIva,
      'Ret. Renta':     f.retRenta,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facturas Ingresadas');
    XLSX.writeFile(wb, `Facturas_Ingresadas_${dateFrom}_${dateTo}.xlsx`);
  };

  const exportPDF = () => {
    generarTablaPDF({
      titulo:    'Reporte de Facturas Ingresadas (Compras)',
      subtitulo: rango,
      columnas: [
        { key: 'fecha',        header: 'Fecha Emisión',  width: 18 },
        { key: 'proveedor',    header: 'Proveedor',      width: 40 },
        { key: 'ruc',          header: 'RUC',             width: 24 },
        { key: 'regimen',      header: 'Tipo Contrib.',  width: 26 },
        { key: 'serie',        header: 'Serie',           width: 16 },
        { key: 'numero',       header: 'Núm. Factura',   width: 20 },
        { key: 'autorizacion', header: 'Autorización',   width: 42, align: 'left' },
        { key: 'base0',        header: 'Base 0%',        width: 14, align: 'right' },
        { key: 'baseGrav',     header: 'Base Grav.',     width: 18, align: 'right' },
        { key: 'iva',          header: 'IVA',             width: 16, align: 'right' },
        { key: 'total',        header: 'Total',           width: 18, align: 'right' },
        { key: 'retIva',       header: 'Ret. IVA',       width: 13, align: 'right' },
        { key: 'retRenta',     header: 'Ret. Renta',     width: 13, align: 'right' },
      ],
      filas: filas.map(f => ({
        fecha: f.fecha, proveedor: f.proveedor, ruc: f.ruc, regimen: f.regimen,
        serie: f.serie, numero: f.numero, autorizacion: f.autorizacion,
        base0: currency(f.base0), baseGrav: currency(f.baseGrav), iva: currency(f.iva),
        total: currency(f.total), retIva: currency(f.retIva), retRenta: currency(f.retRenta),
      })),
      totales: {
        proveedor: 'TOTAL', base0: currency(totales.base0), baseGrav: currency(totales.baseGrav),
        iva: currency(totales.iva), total: currency(totales.total),
        retIva: currency(totales.retIva), retRenta: currency(totales.retRenta),
      },
      nombreArchivo: `Facturas_Ingresadas_${dateFrom}_${dateTo}.pdf`,
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Facturas Ingresadas"
        description="Reporte de facturas de compra registradas (Cuentas por Pagar)"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={filas.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button size="sm" onClick={exportPDF} disabled={filas.length === 0}>
              <Download className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        }
      />

      {/* Filtros de fecha */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-1.5">
          {PRESETS.map(p => (
            <Button key={p.label} size="sm"
              variant={preset === p.label ? 'default' : 'outline'}
              onClick={() => { setDateFrom(p.from()); setDateTo(p.to()); setPreset(p.label); }}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-2 flex-wrap sm:ml-auto">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Desde</label>
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset(''); }} className="h-9 min-w-[150px]" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Hasta</label>
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset(''); }} className="h-9 min-w-[150px]" />
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Facturas',  value: String(filas.length) },
          { label: 'Base Gravada', value: currency(totales.baseGrav) },
          { label: 'IVA',        value: currency(totales.iva) },
          { label: 'Total',      value: currency(totales.total) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-xl font-bold mt-1 text-slate-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>RUC</TableHead>
                <TableHead>Tipo Contrib.</TableHead>
                <TableHead>Serie</TableHead>
                <TableHead>Núm. Factura</TableHead>
                <TableHead className="text-right">Base 0%</TableHead>
                <TableHead className="text-right">Base Grav.</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ret. IVA</TableHead>
                <TableHead className="text-right">Ret. Renta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 12 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}</TableRow>
                ))
              ) : filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-12 text-slate-400">
                    No hay facturas de compra en el período seleccionado.
                  </TableCell>
                </TableRow>
              ) : filas.map((f, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm text-slate-500">{f.fecha}</TableCell>
                  <TableCell className="text-sm font-medium">{f.proveedor}</TableCell>
                  <TableCell className="font-mono text-xs">{f.ruc}</TableCell>
                  <TableCell className="text-xs text-slate-500">{f.regimen}</TableCell>
                  <TableCell className="font-mono text-xs">{f.serie}</TableCell>
                  <TableCell className="font-mono text-xs">{f.numero}</TableCell>
                  <TableCell className="text-right text-sm">{currency(f.base0)}</TableCell>
                  <TableCell className="text-right text-sm">{currency(f.baseGrav)}</TableCell>
                  <TableCell className="text-right text-sm">{currency(f.iva)}</TableCell>
                  <TableCell className="text-right font-semibold text-sm">{currency(f.total)}</TableCell>
                  <TableCell className="text-right text-sm text-red-600">{f.retIva > 0 ? currency(f.retIva) : '-'}</TableCell>
                  <TableCell className="text-right text-sm text-red-600">{f.retRenta > 0 ? currency(f.retRenta) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
