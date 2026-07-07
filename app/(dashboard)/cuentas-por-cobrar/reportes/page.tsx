'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, TrendingUp, Users, CreditCard, Hash } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { CuentaCobrar, CobroCxC } from '@/types';
import { subscribeToCxC } from '@/lib/firebase/cuentas-cobrar';

// ── Constantes ────────────────────────────────────────────────────────────────
const COLORS = ['#1A3C5E', '#2E75B6', '#00A896', '#F59E0B', '#EF4444', '#8B5CF6'];

const METODO_LABELS: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  transferencia: 'Transferencia',
  deposito:      'Depósito',
  cheque:        'Cheque',
  credito:       'Crédito',
};

const PRESETS = [
  { label: 'Hoy',      from: () => format(new Date(), 'yyyy-MM-dd'),               to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: '7 días',   from: () => format(subDays(new Date(), 6), 'yyyy-MM-dd'),   to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Este mes', from: () => format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: () => format(endOfMonth(new Date()), 'yyyy-MM-dd') },
  { label: 'Este año', from: () => format(startOfYear(new Date()), 'yyyy-MM-dd'),  to: () => format(new Date(), 'yyyy-MM-dd') },
  { label: 'Todo',     from: () => '2020-01-01',                                   to: () => format(new Date(), 'yyyy-MM-dd') },
];

function currency(v: number) { return `$${v.toFixed(2)}`; }

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface CobroFlat extends CobroCxC {
  clienteNombre:         string;
  clienteIdentificacion: string;
  cxcId:                 string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDate(v: unknown): Date {
  if (v && typeof (v as any).toDate === 'function') return (v as any).toDate();
  return new Date(v as any);
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function ReporteCobrosPage() {
  const [cxcList, setCxcList] = useState<CuentaCobrar[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateTo,   setDateTo]   = useState(format(new Date(), 'yyyy-MM-dd'));
  const [preset,   setPreset]   = useState('Hoy');

  useEffect(() => {
    const unsub = subscribeToCxC(data => { setCxcList(data); setLoading(false); });
    return () => unsub();
  }, []);

  const applyPreset = (p: typeof PRESETS[0]) => {
    setDateFrom(p.from());
    setDateTo(p.to());
    setPreset(p.label);
  };

  // ── Cobros del período (aplanados) ────────────────────────────────────────
  const cobros = useMemo<CobroFlat[]>(() => {
    const from = new Date(dateFrom + 'T00:00:00');
    const to   = new Date(dateTo   + 'T23:59:59');
    const result: CobroFlat[] = [];
    for (const cxc of cxcList) {
      for (const c of cxc.cobros ?? []) {
        const fecha = toDate(c.fecha);
        if (fecha >= from && fecha <= to) {
          result.push({
            ...c,
            fecha,
            clienteNombre:         cxc.clienteNombre,
            clienteIdentificacion: cxc.clienteIdentificacion,
            cxcId:                 cxc.id,
          });
        }
      }
    }
    return result.sort((a, b) => toDate(b.fecha).getTime() - toDate(a.fecha).getTime());
  }, [cxcList, dateFrom, dateTo]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalCobrado  = cobros.reduce((s, c) => s + c.monto, 0);
    const numCobros     = cobros.length;
    const promedio      = numCobros ? totalCobrado / numCobros : 0;
    const clientesUnicos = new Set(cobros.map(c => c.clienteNombre)).size;
    return { totalCobrado, numCobros, promedio, clientesUnicos };
  }, [cobros]);

  // ── Cobros por día ────────────────────────────────────────────────────────
  const porDia = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of cobros) {
      const key = format(toDate(c.fecha), 'dd/MM', { locale: es });
      map[key] = (map[key] ?? 0) + c.monto;
    }
    return Object.entries(map)
      .map(([dia, total]) => ({ dia, total: Math.round(total * 100) / 100 }))
      .reverse();
  }, [cobros]);

  // ── Por método de pago ────────────────────────────────────────────────────
  const porMetodo = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of cobros) {
      map[c.metodoPago] = (map[c.metodoPago] ?? 0) + c.monto;
    }
    return Object.entries(map).map(([metodo, value]) => ({
      name:  METODO_LABELS[metodo] ?? metodo,
      value: Math.round(value * 100) / 100,
    }));
  }, [cobros]);

  // ── Exportar Excel ────────────────────────────────────────────────────────
  const exportar = () => {
    const rows = cobros.map(c => ({
      Fecha:          format(toDate(c.fecha), 'dd/MM/yyyy HH:mm'),
      Cliente:        c.clienteNombre,
      Identificacion: c.clienteIdentificacion,
      Monto:          c.monto,
      Metodo:         METODO_LABELS[c.metodoPago] ?? c.metodoPago,
      Referencia:     c.referencia ?? '',
      Usuario:        c.usuarioNombre,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cobros');
    XLSX.writeFile(wb, `cobros-${dateFrom}-${dateTo}.xlsx`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporte de Cobros"
        description="Análisis de cobros registrados por período"
        action={
          <Button variant="outline" size="sm" onClick={exportar} disabled={cobros.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        }
      />

      {/* ── Filtros ── */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p.label
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 whitespace-nowrap">Desde</span>
            <input
              type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPreset(''); }}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 whitespace-nowrap">Hasta</span>
            <input
              type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPreset(''); }}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            icon={<TrendingUp className="h-5 w-5 text-green-600" />}
            bg="bg-green-50"
            label="Total Cobrado"
            value={currency(kpis.totalCobrado)}
          />
          <KpiCard
            icon={<Hash className="h-5 w-5 text-blue-600" />}
            bg="bg-blue-50"
            label="Nº de Cobros"
            value={String(kpis.numCobros)}
          />
          <KpiCard
            icon={<CreditCard className="h-5 w-5 text-purple-600" />}
            bg="bg-purple-50"
            label="Promedio"
            value={currency(kpis.promedio)}
          />
          <KpiCard
            icon={<Users className="h-5 w-5 text-amber-600" />}
            bg="bg-amber-50"
            label="Clientes"
            value={String(kpis.clientesUnicos)}
          />
        </div>
      )}

      {/* ── Gráficos ── */}
      {!loading && cobros.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Bar: cobros por día */}
          <div className="lg:col-span-2 bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Cobros por día</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porDia} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} width={60} />
                <Tooltip formatter={(v: number) => [currency(v), 'Cobrado']} />
                <Bar dataKey="total" name="Cobrado" fill="#2E75B6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie: por método */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Por método de pago</h3>
            {porMetodo.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={porMetodo} dataKey="value" nameKey="name"
                    cx="50%" cy="45%" outerRadius={75} innerRadius={35}
                  >
                    {porMetodo.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [currency(v), 'Total']} />
                  <Legend
                    formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
                    iconSize={10}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">
                Sin datos
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mensaje vacío (sin cobros) ── */}
      {!loading && cobros.length === 0 && (
        <div className="bg-white rounded-xl border py-16 flex flex-col items-center gap-2 text-slate-400">
          <TrendingUp className="h-10 w-10 opacity-30" />
          <p className="text-sm">No hay cobros registrados en el período seleccionado</p>
        </div>
      )}

      {/* ── Tabla detalle ── */}
      {!loading && cobros.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 text-sm">
              Detalle de cobros
              <span className="ml-2 text-slate-400 font-normal">({cobros.length} registros)</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">Identificación</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="hidden md:table-cell">Referencia</TableHead>
                  <TableHead className="hidden lg:table-cell">Usuario</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cobros.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(toDate(c.fecha), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[140px] truncate">
                      {c.clienteNombre}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-slate-500">
                      {c.clienteIdentificacion}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {METODO_LABELS[c.metodoPago] ?? c.metodoPago}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-slate-500">
                      {c.referencia ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-slate-500">
                      {c.usuarioNombre}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-700 whitespace-nowrap">
                      {currency(c.monto)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, bg, label, value }: {
  icon:  React.ReactNode;
  bg:    string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
      <div className={`${bg} p-2.5 rounded-lg flex-shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <p className="text-lg font-bold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}
