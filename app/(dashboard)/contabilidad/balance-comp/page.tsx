'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, startOfYear } from 'date-fns';
import { Calculator, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { AsientoContable, CuentaContable } from '@/types';
import { subscribeToAsientos } from '@/lib/firebase/asientos';
import { subscribeToCuentas }  from '@/lib/firebase/plan-cuentas';

function currency(v: number) { return v !== 0 ? `$${Math.abs(v).toFixed(2)}` : '—'; }

export default function BalanceComprobacionPage() {
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [cuentas,  setCuentas]  = useState<CuentaContable[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dateFrom, setDateFrom] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [dateTo,   setDateTo]   = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const u1 = subscribeToAsientos(d => { setAsientos(d); setLoading(false); });
    const u2 = subscribeToCuentas(setCuentas);
    return () => { u1(); u2(); };
  }, []);

  const balance = useMemo(() => {
    const from = new Date(dateFrom + 'T00:00:00');
    const to   = new Date(dateTo   + 'T23:59:59');

    const mapa = new Map<string, { cuenta: CuentaContable; debe: number; haber: number }>();

    asientos
      .filter(a => {
        const f = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
        return f >= from && f <= to;
      })
      .forEach(a => {
        a.lineas.forEach(l => {
          const cuenta = cuentas.find(c => c.codigo === l.cuentaCodigo);
          if (!cuenta || !cuenta.aceptaMovimientos) return;
          const prev = mapa.get(cuenta.codigo) ?? { cuenta, debe: 0, haber: 0 };
          mapa.set(cuenta.codigo, {
            cuenta,
            debe:  prev.debe  + l.debe,
            haber: prev.haber + l.haber,
          });
        });
      });

    return Array.from(mapa.values())
      .filter(r => r.debe > 0 || r.haber > 0)
      .sort((a, b) => a.cuenta.codigo.localeCompare(b.cuenta.codigo));
  }, [asientos, cuentas, dateFrom, dateTo]);

  const totales = balance.reduce(
    (t, r) => ({ debe: t.debe + r.debe, haber: t.haber + r.haber }),
    { debe: 0, haber: 0 }
  );
  const cuadra = Math.abs(totales.debe - totales.haber) < 0.01;

  const exportar = () => {
    const rows = balance.map(r => ({
      Código:  r.cuenta.codigo,
      Cuenta:  r.cuenta.nombre,
      Tipo:    r.cuenta.tipo,
      Debe:    r.debe,
      Haber:   r.haber,
      SaldoDeudor:  r.cuenta.naturaleza === 'deudora'  ? Math.max(0, r.debe - r.haber) : 0,
      SaldoAcreedor:r.cuenta.naturaleza === 'acreedora'? Math.max(0, r.haber - r.debe) : 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Comprobación');
    XLSX.writeFile(wb, `balance_comprobacion_${dateTo}.xlsx`);
  };

  return (
    <div>
      <PageHeader
        title="Balance de Comprobación"
        description="Verificación del equilibrio contable Debe = Haber"
        action={
          <Button variant="outline" onClick={exportar} disabled={balance.length === 0}>
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
        {balance.length > 0 && (
          <Badge className={cuadra ? 'bg-green-600' : 'bg-red-600'}>
            {cuadra ? '✓ Cuadra' : '✗ No cuadra'}
          </Badge>
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Código</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead className="text-right">Sumas Debe</TableHead>
              <TableHead className="text-right">Sumas Haber</TableHead>
              <TableHead className="text-right">Saldo Deudor</TableHead>
              <TableHead className="text-right">Saldo Acreedor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({length:8}).map((_,i) => (
                <TableRow key={i}>{Array.from({length:6}).map((_,j) =>
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : balance.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                  <Calculator className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin movimientos en el período.</p>
                </TableCell>
              </TableRow>
            ) : balance.map(r => {
              const saldoDeudor  = r.cuenta.naturaleza === 'deudora'   ? Math.max(0, r.debe - r.haber) : 0;
              const saldoAcreedor= r.cuenta.naturaleza === 'acreedora' ? Math.max(0, r.haber - r.debe) : 0;
              return (
                <TableRow key={r.cuenta.id}>
                  <TableCell className="font-mono text-xs font-semibold">{r.cuenta.codigo}</TableCell>
                  <TableCell className="text-sm">{r.cuenta.nombre}</TableCell>
                  <TableCell className="text-right text-sm text-blue-600 font-medium">{currency(r.debe)}</TableCell>
                  <TableCell className="text-right text-sm text-red-600 font-medium">{currency(r.haber)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{saldoDeudor > 0 ? currency(saldoDeudor) : '—'}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{saldoAcreedor > 0 ? currency(saldoAcreedor) : '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {balance.length > 0 && (
          <div className={`px-4 py-3 border-t flex justify-end gap-8 text-sm font-bold ${cuadra ? 'bg-green-50' : 'bg-red-50'}`}>
            <span className="text-blue-600">Total Debe: ${totales.debe.toFixed(2)}</span>
            <span className="text-red-600">Total Haber: ${totales.haber.toFixed(2)}</span>
            <span className={cuadra ? 'text-green-600' : 'text-red-600'}>
              {cuadra ? '✓ Balance cuadrado' : `⚠ Diferencia: $${Math.abs(totales.debe - totales.haber).toFixed(2)}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}