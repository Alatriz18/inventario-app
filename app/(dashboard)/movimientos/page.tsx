'use client';

import { useEffect, useState } from 'react';
import { onSnapshot, query, orderBy, collection, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeftRight, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface Movimiento {
  id:             string;
  tipo:           string;
  productoId:     string;
  productoNombre: string;
  cantidad:       number;
  stockAnterior:  number;
  stockNuevo:     number;
  bodegaNombre?:  string;
  referencia:     string;
  referenciaType: string;
  usuarioNombre:  string;
  fecha:          any;
  notas?:         string;
}

// ─── Config visual por tipo ─────────────────────────────────────────────────
const TIPO_CONFIG: Record<string, {
  label: string; color: string; icon: React.ElementType; signo: '+' | '-';
}> = {
  entrada:              { label: 'Entrada',               color: 'bg-green-50 text-green-700',   icon: TrendingUp,   signo: '+' },
  salida:               { label: 'Salida',                color: 'bg-red-50 text-red-700',       icon: TrendingDown, signo: '-' },
  ajuste_positivo:      { label: 'Ajuste (+)',            color: 'bg-blue-50 text-blue-700',     icon: TrendingUp,   signo: '+' },
  ajuste_negativo:      { label: 'Ajuste (−)',            color: 'bg-amber-50 text-amber-700',   icon: TrendingDown, signo: '-' },
  devolucion_cliente:   { label: 'Dev. Cliente',          color: 'bg-purple-50 text-purple-700', icon: RefreshCw,    signo: '+' },
  devolucion_proveedor: { label: 'Dev. Proveedor',        color: 'bg-orange-50 text-orange-700', icon: RefreshCw,    signo: '-' },
};

const FILTROS_TIPO = [
  { value: 'todos',               label: 'Todos los tipos' },
  { value: 'entrada',             label: 'Entradas' },
  { value: 'salida',              label: 'Salidas' },
  { value: 'ajuste_positivo',     label: 'Ajustes (+)' },
  { value: 'ajuste_negativo',     label: 'Ajustes (−)' },
  { value: 'devolucion_cliente',  label: 'Dev. Clientes' },
  { value: 'devolucion_proveedor',label: 'Dev. Proveedores' },
];

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filtroTipo,  setFiltroTipo]  = useState('todos');
  const [filtroFecha, setFiltroFecha] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'movimientos'),
      orderBy('fecha', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setMovimientos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Movimiento)));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Filtros en cliente
  const filtered = movimientos.filter((m) => {
    const matchSearch = !search ||
      m.productoNombre.toLowerCase().includes(search.toLowerCase()) ||
      m.usuarioNombre.toLowerCase().includes(search.toLowerCase());

    const matchTipo = filtroTipo === 'todos' || m.tipo === filtroTipo;

    const matchFecha = !filtroFecha || (() => {
      const fecha = m.fecha?.toDate?.() ?? new Date(m.fecha);
      return format(fecha, 'yyyy-MM-dd') === filtroFecha;
    })();

    return matchSearch && matchTipo && matchFecha;
  });

  // Estadísticas rápidas
  const stats = {
    entradas:  movimientos.filter((m) => m.tipo === 'entrada').length,
    salidas:   movimientos.filter((m) => m.tipo === 'salida').length,
    ajustes:   movimientos.filter((m) => m.tipo.startsWith('ajuste')).length,
    devoluciones: movimientos.filter((m) => m.tipo.startsWith('devolucion')).length,
  };

  return (
    <div>
      <PageHeader
        title="Historial de Movimientos"
        description="Registro completo de todos los cambios de stock"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Entradas',     value: stats.entradas,     color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Salidas',      value: stats.salidas,      color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Ajustes',      value: stats.ajustes,      color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Devoluciones', value: stats.devoluciones, color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder="Buscar por producto o usuario..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select onValueChange={setFiltroTipo} defaultValue="todos">
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTROS_TIPO.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
          className="w-44"
        />
        {(search || filtroTipo !== 'todos' || filtroFecha) && (
          <button
            onClick={() => { setSearch(''); setFiltroTipo('todos'); setFiltroFecha(''); }}
            className="text-xs text-slate-400 hover:text-slate-600 underline self-center"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-36">Fecha</TableHead>
              <TableHead className="w-36">Tipo</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-center w-24">Cantidad</TableHead>
              <TableHead className="text-center w-24">Stock ant.</TableHead>
              <TableHead className="text-center w-24">Stock nuevo</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                  <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">
                    {movimientos.length === 0
                      ? 'No hay movimientos registrados aún.'
                      : 'No hay resultados para los filtros aplicados.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const config = TIPO_CONFIG[m.tipo] ?? {
                  label: m.tipo, color: 'bg-slate-100 text-slate-600',
                  icon: ArrowLeftRight, signo: '+' as const,
                };
                const Icon  = config.icon;
                const fecha = m.fecha?.toDate?.() ?? new Date(m.fecha);
                const esPositivo = config.signo === '+';

                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-slate-500">
                      <div>{format(fecha, 'dd/MM/yyyy', { locale: es })}</div>
                      <div className="text-slate-400">{format(fecha, 'HH:mm')}</div>
                    </TableCell>

                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${config.color}`}>
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </span>
                    </TableCell>

                    <TableCell>
                      <p className="font-medium text-sm">{m.productoNombre}</p>
                    </TableCell>

                    <TableCell className="text-center">
                      <span className={`font-bold text-sm ${esPositivo ? 'text-green-600' : 'text-red-600'}`}>
                        {config.signo}{m.cantidad}
                      </span>
                    </TableCell>

                    <TableCell className="text-center text-sm text-slate-500">
                      {m.stockAnterior}
                    </TableCell>

                    <TableCell className="text-center">
                      <span className="font-semibold text-sm">{m.stockNuevo}</span>
                    </TableCell>

                    <TableCell className="text-sm text-slate-500">
                      {m.bodegaNombre || '—'}
                    </TableCell>

                    <TableCell className="text-sm text-slate-500">
                      {m.usuarioNombre}
                    </TableCell>

                    <TableCell className="text-xs text-slate-400 max-w-[120px] truncate">
                      {m.notas || '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Footer con conteo */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t bg-slate-50 text-xs text-slate-400">
            Mostrando {filtered.length} de {movimientos.length} movimientos
          </div>
        )}
      </div>
    </div>
  );
}