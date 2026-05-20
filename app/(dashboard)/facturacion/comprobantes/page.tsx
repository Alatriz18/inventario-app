'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ClipboardList, RefreshCw } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Button }  from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { subscribeToComprobantes, Comprobante, updateComprobante } from '@/lib/firebase/comprobantes';
import { autorizarComprobante } from '@/lib/sri/webservice';
import { getConfigSRI } from '@/lib/firebase/config-sri';
import { toast } from 'sonner';

const TIPO_LABELS: Record<string, string> = {
  factura:    'Factura', nota_venta: 'Nota de Venta',
  nota_credito:'Nota Crédito', nota_debito:'Nota Débito',
  retencion:  'Retención', liquidacion:'Liquidación', guia:'Guía Remisión',
};

const ESTADO_COLORS: Record<string, string> = {
  pendiente:   'bg-amber-50 text-amber-700',
  firmado:     'bg-blue-50 text-blue-700',
  enviado:     'bg-blue-50 text-blue-700',
  autorizado:  'bg-green-50 text-green-700',
  rechazado:   'bg-red-50 text-red-700',
  anulado:     'bg-slate-100 text-slate-500',
};

export default function ComprobantesPage() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [consultando,  setConsultando]  = useState<string | null>(null);

  useEffect(() => {
    return subscribeToComprobantes((data) => { setComprobantes(data); setLoading(false); });
  }, []);

  const filtered = comprobantes.filter(c => {
    const matchSearch = !search ||
      c.clienteNombre.toLowerCase().includes(search.toLowerCase()) ||
      c.claveAcceso.includes(search) ||
      (c.numeroAutorizacion ?? '').includes(search);
    const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

  const consultarAutorizacion = async (comp: Comprobante) => {
    setConsultando(comp.id);
    try {
      const config = await getConfigSRI();
      if (!config) throw new Error('Sin configuración SRI');
      const result = await autorizarComprobante(comp.claveAcceso, config.ambiente);
      if (result.estado === 'AUTORIZADO') {
        await updateComprobante(comp.id, {
          estado:             'autorizado',
          numeroAutorizacion: result.numeroAutorizacion,
          fechaAutorizacion:  result.fechaAutorizacion,
          xmlAutorizado:      result.xmlAutorizado,
        });
        toast.success('Comprobante autorizado');
      } else {
        toast.error(`Estado SRI: ${result.estado} — ${result.mensajes.join(', ')}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConsultando(null);
    }
  };

  // Stats
  const stats = {
    autorizados: comprobantes.filter(c => c.estado === 'autorizado').length,
    pendientes:  comprobantes.filter(c => c.estado === 'pendiente' || c.estado === 'enviado').length,
    rechazados:  comprobantes.filter(c => c.estado === 'rechazado').length,
  };

  return (
    <div>
      <PageHeader
        title="Comprobantes Electrónicos"
        description="Historial de todos los comprobantes emitidos"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Autorizados', value: stats.autorizados, color: 'text-green-600' },
          { label: 'Pendientes',  value: stats.pendientes,  color: 'text-amber-600' },
          { label: 'Rechazados',  value: stats.rechazados,  color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <Input placeholder="Buscar por cliente, clave de acceso o autorización..."
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <Select onValueChange={setFiltroEstado} defaultValue="todos">
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="autorizado">Autorizados</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="rechazado">Rechazados</SelectItem>
            <SelectItem value="anulado">Anulados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Serie / Sec.</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-28">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay comprobantes aún.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(c => {
              const fecha = (c.fechaEmision as any)?.toDate?.() ?? new Date(c.fechaEmision);
              return (
                <TableRow key={c.id}>
                  <TableCell className="text-sm text-slate-500">
                    {format(fecha, 'dd/MM/yyyy', { locale: es })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {TIPO_LABELS[c.tipo] ?? c.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div>{c.serie}-{c.secuencial}</div>
                    {c.numeroAutorizacion && (
                      <div className="text-slate-400 truncate max-w-[120px]" title={c.numeroAutorizacion}>
                        {c.numeroAutorizacion.slice(0, 12)}...
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{c.clienteNombre}</p>
                    <p className="text-xs text-slate-400">{c.clienteIdentificacion}</p>
                  </TableCell>
                  <TableCell className="text-right font-bold">${c.total.toFixed(2)}</TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLORS[c.estado] ?? ''}`}>
                      {c.estado.charAt(0).toUpperCase() + c.estado.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      {(c.estado === 'pendiente' || c.estado === 'enviado') && (
                        <Button variant="ghost" size="icon"
                          onClick={() => consultarAutorizacion(c)}
                          disabled={consultando === c.id}
                          className="h-8 w-8 text-slate-500 hover:text-blue-600"
                          title="Consultar autorización SRI">
                          <RefreshCw className={`h-4 w-4 ${consultando === c.id ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}