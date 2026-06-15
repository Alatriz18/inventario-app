'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Wallet, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Input }   from '@/components/ui/input';
import { Button }  from '@/components/ui/button';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { CuentaCobrar, Venta } from '@/types';
import { subscribeToComprobantes, Comprobante } from '@/lib/firebase/comprobantes';
import { subscribeToCxC } from '@/lib/firebase/cuentas-cobrar';
import { subscribeToVentas } from '@/lib/firebase/ventas';

const currency = (v: number) => `$${(v ?? 0).toFixed(2)}`;
const toDate = (v: any): Date => v?.toDate?.() ?? new Date(v);

const BADGE: Record<string, string> = {
  cobrada:   'bg-green-50 text-green-700',
  pagada:    'bg-green-50 text-green-700',
  pendiente: 'bg-amber-50 text-amber-700',
  parcial:   'bg-blue-50 text-blue-700',
  vencida:   'bg-red-50 text-red-700',
  anulada:   'bg-slate-100 text-slate-500',
};
const LABEL: Record<string, string> = {
  cobrada: 'Cobrada', pagada: 'Cobrada', pendiente: 'Pendiente',
  parcial: 'Parcial', vencida: 'Vencida', anulada: 'Anulada',
};

interface Row {
  id: string; fecha: Date; numero: string; cliente: string;
  tipo: string; total: number; cobrado: number; saldo: number;
  estado: string; vence?: Date;
}

export default function CarteraPage() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [cxc,          setCxc]          = useState<CuentaCobrar[]>([]);
  const [ventas,       setVentas]       = useState<Venta[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filtro,       setFiltro]       = useState('todos');

  useEffect(() => {
    const u1 = subscribeToComprobantes(d => { setComprobantes(d); setLoading(false); });
    const u2 = subscribeToCxC(setCxc);
    const u3 = subscribeToVentas(setVentas);
    return () => { u1(); u2(); u3(); };
  }, []);

  const cxcByVenta = useMemo(() => {
    const m = new Map<string, CuentaCobrar>();
    cxc.forEach(c => { if (c.ventaId) m.set(c.ventaId, c); });
    return m;
  }, [cxc]);

  const rows = useMemo<Row[]>(() =>
    comprobantes
      .filter(c => c.tipo === 'factura' || c.tipo === 'nota_venta')
      .map(c => {
        const fecha = toDate(c.fechaEmision);
        const cc    = c.ventaId ? cxcByVenta.get(c.ventaId) : undefined;
        if (c.estado === 'anulado') {
          return { id: c.id, fecha, numero: `${c.serie}-${c.secuencial}`, cliente: c.clienteNombre,
                   tipo: '—', total: c.total, cobrado: 0, saldo: 0, estado: 'anulada' };
        }
        if (cc) {
          return { id: c.id, fecha, numero: `${c.serie}-${c.secuencial}`, cliente: c.clienteNombre,
                   tipo: 'Crédito', total: c.total, cobrado: c.total - cc.saldoPendiente,
                   saldo: cc.saldoPendiente, estado: cc.estado, vence: cc.fechaVencimiento ? toDate(cc.fechaVencimiento) : undefined };
        }
        // Contado: cobrada al momento de la venta
        return { id: c.id, fecha, numero: `${c.serie}-${c.secuencial}`, cliente: c.clienteNombre,
                 tipo: 'Contado', total: c.total, cobrado: c.total, saldo: 0, estado: 'cobrada' };
      })
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime()),
    [comprobantes, cxcByVenta]);

  const filtradas = useMemo(() => rows.filter(r => {
    const ms = !search || r.cliente.toLowerCase().includes(search.toLowerCase()) || r.numero.includes(search);
    const me = filtro === 'todos' || r.estado === filtro || (filtro === 'cobrada' && r.estado === 'pagada');
    return ms && me;
  }), [rows, search, filtro]);

  const stats = useMemo(() => {
    const activas = rows.filter(r => r.estado !== 'anulada');
    return {
      facturado: activas.reduce((s, r) => s + r.total, 0),
      cobrado:   activas.reduce((s, r) => s + r.cobrado, 0),
      porCobrar: activas.reduce((s, r) => s + r.saldo, 0),
      vencido:   activas.filter(r => r.estado === 'vencida').reduce((s, r) => s + r.saldo, 0),
    };
  }, [rows]);

  const exportar = () => {
    const ws = XLSX.utils.json_to_sheet(filtradas.map(r => ({
      Fecha: format(r.fecha, 'dd/MM/yyyy'), Comprobante: r.numero, Cliente: r.cliente,
      Tipo: r.tipo, Total: r.total, Cobrado: r.cobrado, Saldo: r.saldo,
      Estado: LABEL[r.estado] ?? r.estado,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cartera');
    XLSX.writeFile(wb, `cartera_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div>
      <PageHeader
        title="Cartera — Facturas Emitidas"
        description="Todas las facturas emitidas (contado y crédito) y su estado de cobro"
        action={
          <Button variant="outline" onClick={exportar} disabled={loading}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total facturado', value: currency(stats.facturado), color: 'text-slate-800' },
          { label: 'Cobrado',          value: currency(stats.cobrado),   color: 'text-green-600' },
          { label: 'Por cobrar',       value: currency(stats.porCobrar), color: 'text-amber-600' },
          { label: 'Vencido',          value: currency(stats.vencido),   color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input placeholder="Buscar por cliente o número…"
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="cobrada">Cobradas</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="parcial">Parciales</SelectItem>
            <SelectItem value="vencida">Vencidas</SelectItem>
            <SelectItem value="anulada">Anuladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Fecha</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-center">Tipo</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Cobrado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}</TableRow>
              ))
            ) : filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                  <Wallet className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No hay facturas emitidas.
                </TableCell>
              </TableRow>
            ) : filtradas.map(r => (
              <TableRow key={r.id} className={r.estado === 'anulada' ? 'opacity-60' : ''}>
                <TableCell className="text-sm text-slate-500">{format(r.fecha, 'dd/MM/yyyy', { locale: es })}</TableCell>
                <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                <TableCell className="text-sm">{r.cliente}</TableCell>
                <TableCell className="text-center text-xs">{r.tipo}</TableCell>
                <TableCell className="text-right font-semibold">{currency(r.total)}</TableCell>
                <TableCell className="text-right text-green-700">{currency(r.cobrado)}</TableCell>
                <TableCell className={`text-right font-semibold ${r.saldo > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {currency(r.saldo)}
                </TableCell>
                <TableCell className="text-sm text-slate-500">
                  {r.vence ? format(r.vence, 'dd/MM/yyyy') : '—'}
                </TableCell>
                <TableCell className="text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE[r.estado] ?? ''}`}>
                    {LABEL[r.estado] ?? r.estado}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
