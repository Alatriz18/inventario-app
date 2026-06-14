'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, startOfMonth } from 'date-fns';
import { Scale, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { AsientoContable, CuentaContable } from '@/types';
import { subscribeToAsientos } from '@/lib/firebase/asientos';
import { subscribeToCuentas }  from '@/lib/firebase/plan-cuentas';

function currency(v: number) { return `$${Math.abs(v).toFixed(2)}`; }

export default function LibroMayorPage() {
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [cuentas,  setCuentas]  = useState<CuentaContable[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo,   setDateTo]   = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cuentaId, setCuentaId] = useState('todas');

  useEffect(() => {
    const u1 = subscribeToAsientos(d => { setAsientos(d); setLoading(false); }, 100000);
    const u2 = subscribeToCuentas(setCuentas);
    return () => { u1(); u2(); };
  }, []);

  // Solo cuentas que aceptan movimientos
  const cuentasMovimiento = cuentas.filter(c => c.aceptaMovimientos && c.activa);

  // Movimientos por cuenta en el período
  const movimientosPorCuenta = useMemo(() => {
    const from = new Date(dateFrom + 'T00:00:00');
    const to   = new Date(dateTo   + 'T23:59:59');

    const asientosFiltrados = asientos.filter(a => {
      const f = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
      return f >= from && f <= to;
    });

    const mapa = new Map<string, {
      cuenta: CuentaContable;
      movimientos: { fecha: Date; concepto: string; debe: number; haber: number }[];
      totalDebe: number;
      totalHaber: number;
      saldo: number;
    }>();

    asientosFiltrados.forEach(a => {
      const fecha = (a.fecha as any)?.toDate?.() ?? new Date(a.fecha);
      a.lineas.forEach(l => {
        const cuenta = cuentas.find(c => c.codigo === l.cuentaCodigo);
        if (!cuenta) return;
        if (!mapa.has(cuenta.codigo)) {
          mapa.set(cuenta.codigo, {
            cuenta, movimientos: [], totalDebe: 0, totalHaber: 0, saldo: 0,
          });
        }
        const entry = mapa.get(cuenta.codigo)!;
        entry.movimientos.push({ fecha, concepto: a.concepto, debe: l.debe, haber: l.haber });
        entry.totalDebe  += l.debe;
        entry.totalHaber += l.haber;
        entry.saldo       = cuenta.naturaleza === 'deudora'
          ? entry.totalDebe  - entry.totalHaber
          : entry.totalHaber - entry.totalDebe;
      });
    });

    return Array.from(mapa.values()).sort((a, b) =>
      a.cuenta.codigo.localeCompare(b.cuenta.codigo)
    );
  }, [asientos, cuentas, dateFrom, dateTo]);

  const cuentasFiltradas = cuentaId === 'todas'
    ? movimientosPorCuenta
    : movimientosPorCuenta.filter(m => m.cuenta.codigo === cuentaId);

  const exportar = () => {
    const rows = cuentasFiltradas.flatMap(({ cuenta, movimientos, totalDebe, totalHaber, saldo }) => [
      ...movimientos.map(m => ({
        Cuenta: cuenta.codigo, NombreCuenta: cuenta.nombre,
        Fecha: format(m.fecha, 'dd/MM/yyyy'),
        Concepto: m.concepto,
        Debe: m.debe > 0 ? m.debe : '',
        Haber: m.haber > 0 ? m.haber : '',
      })),
      { Cuenta: '', NombreCuenta: `TOTAL ${cuenta.nombre}`,
        Fecha: '', Concepto: '',
        Debe: totalDebe, Haber: totalHaber },
    ]);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Libro Mayor');
    XLSX.writeFile(wb, `libro_mayor_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <div>
      <PageHeader
        title="Libro Mayor"
        description="Movimientos y saldos por cuenta contable"
        action={
          <Button variant="outline" onClick={exportar} disabled={cuentasFiltradas.length === 0}>
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
        <Select onValueChange={setCuentaId} defaultValue="todas">
          <SelectTrigger className="w-56 h-8 text-sm"><SelectValue placeholder="Todas las cuentas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las cuentas</SelectItem>
            {cuentasMovimiento.map(c => (
              <SelectItem key={c.id} value={c.codigo}>{c.codigo} — {c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({length:3}).map((_,i) => (
            <div key={i} className="bg-white rounded-xl border p-4"><Skeleton className="h-20 w-full" /></div>
          ))}
        </div>
      ) : cuentasFiltradas.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center text-slate-400">
          <Scale className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay movimientos en el período seleccionado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cuentasFiltradas.map(({ cuenta, movimientos, totalDebe, totalHaber, saldo }) => (
            <div key={cuenta.id} className="bg-white rounded-xl border overflow-hidden">
              {/* Header de la cuenta */}
              <div className="bg-slate-900 text-white px-4 py-2.5 flex justify-between items-center">
                <div>
                  <span className="font-mono text-sm font-bold">{cuenta.codigo}</span>
                  <span className="mx-2 opacity-50">—</span>
                  <span className="font-semibold">{cuenta.nombre}</span>
                </div>
                <Badge variant="outline" className="border-slate-500 text-slate-200 text-xs">
                  Naturaleza: {cuenta.naturaleza}
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Fecha</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Debe</TableHead>
                    <TableHead className="text-right">Haber</TableHead>
                    <TableHead className="text-right">Saldo parcial</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.map((m, i) => {
                    const saldoParcial = movimientos.slice(0, i + 1).reduce((s, mv) =>
                      cuenta.naturaleza === 'deudora'
                        ? s + mv.debe - mv.haber
                        : s + mv.haber - mv.debe
                    , 0);
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-sm text-slate-500">
                          {format(m.fecha, 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="text-sm">{m.concepto}</TableCell>
                        <TableCell className="text-right text-sm">
                          {m.debe > 0 ? <span className="text-blue-600 font-medium">{currency(m.debe)}</span> : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {m.haber > 0 ? <span className="text-red-600 font-medium">{currency(m.haber)}</span> : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {currency(saldoParcial)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="px-4 py-2.5 border-t bg-slate-50 flex justify-end gap-8 text-sm font-bold">
                <span className="text-blue-600">Debe: {currency(totalDebe)}</span>
                <span className="text-red-600">Haber: {currency(totalHaber)}</span>
                <span className={saldo >= 0 ? 'text-green-600' : 'text-red-600'}>
                  Saldo: {currency(saldo)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}