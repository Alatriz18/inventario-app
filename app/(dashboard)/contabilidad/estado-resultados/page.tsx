'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, startOfYear } from 'date-fns';
import { BarChart3, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Skeleton }from '@/components/ui/skeleton';
import { Separator }from '@/components/ui/separator';

import { AsientoContable, CuentaContable } from '@/types';
import { subscribeToAsientos } from '@/lib/firebase/asientos';
import { subscribeToCuentas }  from '@/lib/firebase/plan-cuentas';

function currency(v: number) { return `$${Math.abs(v).toFixed(2)}`; }

export default function EstadoResultadosPage() {
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [cuentas,  setCuentas]  = useState<CuentaContable[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dateFrom, setDateFrom] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [dateTo,   setDateTo]   = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const u1 = subscribeToAsientos(d => { setAsientos(d); setLoading(false); }, 100000);
    const u2 = subscribeToCuentas(setCuentas);
    return () => { u1(); u2(); };
  }, []);

  const data = useMemo(() => {
    const from = new Date(dateFrom + 'T00:00:00');
    const to   = new Date(dateTo   + 'T23:59:59');
    const mapa = new Map<string, { cuenta: CuentaContable; saldo: number }>();

    asientos
      .filter(a => {
        const f = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
        return f >= from && f <= to;
      })
      .forEach(a => {
        a.lineas.forEach(l => {
          const cuenta = cuentas.find(c => c.codigo === l.cuentaCodigo);
          if (!cuenta || !cuenta.aceptaMovimientos) return;
          if (!['ingreso','costo','gasto'].includes(cuenta.tipo)) return;
          const prev  = mapa.get(cuenta.codigo) ?? { cuenta, saldo: 0 };
          const saldo = cuenta.naturaleza === 'deudora'
            ? prev.saldo + l.debe - l.haber
            : prev.saldo + l.haber - l.debe;
          mapa.set(cuenta.codigo, { cuenta, saldo });
        });
      });

    const items = Array.from(mapa.values()).filter(r => Math.abs(r.saldo) >= 0.01);
    const ingresos = items.filter(r => r.cuenta.tipo === 'ingreso').sort((a,b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo));
    const costos   = items.filter(r => r.cuenta.tipo === 'costo').sort((a,b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo));
    const gastos   = items.filter(r => r.cuenta.tipo === 'gasto').sort((a,b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo));

    const totalIngresos = ingresos.reduce((s, r) => s + r.saldo, 0);
    const totalCostos   = costos.reduce((s, r) => s + r.saldo, 0);
    const totalGastos   = gastos.reduce((s, r) => s + r.saldo, 0);
    const utilidadBruta = totalIngresos - totalCostos;
    const utilidadNeta  = utilidadBruta - totalGastos;

    return { ingresos, costos, gastos, totalIngresos, totalCostos, totalGastos, utilidadBruta, utilidadNeta };
  }, [asientos, cuentas, dateFrom, dateTo]);

  const exportar = () => {
    const rows = [
      { Sección:'INGRESOS', Código:'', Cuenta:'', Monto:'' },
      ...data.ingresos.map(r => ({ Sección:'', Código: r.cuenta.codigo, Cuenta: r.cuenta.nombre, Monto: r.saldo })),
      { Sección:'', Código:'', Cuenta:'TOTAL INGRESOS', Monto: data.totalIngresos },
      { Sección:'COSTOS', Código:'', Cuenta:'', Monto:'' },
      ...data.costos.map(r => ({ Sección:'', Código: r.cuenta.codigo, Cuenta: r.cuenta.nombre, Monto: r.saldo })),
      { Sección:'', Código:'', Cuenta:'TOTAL COSTOS', Monto: data.totalCostos },
      { Sección:'', Código:'', Cuenta:'UTILIDAD BRUTA', Monto: data.utilidadBruta },
      { Sección:'GASTOS', Código:'', Cuenta:'', Monto:'' },
      ...data.gastos.map(r => ({ Sección:'', Código: r.cuenta.codigo, Cuenta: r.cuenta.nombre, Monto: r.saldo })),
      { Sección:'', Código:'', Cuenta:'TOTAL GASTOS', Monto: data.totalGastos },
      { Sección:'', Código:'', Cuenta:'UTILIDAD NETA', Monto: data.utilidadNeta },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estado Resultados');
    XLSX.writeFile(wb, `estado_resultados_${dateFrom}_${dateTo}.xlsx`);
  };

  const chartData = [
    { name: 'Ingresos',      valor: data.totalIngresos, fill: '#00A896' },
    { name: 'Costos',        valor: data.totalCostos,   fill: '#EF4444' },
    { name: 'Gastos',        valor: data.totalGastos,   fill: '#F59E0B' },
    { name: 'Util. Neta',    valor: data.utilidadNeta,  fill: data.utilidadNeta >= 0 ? '#1A3C5E' : '#DC2626' },
  ];

  const SeccionItems = ({ items }: { items: { cuenta: CuentaContable; saldo: number }[] }) => (
    <div className="space-y-1">
      {items.map(r => (
        <div key={r.cuenta.id} className="flex justify-between text-sm py-1 border-b last:border-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-400 w-16">{r.cuenta.codigo}</span>
            <span>{r.cuenta.nombre}</span>
          </div>
          <span className="font-medium">{currency(r.saldo)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Estado de Resultados"
        description="Ingresos, costos, gastos y utilidad del período"
        action={
          <Button variant="outline" onClick={exportar} disabled={loading}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Desde</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full sm:w-36 h-8 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Hasta</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full sm:w-36 h-8 text-sm" />
        </div>
      </div>

      {loading ? <Skeleton className="h-96 w-full" /> : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Ingresos totales', value: currency(data.totalIngresos), color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Costos totales',   value: currency(data.totalCostos),   color: 'text-orange-600',bg: 'bg-orange-50'},
              { label: 'Gastos totales',   value: currency(data.totalGastos),   color: 'text-red-600',   bg: 'bg-red-50'   },
              {
                label: 'Utilidad neta',
                value: currency(data.utilidadNeta),
                color: data.utilidadNeta >= 0 ? 'text-slate-900' : 'text-red-600',
                bg: data.utilidadNeta >= 0 ? 'bg-slate-900 text-white' : 'bg-red-50',
              },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-xl border p-4 ${bg}`}>
                <p className={`text-xs ${bg.includes('slate-900') ? 'text-slate-300' : 'text-slate-400'}`}>{label}</p>
                <p className={`text-xl font-bold mt-1 ${bg.includes('slate-900') ? 'text-white' : color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Gráfico */}
          <div className="bg-white rounded-xl border p-5">
            <p className="font-semibold text-slate-700 mb-4">Resumen visual</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: any) => typeof v === 'number' ? currency(v) : v} />
                <Bar dataKey="valor" name="Monto" radius={[4,4,0,0]}>
                  {chartData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Estado detallado */}
          <div className="bg-white rounded-xl border p-5 space-y-5">
            <div>
              <h3 className="font-bold text-green-700 text-sm mb-2 flex justify-between">
                <span>INGRESOS OPERACIONALES</span>
              </h3>
              <SeccionItems items={data.ingresos} />
              <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t text-green-700">
                <span>Total Ingresos</span><span>{currency(data.totalIngresos)}</span>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-bold text-orange-600 text-sm mb-2">COSTOS DE VENTAS</h3>
              <SeccionItems items={data.costos} />
              <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t text-orange-600">
                <span>Total Costos</span><span>({currency(data.totalCostos)})</span>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 flex justify-between font-bold">
              <span>UTILIDAD BRUTA</span>
              <span className={data.utilidadBruta >= 0 ? 'text-green-600' : 'text-red-600'}>
                {currency(data.utilidadBruta)}
              </span>
            </div>

            <Separator />

            <div>
              <h3 className="font-bold text-red-600 text-sm mb-2">GASTOS OPERACIONALES</h3>
              <SeccionItems items={data.gastos} />
              <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t text-red-600">
                <span>Total Gastos</span><span>({currency(data.totalGastos)})</span>
              </div>
            </div>

            <Separator />

            <div className={`rounded-xl p-4 flex justify-between font-bold text-lg ${
              data.utilidadNeta >= 0 ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'
            }`}>
              <span>UTILIDAD NETA DEL PERÍODO</span>
              <span>{data.utilidadNeta >= 0 ? currency(data.utilidadNeta) : `(${currency(data.utilidadNeta)})`}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}