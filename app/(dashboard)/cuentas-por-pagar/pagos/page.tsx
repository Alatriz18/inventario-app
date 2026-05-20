'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CreditCard, AlertTriangle, Clock } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { FacturaProveedor } from '@/types';
import { subscribeToFacturasProveedor } from '@/lib/firebase/facturas-proveedor';
import { useRouter } from 'next/navigation';

function currency(v: number) { return `$${v.toFixed(2)}`; }

function formatFecha(fecha: any) {
  const d = fecha?.toDate?.() ?? new Date(fecha);
  return format(d, 'dd/MM/yyyy', { locale: es });
}

function diasRestantes(fecha: any): number {
  const d    = fecha?.toDate?.() ?? new Date(fecha);
  const hoy  = new Date();
  const diff = d.getTime() - hoy.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function PagosPendientesPage() {
  const router = useRouter();
  const [facturas, setFacturas] = useState<FacturaProveedor[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    return subscribeToFacturasProveedor((data) => {
      setFacturas(data);
      setLoading(false);
    });
  }, []);

  // Solo facturas no pagadas
  const pendientes = facturas
    .filter(f => f.estado !== 'pagada')
    .sort((a, b) => {
      // Vencidas primero, luego por fecha de vencimiento
      if (a.estado === 'vencida' && b.estado !== 'vencida') return -1;
      if (b.estado === 'vencida' && a.estado !== 'vencida') return 1;
      return 0;
    });

  const totalPendiente = pendientes.reduce((s, f) => s + f.saldoPendiente, 0);
  const vencidas       = pendientes.filter(f => f.estado === 'vencida');
  const proximasVencer = pendientes.filter(f => {
    if (!f.fechaVencimiento || f.estado === 'vencida') return false;
    const dias = diasRestantes(f.fechaVencimiento);
    return dias >= 0 && dias <= 7;
  });

  return (
    <div>
      <PageHeader
        title="Pagos Pendientes"
        description="Facturas de proveedores por pagar ordenadas por urgencia"
        action={
          <Button onClick={() => router.push('/cuentas-por-pagar/facturas')}>
            <CreditCard className="mr-2 h-4 w-4" /> Ir a Facturas
          </Button>
        }
      />

      {/* Alertas */}
      {vencidas.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="font-semibold text-red-700 text-sm">
              {vencidas.length} factura(s) vencida(s)
            </p>
            <p className="text-xs text-red-500">
              Total vencido: {currency(vencidas.reduce((s, f) => s + f.saldoPendiente, 0))}
            </p>
          </div>
        </div>
      )}

      {proximasVencer.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-700 text-sm">
              {proximasVencer.length} factura(s) vencen en los próximos 7 días
            </p>
            <p className="text-xs text-amber-500">
              Total próximo a vencer: {currency(proximasVencer.reduce((s, f) => s + f.saldoPendiente, 0))}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total pendiente', value: currency(totalPendiente), color: 'text-slate-900' },
          { label: 'Facturas',        value: pendientes.length,        color: 'text-slate-700' },
          { label: 'Vencidas',        value: vencidas.length,          color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Proveedor</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-center">Urgencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : pendientes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                  <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">¡Todo al día! No hay pagos pendientes.</p>
                </TableCell>
              </TableRow>
            ) : pendientes.map(f => {
              const dias  = f.fechaVencimiento ? diasRestantes(f.fechaVencimiento) : null;
              const esVencida = f.estado === 'vencida' || (dias !== null && dias < 0);
              const esUrgente = dias !== null && dias >= 0 && dias <= 3;
              const esProxima = dias !== null && dias > 3 && dias <= 7;

              return (
                <TableRow key={f.id} className={esVencida ? 'bg-red-50/50' : esUrgente ? 'bg-amber-50/50' : ''}>
                  <TableCell>
                    <p className="font-medium text-sm">{f.proveedorNombre}</p>
                    <p className="text-xs text-slate-400">{f.proveedorRuc}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{f.numeroFactura}</TableCell>
                  <TableCell>
                    {f.fechaVencimiento ? (
                      <div>
                        <p className={`text-sm font-medium ${esVencida ? 'text-red-600' : esUrgente ? 'text-amber-600' : 'text-slate-700'}`}>
                          {formatFecha(f.fechaVencimiento)}
                        </p>
                        {dias !== null && (
                          <p className={`text-xs ${esVencida ? 'text-red-500' : esUrgente ? 'text-amber-500' : 'text-slate-400'}`}>
                            {dias < 0 ? `Vencida hace ${Math.abs(dias)} días` :
                             dias === 0 ? 'Vence hoy' :
                             `${dias} días`}
                          </p>
                        )}
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{currency(f.total)}</TableCell>
                  <TableCell className="text-right font-bold text-red-600">{currency(f.saldoPendiente)}</TableCell>
                  <TableCell className="text-center">
                    {esVencida ? (
                      <Badge variant="destructive" className="text-xs">Vencida</Badge>
                    ) : esUrgente ? (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Urgente</span>
                    ) : esProxima ? (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">Esta semana</span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Normal</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {!loading && pendientes.length > 0 && (
          <div className="px-4 py-3 border-t bg-slate-50 flex justify-between text-sm">
            <span className="text-slate-400">{pendientes.length} factura(s) pendiente(s)</span>
            <span className="font-bold text-slate-700">Total: {currency(totalPendiente)}</span>
          </div>
        )}
      </div>
    </div>
  );
}