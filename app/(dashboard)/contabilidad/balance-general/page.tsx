'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, startOfYear } from 'date-fns';
import { TrendingUp, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Separator }from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import { AsientoContable, CuentaContable } from '@/types';
import { subscribeToAsientos } from '@/lib/firebase/asientos';
import { subscribeToCuentas }  from '@/lib/firebase/plan-cuentas';

function currency(v: number) { return `$${Math.abs(v).toFixed(2)}`; }

export default function BalanceGeneralPage() {
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [cuentas,  setCuentas]  = useState<CuentaContable[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dateTo,   setDateTo]   = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const u1 = subscribeToAsientos(d => { setAsientos(d); setLoading(false); }, 100000);
    const u2 = subscribeToCuentas(setCuentas);
    return () => { u1(); u2(); };
  }, []);

  const data = useMemo(() => {
    const to = new Date(dateTo + 'T23:59:59');
    const mapa = new Map<string, { cuenta: CuentaContable; saldo: number }>();

    asientos
      .filter(a => {
        const f = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
        return f <= to;
      })
      .forEach(a => {
        a.lineas.forEach(l => {
          const cuenta = cuentas.find(c => c.codigo === l.cuentaCodigo);
          if (!cuenta || !cuenta.aceptaMovimientos) return;
          const prev   = mapa.get(cuenta.codigo) ?? { cuenta, saldo: 0 };
          const saldo  = cuenta.naturaleza === 'deudora'
            ? prev.saldo + l.debe - l.haber
            : prev.saldo + l.haber - l.debe;
          mapa.set(cuenta.codigo, { cuenta, saldo });
        });
      });

    const items = Array.from(mapa.values()).filter(r => Math.abs(r.saldo) >= 0.01);

    const activos    = items.filter(r => r.cuenta.tipo === 'activo').sort((a,b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo));
    const pasivos    = items.filter(r => r.cuenta.tipo === 'pasivo').sort((a,b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo));
    const patrimonio = items.filter(r => r.cuenta.tipo === 'patrimonio').sort((a,b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo));

    const totalActivo    = activos.reduce((s, r) => s + r.saldo, 0);
    const totalPasivo    = pasivos.reduce((s, r) => s + r.saldo, 0);
    const totalPatrimonio= patrimonio.reduce((s, r) => s + r.saldo, 0);

    return { activos, pasivos, patrimonio, totalActivo, totalPasivo, totalPatrimonio };
  }, [asientos, cuentas, dateTo]);

  const cuadra = Math.abs(data.totalActivo - (data.totalPasivo + data.totalPatrimonio)) < 0.01;

  const exportar = () => {
    const rows = [
      ...data.activos.map(r => ({ Sección: 'ACTIVO', Código: r.cuenta.codigo, Cuenta: r.cuenta.nombre, Saldo: r.saldo })),
      { Sección: '', Código: '', Cuenta: 'TOTAL ACTIVO', Saldo: data.totalActivo },
      ...data.pasivos.map(r => ({ Sección: 'PASIVO', Código: r.cuenta.codigo, Cuenta: r.cuenta.nombre, Saldo: r.saldo })),
      { Sección: '', Código: '', Cuenta: 'TOTAL PASIVO', Saldo: data.totalPasivo },
      ...data.patrimonio.map(r => ({ Sección: 'PATRIMONIO', Código: r.cuenta.codigo, Cuenta: r.cuenta.nombre, Saldo: r.saldo })),
      { Sección: '', Código: '', Cuenta: 'TOTAL PATRIMONIO', Saldo: data.totalPatrimonio },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance General');
    XLSX.writeFile(wb, `balance_general_${dateTo}.xlsx`);
  };

  const SeccionRows = ({ items }: { items: { cuenta: CuentaContable; saldo: number }[] }) => (
    <>
      {items.map(r => (
        <div key={r.cuenta.id} className="flex justify-between items-center py-1.5 text-sm border-b last:border-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-400 w-16">{r.cuenta.codigo}</span>
            <span>{r.cuenta.nombre}</span>
          </div>
          <span className="font-semibold">{currency(r.saldo)}</span>
        </div>
      ))}
    </>
  );

  return (
    <div>
      <PageHeader
        title="Balance General"
        description="Estado de situación financiera al cierre del período"
        action={
          <Button variant="outline" onClick={exportar} disabled={loading}>
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      <div className="bg-white rounded-xl border p-4 flex items-center gap-3 mb-4">
        <span className="text-xs text-slate-400">Al</span>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full sm:w-40 h-8 text-sm" />
        {!loading && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cuadra ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {cuadra ? '✓ Cuadra' : '✗ No cuadra'}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ACTIVOS */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-2.5 font-bold text-sm">ACTIVOS</div>
            <div className="p-4 space-y-1">
              <SeccionRows items={data.activos} />
            </div>
            <div className="px-4 py-3 border-t bg-blue-50 flex justify-between font-bold text-sm text-blue-700">
              <span>TOTAL ACTIVOS</span>
              <span>{currency(data.totalActivo)}</span>
            </div>
          </div>

          {/* PASIVOS + PATRIMONIO */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="bg-red-600 text-white px-4 py-2.5 font-bold text-sm">PASIVOS</div>
              <div className="p-4">
                <SeccionRows items={data.pasivos} />
              </div>
              <div className="px-4 py-3 border-t bg-red-50 flex justify-between font-bold text-sm text-red-700">
                <span>TOTAL PASIVOS</span>
                <span>{currency(data.totalPasivo)}</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="bg-purple-600 text-white px-4 py-2.5 font-bold text-sm">PATRIMONIO</div>
              <div className="p-4">
                <SeccionRows items={data.patrimonio} />
              </div>
              <div className="px-4 py-3 border-t bg-purple-50 flex justify-between font-bold text-sm text-purple-700">
                <span>TOTAL PATRIMONIO</span>
                <span>{currency(data.totalPatrimonio)}</span>
              </div>
            </div>

            <div className={`rounded-xl border p-4 flex justify-between font-bold ${cuadra ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              <span>TOTAL PASIVO + PATRIMONIO</span>
              <span>{currency(data.totalPasivo + data.totalPatrimonio)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}