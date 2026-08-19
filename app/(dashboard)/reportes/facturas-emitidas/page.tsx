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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { subscribeToComprobantes, Comprobante } from '@/lib/firebase/comprobantes';
import { generarTablaPDF }                      from '@/lib/reportes/tabla-pdf';

const TIPO_LABEL: Record<string, string> = {
  factura:     'Factura',
  nota_venta:  'Nota de Venta',
  nota_credito:'Nota de Crédito',
  nota_debito: 'Nota de Débito',
  retencion:   'Retención',
  liquidacion: 'Liquidación',
  guia:        'Guía',
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente:  'Pendiente',
  firmado:    'Firmado',
  enviado:    'Enviado',
  autorizado: 'Autorizado',
  rechazado:  'Rechazado',
  anulado:    'Anulado',
};

const ESTADO_BADGE: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-700',
  firmado:    'bg-blue-100 text-blue-700',
  enviado:    'bg-blue-100 text-blue-700',
  autorizado: 'bg-green-100 text-green-700',
  rechazado:  'bg-red-100 text-red-700',
  anulado:    'bg-slate-200 text-slate-600',
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

export default function ReporteFacturasEmitidasPage() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dateFrom,     setDateFrom]     = useState(PRESETS[0].from());
  const [dateTo,       setDateTo]       = useState(PRESETS[0].to());
  const [preset,       setPreset]       = useState('Este mes');
  const [filtroTipo,   setFiltroTipo]   = useState<'todos' | 'factura' | 'nota_venta'>('todos');

  useEffect(() => {
    const u = subscribeToComprobantes(d => { setComprobantes(d); setLoading(false); });
    return () => u();
  }, []);

  const comprobantesFiltrados = useMemo(() => {
    return comprobantes
      .filter(c => c.tipo === 'factura' || c.tipo === 'nota_venta')
      .filter(c => filtroTipo === 'todos' || c.tipo === filtroTipo)
      .filter(c => {
        const fecha = format(toDate(c.fechaEmision), 'yyyy-MM-dd');
        return fecha >= dateFrom && fecha <= dateTo;
      })
      .sort((a, b) => toDate(a.fechaEmision).getTime() - toDate(b.fechaEmision).getTime());
  }, [comprobantes, dateFrom, dateTo, filtroTipo]);

  const filas = useMemo(() => comprobantesFiltrados.map(c => ({
    fecha:        fechaStr(c.fechaEmision),
    cliente:      c.clienteNombre,
    identificacion: c.clienteIdentificacion,
    tipo:         TIPO_LABEL[c.tipo] ?? c.tipo,
    serie:        c.serie,
    secuencial:   c.secuencial,
    autorizacion: c.numeroAutorizacion ?? c.claveAcceso ?? '-',
    subtotal:     c.subtotal,
    iva:          c.iva,
    total:        c.total,
    estado:       c.estado,
  })), [comprobantesFiltrados]);

  const totales = useMemo(() => filas.reduce((acc, f) => ({
    subtotal: acc.subtotal + f.subtotal,
    iva:      acc.iva      + f.iva,
    total:    acc.total    + f.total,
  }), { subtotal: 0, iva: 0, total: 0 }), [filas]);

  const rango = `${format(new Date(dateFrom), 'dd/MM/yyyy')} — ${format(new Date(dateTo), 'dd/MM/yyyy')}`;

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filas.map(f => ({
      'Fecha Emisión':   f.fecha,
      'Cliente':         f.cliente,
      'Identificación':  f.identificacion,
      'Tipo Comprobante':f.tipo,
      'Serie':           f.serie,
      'Secuencial':      f.secuencial,
      'Autorización':    f.autorizacion,
      'Subtotal':        f.subtotal,
      'IVA':             f.iva,
      'Total':           f.total,
      'Estado':          ESTADO_LABEL[f.estado] ?? f.estado,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facturas Emitidas');
    XLSX.writeFile(wb, `Facturas_Emitidas_${dateFrom}_${dateTo}.xlsx`);
  };

  const exportPDF = () => {
    generarTablaPDF({
      titulo:    'Reporte de Facturas Emitidas (Ventas)',
      subtitulo: rango,
      columnas: [
        { key: 'fecha',          header: 'Fecha Emisión',  width: 18 },
        { key: 'cliente',        header: 'Cliente',         width: 45 },
        { key: 'identificacion', header: 'Identificación', width: 26 },
        { key: 'tipo',           header: 'Tipo Comp.',     width: 22 },
        { key: 'serie',          header: 'Serie',           width: 16 },
        { key: 'secuencial',     header: 'Secuencial',     width: 22 },
        { key: 'autorizacion',   header: 'Autorización',   width: 40 },
        { key: 'subtotal',       header: 'Subtotal',       width: 16, align: 'right' },
        { key: 'iva',            header: 'IVA',             width: 16, align: 'right' },
        { key: 'total',          header: 'Total',           width: 18, align: 'right' },
        { key: 'estado',         header: 'Estado',          width: 20 },
      ],
      filas: filas.map(f => ({
        fecha: f.fecha, cliente: f.cliente, identificacion: f.identificacion, tipo: f.tipo,
        serie: f.serie, secuencial: f.secuencial, autorizacion: f.autorizacion,
        subtotal: currency(f.subtotal), iva: currency(f.iva), total: currency(f.total),
        estado: ESTADO_LABEL[f.estado] ?? f.estado,
      })),
      totales: {
        cliente: 'TOTAL', subtotal: currency(totales.subtotal), iva: currency(totales.iva), total: currency(totales.total),
      },
      nombreArchivo: `Facturas_Emitidas_${dateFrom}_${dateTo}.pdf`,
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Facturas Emitidas"
        description="Reporte de comprobantes de venta emitidos al SRI"
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

      {/* Filtros */}
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
        <div>
          <label className="text-xs text-slate-500 block mb-1">Tipo</label>
          <Select value={filtroTipo} onValueChange={(v: any) => setFiltroTipo(v)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="factura">Facturas</SelectItem>
              <SelectItem value="nota_venta">Notas de Venta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 ml-auto">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Desde</label>
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset(''); }} className="h-9" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Hasta</label>
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset(''); }} className="h-9" />
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Comprobantes', value: String(filas.length) },
          { label: 'Subtotal',     value: currency(totales.subtotal) },
          { label: 'IVA',          value: currency(totales.iva) },
          { label: 'Total',        value: currency(totales.total) },
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
                <TableHead>Cliente</TableHead>
                <TableHead>Identificación</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Serie</TableHead>
                <TableHead>Secuencial</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}</TableRow>
                ))
              ) : filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-slate-400">
                    No hay comprobantes emitidos en el período seleccionado.
                  </TableCell>
                </TableRow>
              ) : filas.map((f, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm text-slate-500">{f.fecha}</TableCell>
                  <TableCell className="text-sm font-medium">{f.cliente}</TableCell>
                  <TableCell className="font-mono text-xs">{f.identificacion}</TableCell>
                  <TableCell className="text-xs text-slate-500">{f.tipo}</TableCell>
                  <TableCell className="font-mono text-xs">{f.serie}</TableCell>
                  <TableCell className="font-mono text-xs">{f.secuencial}</TableCell>
                  <TableCell className="text-right text-sm">{currency(f.subtotal)}</TableCell>
                  <TableCell className="text-right text-sm">{currency(f.iva)}</TableCell>
                  <TableCell className="text-right font-semibold text-sm">{currency(f.total)}</TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_BADGE[f.estado] ?? ''}`}>
                      {ESTADO_LABEL[f.estado] ?? f.estado}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
