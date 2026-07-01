'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Receipt, XCircle, ChevronDown, TrendingUp, Printer } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Separator}from '@/components/ui/separator';
import { Button }  from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { Venta } from '@/types';
import { subscribeToVentas, anularVenta } from '@/lib/firebase/ventas';
import { getConfigSRI } from '@/lib/firebase/config-sri';
import { descargarTicket } from '@/lib/pdf/ticket-venta';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
};

function currency(v: number) { return `$${v.toFixed(2)}`; }

export default function HistorialVentasPage() {
  const { user } = useAuth();

  const [ventas,    setVentas]    = useState<Venta[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('todos');
  const [filtroFecha,  setFiltroFecha]  = useState('');
  const [detailId,  setDetailId]  = useState<string | null>(null);
  const [anulando,  setAnulando]  = useState<string | null>(null);

  useEffect(() => {
    return subscribeToVentas((data) => { setVentas(data); setLoading(false); });
  }, []);

  const filtered = ventas.filter(v => {
    const matchSearch = !search ||
      v.clienteNombre.toLowerCase().includes(search.toLowerCase()) ||
      v.clienteIdentificacion.includes(search);
    const matchMetodo = filtroMetodo === 'todos' || v.metodoPago === filtroMetodo;
    const matchFecha  = !filtroFecha || (() => {
      const f = (v.fecha as any)?.toDate?.() ?? new Date(v.fecha);
      return format(f, 'yyyy-MM-dd') === filtroFecha;
    })();
    return matchSearch && matchMetodo && matchFecha;
  });

  // Totales del período filtrado
  const totalVentas    = filtered.filter(v => v.estado === 'completada').reduce((s, v) => s + v.total, 0);
  const totalGanancias = filtered.filter(v => v.estado === 'completada').reduce((s, v) => s + v.gananciaTotal, 0);

  const confirmarAnulacion = async () => {
    if (!anulando || !user) return;
    try {
      await anularVenta(anulando, user.uid, user.nombre);
      toast.success('Venta anulada y stock revertido');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al anular');
    } finally {
      setAnulando(null);
    }
  };

  const ventaDetalle = ventas.find(v => v.id === detailId);

  return (
    <div>
      <PageHeader
        title="Historial de Ventas"
        description="Registro completo de todas las transacciones"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total ventas',      value: filtered.filter(v => v.estado === 'completada').length, tipo: 'count', color: 'text-blue-600' },
          { label: 'Ingresos',          value: totalVentas,    tipo: 'money', color: 'text-slate-800' },
          { label: 'Ganancia estimada', value: totalGanancias, tipo: 'money', color: 'text-green-600' },
          { label: 'Anuladas',          value: filtered.filter(v => v.estado === 'anulada').length,    tipo: 'count', color: 'text-red-500' },
        ].map(({ label, value, tipo, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>
              {tipo === 'money' ? currency(value as number) : value}
            </p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input placeholder="Buscar por cliente..."
          value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[160px] max-w-xs" />
        <Select onValueChange={setFiltroMetodo} defaultValue="todos">
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los métodos</SelectItem>
            <SelectItem value="efectivo">Efectivo</SelectItem>
            <SelectItem value="tarjeta">Tarjeta</SelectItem>
            <SelectItem value="transferencia">Transferencia</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={filtroFecha}
          onChange={e => setFiltroFecha(e.target.value)} className="w-44" />
        {(search || filtroMetodo !== 'todos' || filtroFecha) && (
          <button onClick={() => { setSearch(''); setFiltroMetodo('todos'); setFiltroFecha(''); }}
            className="text-xs text-slate-400 hover:text-slate-600 underline self-center">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-center hidden sm:table-cell">Ítems</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right hidden md:table-cell">Ganancia</TableHead>
              <TableHead className="text-center hidden sm:table-cell">Método</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-24">Acc.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay ventas registradas.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(v => {
              const fecha = (v.fecha as any)?.toDate?.() ?? new Date(v.fecha);
              return (
                <TableRow key={v.id} className={v.estado === 'anulada' ? 'opacity-50' : ''}>
                  <TableCell className="text-sm">
                    <div>{format(fecha, 'dd/MM/yyyy', { locale: es })}</div>
                    <div className="text-xs text-slate-400">{format(fecha, 'HH:mm')}</div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{v.clienteNombre}</p>
                    <p className="text-xs text-slate-400">{v.clienteIdentificacion}</p>
                  </TableCell>
                  <TableCell className="text-center hidden sm:table-cell">
                    <Badge variant="outline">{v.items.length}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">{currency(v.total)}</TableCell>
                  <TableCell className="text-right hidden md:table-cell">
                    <span className={`text-sm font-semibold ${v.gananciaTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {currency(v.gananciaTotal)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center hidden sm:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {METODO_LABELS[v.metodoPago]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={v.estado === 'completada' ? 'default' : 'destructive'}>
                      {v.estado === 'completada' ? 'Completada' : 'Anulada'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setDetailId(v.id)}
                        className="h-8 w-8 text-slate-500 hover:text-blue-600"
                        title="Ver detalle">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      {v.estado === 'completada' && (
                        <>
                          <Button variant="ghost" size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-slate-800"
                            title="Imprimir ticket"
                            onClick={async () => {
                              try {
                                const config = await getConfigSRI();
                                descargarTicket({
                                  nombreNegocio: config?.nombreComercial || config?.razonSocial || 'Mi Negocio',
                                  ruc:           config?.ruc || '',
                                  direccion:     config?.direccionMatriz || '',
                                  venta:         v,
                                });
                                toast.success('Ticket descargado');
                              } catch { toast.error('Error al generar ticket'); }
                            }}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setAnulando(v.id)}
                            className="h-8 w-8 text-slate-500 hover:text-red-600"
                            title="Anular venta">
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t bg-slate-50 text-xs text-slate-400">
            {filtered.length} venta(s) — Ingresos: <span className="font-semibold text-slate-700">{currency(totalVentas)}</span>
            {' '}— Ganancia: <span className="font-semibold text-green-600">{currency(totalGanancias)}</span>
          </div>
        )}
      </div>

      {/* DIALOG DETALLE */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Detalle de Venta</DialogTitle></DialogHeader>
          {ventaDetalle && (() => {
            const fecha = (ventaDetalle.fecha as any)?.toDate?.() ?? new Date(ventaDetalle.fecha);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-slate-400 text-xs">Cliente</p><p className="font-medium">{ventaDetalle.clienteNombre}</p></div>
                  <div><p className="text-slate-400 text-xs">Fecha</p><p className="font-medium">{format(fecha, "dd/MM/yyyy HH:mm")}</p></div>
                  <div><p className="text-slate-400 text-xs">Método de pago</p><p className="font-medium">{METODO_LABELS[ventaDetalle.metodoPago]}</p></div>
                  <div><p className="text-slate-400 text-xs">Vendedor</p><p className="font-medium">{ventaDetalle.usuarioNombre}</p></div>
                </div>
                <Separator />
                <div className="space-y-2">
                  {ventaDetalle.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center text-sm py-1 border-b last:border-0">
                      <div>
                        <p className="font-medium">{item.nombre}</p>
                        <p className="text-xs text-slate-400">
                          {item.sku} × {item.cantidad}
                          {item.descuento > 0 && ` — Desc: ${item.descuento}%`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{currency(item.subtotal)}</p>
                        <p className="text-xs text-green-600">+{currency(item.ganancia)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal</span><span>{currency(ventaDetalle.subtotal)}</span>
                  </div>
                  {ventaDetalle.descuentoGlobal > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Descuento ({ventaDetalle.descuentoGlobal}%)</span>
                      <span>−{currency(ventaDetalle.subtotal * ventaDetalle.descuentoGlobal / 100)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span><span>{currency(ventaDetalle.total)}</span>
                  </div>
                  <div className="flex justify-between text-green-600 font-semibold">
                    <span>Ganancia</span><span>{currency(ventaDetalle.gananciaTotal)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ALERT ANULAR */}
      <AlertDialog open={!!anulando} onOpenChange={() => setAnulando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular esta venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se revertirá el stock de todos los productos vendidos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAnulacion} className="bg-red-600 hover:bg-red-700">
              Anular venta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}