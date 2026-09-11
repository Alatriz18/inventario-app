'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, differenceInDays } from 'date-fns';
import { DollarSign, Clock, AlertTriangle, CheckCircle, Download, Plus, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Skeleton }from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Label }  from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Ban, ChevronDown, Pencil } from 'lucide-react';

import { CuentaCobrar, CobroCxC, MetodoPago, Cliente, CuentaBancaria } from '@/types';
import {
  subscribeToCxC, registrarCobroCxC, actualizarEstadosVencidos, crearCuentaCobrar,
  anularCobro, vincularAsientoCobro, editarCobro,
} from '@/lib/firebase/cuentas-cobrar';
import { crearAsientoCobro, crearAsientoReversion } from '@/lib/contabilidad/motor-asientos';
import { editarAsiento } from '@/lib/firebase/asientos';
import { subscribeToClientes } from '@/lib/firebase/clientes';
import { subscribeToComprobantes, Comprobante } from '@/lib/firebase/comprobantes';
import { subscribeToCuentasBancarias, registrarMovimientoBancario, conciliarMovimiento } from '@/lib/firebase/cuentas-bancarias';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;

const BADGE_ESTADO: Record<string, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  parcial:   'bg-yellow-100 text-yellow-700',
  pagada:    'bg-green-100 text-green-700',
  vencida:   'bg-red-100 text-red-700',
};

export default function CxCPage() {
  const { user } = useAuth();
  const [cxcList,  setCxcList]  = useState<CuentaCobrar[]>([]);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [tabActivo,setTabActivo]= useState('pendientes');

  // Dialog cobro
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cxcSel,     setCxcSel]     = useState<CuentaCobrar | null>(null);
  const [montoCobro, setMontoCobro] = useState('');
  const [fechaCobro, setFechaCobro] = useState(new Date().toISOString().split('T')[0]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [refCobro,   setRefCobro]   = useState('');
  const [retFuente,  setRetFuente]  = useState('');
  const [retIVA,     setRetIVA]     = useState('');
  const [saving,     setSaving]     = useState(false);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [cuentaBancariaId, setCuentaBancariaId] = useState('');

  // Dialog detalle (historial de cobros)
  const [detailCxc,  setDetailCxc]  = useState<CuentaCobrar | null>(null);

  // Dialog editar cobro (fecha / referencia)
  const [editCobro,     setEditCobro]     = useState<CobroCxC | null>(null);
  const [editFecha,     setEditFecha]     = useState('');
  const [editReferencia,setEditReferencia]= useState('');
  const [savingEdit,    setSavingEdit]    = useState(false);

  // Nueva CxC manual
  const [nuevaOpen,     setNuevaOpen]     = useState(false);
  const [clientes,      setClientes]      = useState<Cliente[]>([]);
  const [clienteBusq,   setClienteBusq]   = useState('');
  const [clienteSel,    setClienteSel]    = useState<Cliente | null>(null);
  const [nuevoMonto,    setNuevoMonto]    = useState('');
  const [nuevosDias,    setNuevosDias]    = useState('30');
  const [nuevaDesc,     setNuevaDesc]     = useState('');
  const [savingNueva,   setSavingNueva]   = useState(false);

  useEffect(() => {
    actualizarEstadosVencidos().catch(() => {});
    const unsub = subscribeToCxC(data => { setCxcList(data); setLoading(false); });
    const unsubCli = subscribeToClientes(setClientes);
    const unsubComp = subscribeToComprobantes(setComprobantes);
    const unsubBancos = subscribeToCuentasBancarias(setCuentasBancarias);
    return () => { unsub(); unsubCli(); unsubComp(); unsubBancos(); };
  }, []);

  // Comprobante (factura/nota de venta) vinculado a cada CxC, por ventaId
  const comprobantePorVenta = useMemo(() => {
    const m = new Map<string, Comprobante>();
    comprobantes.forEach(c => { if (c.ventaId) m.set(c.ventaId, c); });
    return m;
  }, [comprobantes]);

  const numeroComprobante = (cxc: CuentaCobrar): string => {
    const comp = cxc.ventaId ? comprobantePorVenta.get(cxc.ventaId) : undefined;
    if (comp) return `${comp.serie}-${comp.secuencial}`;
    return cxc.notas ?? '—';
  };

  // N° de comprobante(s) de pago (referencia de cada cobro registrado)
  const referenciasCobros = (cxc: CuentaCobrar): string => {
    const refs = (cxc.cobros ?? [])
      .filter(c => !c.anulado && c.referencia)
      .map(c => c.referencia as string);
    return refs.length > 0 ? refs.join(', ') : '—';
  };

  // ── Filtros ──
  const filtradas = useMemo(() => {
    const q = search.toLowerCase();
    return cxcList.filter(c => {
      if (c.estado === 'anulada') return false; // nunca mostrar anuladas
      if (q && !c.clienteNombre.toLowerCase().includes(q) && !c.clienteIdentificacion.includes(q)) return false;
      if (tabActivo === 'pendientes') return c.estado === 'pendiente' || c.estado === 'parcial';
      if (tabActivo === 'vencidas')   return c.estado === 'vencida';
      if (tabActivo === 'pagadas')    return c.estado === 'pagada';
      return true;
    });
  }, [cxcList, search, tabActivo]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    const activas = cxcList.filter(c => c.estado !== 'pagada' && c.estado !== 'anulada');
    return {
      totalPendiente: activas.reduce((s, c) => s + c.saldoPendiente, 0),
      countPendiente: activas.filter(c => c.estado === 'pendiente').length,
      countVencida:   cxcList.filter(c => c.estado === 'vencida').length,
      countPagada:    cxcList.filter(c => c.estado === 'pagada').length,
    };
  }, [cxcList]);

  // ── Aging ──
  const aging = useMemo(() => {
    const grupos = { corriente: 0, dias30: 0, dias60: 0, dias90: 0, masde90: 0 };
    const hoy = new Date();
    cxcList.filter(c => c.estado !== 'pagada' && c.estado !== 'anulada').forEach(c => {
      const venc = (c.fechaVencimiento as any)?.toDate?.() ?? new Date(c.fechaVencimiento);
      const dias = differenceInDays(hoy, venc);
      if (dias <= 0)        grupos.corriente += c.saldoPendiente;
      else if (dias <= 30)  grupos.dias30    += c.saldoPendiente;
      else if (dias <= 60)  grupos.dias60    += c.saldoPendiente;
      else if (dias <= 90)  grupos.dias90    += c.saldoPendiente;
      else                  grupos.masde90   += c.saldoPendiente;
    });
    return grupos;
  }, [cxcList]);

  // ── Clientes filtrados ──
  const clientesFiltrados = clienteBusq.length >= 2
    ? clientes.filter(c => c.activo &&
        (c.nombre.toLowerCase().includes(clienteBusq.toLowerCase()) ||
         c.identificacion.includes(clienteBusq))).slice(0, 5)
    : [];

  // ── Crear CxC manual ──
  const handleNuevaCxC = async () => {
    if (!user || !clienteSel) { toast.error('Selecciona un cliente'); return; }
    const monto = parseFloat(nuevoMonto);
    const dias  = parseInt(nuevosDias);
    if (isNaN(monto) || monto <= 0) { toast.error('Monto inválido'); return; }
    if (isNaN(dias)  || dias  <= 0) { toast.error('Días inválidos'); return; }
    setSavingNueva(true);
    try {
      const venc = new Date();
      venc.setDate(venc.getDate() + dias);
      await crearCuentaCobrar({
        ventaId:               '',
        clienteId:             clienteSel.id,
        clienteNombre:         clienteSel.nombre,
        clienteIdentificacion: clienteSel.identificacion,
        fechaEmision:          new Date(),
        fechaVencimiento:      venc,
        diasCredito:           dias,
        total:                 monto,
        saldoPendiente:        monto,
        ...(nuevaDesc ? { notas: nuevaDesc } : {}),
        usuarioId:             user.uid,
        usuarioNombre:         user.nombre ?? user.email ?? 'Usuario',
      });
      toast.success('Cuenta por cobrar creada');
      setNuevaOpen(false);
      setClienteSel(null);
      setClienteBusq('');
      setNuevoMonto('');
      setNuevosDias('30');
      setNuevaDesc('');
    } catch (e: any) {
      toast.error(e.message ?? 'Error al crear CxC');
    } finally {
      setSavingNueva(false);
    }
  };

  // ── Registrar cobro ──
  const abrirCobro = (cxc: CuentaCobrar) => {
    setCxcSel(cxc);
    setMontoCobro(cxc.saldoPendiente.toFixed(2));
    setFechaCobro(new Date().toISOString().split('T')[0]);
    setMetodoPago('deposito');
    setRefCobro('');
    setRetFuente('');
    setRetIVA('');
    setCuentaBancariaId(cuentasBancarias.find(c => c.activa)?.id ?? '');
    setDialogOpen(true);
  };

  const handleCobro = async () => {
    if (!cxcSel || !user) return;
    const monto = parseFloat(montoCobro);
    if (isNaN(monto) || monto <= 0) { toast.error('Monto inválido'); return; }
    if (monto > cxcSel.saldoPendiente + 0.01) {
      toast.error(`El monto supera el saldo pendiente (${currency(cxcSel.saldoPendiente)})`);
      return;
    }
    if (!fechaCobro) { toast.error('Ingresa la fecha del cobro'); return; }
    setSaving(true);
    try {
      const rf = parseFloat(retFuente) || 0;
      const ri = parseFloat(retIVA)    || 0;
      const fecha = new Date(fechaCobro + 'T12:00:00');
      const cobro: Omit<CobroCxC, 'id'> = {
        fecha,
        monto,
        metodoPago,
        ...(refCobro ? { referencia: refCobro } : {}),
        usuarioId:    user.uid,
        usuarioNombre:user.nombre ?? user.email ?? 'Usuario',
      };
      const cobroId = await registrarCobroCxC(cxcSel.id, cobro, user.uid, user.nombre ?? user.email ?? 'Usuario');

      // Asiento contable
      const asientoId = await crearAsientoCobro({
        cxcId:        cxcSel.id,
        cobroId,
        fecha,
        clienteNombre:cxcSel.clienteNombre,
        monto,
        usaBanco:     true,
        metodoCobro:  metodoPago,
        retFuente:    rf,
        retIVA:       ri,
        usuarioId:    user.uid,
        usuarioNombre:user.nombre ?? user.email ?? 'Usuario',
      });

      if (asientoId) {
        await vincularAsientoCobro(cxcSel.id, cobroId, asientoId);
        toast.success('Cobro registrado exitosamente');

        // Refleja el ingreso en Movimientos Bancarios, ya conciliado con su asiento
        if (cuentaBancariaId) {
          try {
            const movId = await registrarMovimientoBancario({
              cuentaBancariaId,
              fecha,
              descripcion: `Cobro ${cxcSel.clienteNombre}`,
              tipo: 'credito',
              monto,
              ...(refCobro ? { referencia: refCobro } : {}),
              estado: 'conciliado',
            });
            await conciliarMovimiento(movId, asientoId);
          } catch {
            toast.warning('El cobro no quedó reflejado en Movimientos Bancarios — agrégalo manualmente si lo necesitas para conciliar.');
          }
        }
      } else {
        toast.warning('El cobro se registró, pero el asiento contable NO se pudo generar. Revísalo en Contabilidad → Libro Diario.', { duration: 12000 });
      }
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al registrar cobro');
    } finally {
      setSaving(false);
    }
  };

  // ── Anular UN cobro puntual sin anular toda la CxC ──
  const handleAnularCobro = async (cxc: CuentaCobrar, cobro: CobroCxC) => {
    if (!user) return;
    if (cobro.anulado) { toast.info('Este cobro ya está anulado'); return; }
    if (!window.confirm(`¿Anular el cobro de ${currency(cobro.monto)} del ${fmtDate(cobro.fecha)}? El saldo pendiente aumentará y podrás usarlo para conciliación.`)) return;
    try {
      await anularCobro(cxc.id, cobro.id);
      if (cobro.asientoId) {
        const rev = await crearAsientoReversion({
          referenciaId: cobro.id, referenciaTipo: 'cobro_cliente',
          fecha: new Date(), concepto: `Anulación de cobro a ${cxc.clienteNombre}`,
          usuarioId: user.uid, usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
        });
        toast.success(rev.ok ? 'Cobro anulado y asiento revertido' : `Cobro anulado (${rev.advertencia ?? 'revisa el asiento manualmente'})`);
      } else {
        toast.warning('Cobro anulado. Este cobro es anterior a esta función — revisa manualmente su asiento en Contabilidad → Libro Diario.', { duration: 10000 });
      }
      setDetailCxc(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al anular el cobro');
    }
  };

  // ── Editar fecha/referencia de UN cobro ya registrado ──
  const abrirEditarCobro = (cobro: CobroCxC) => {
    setEditCobro(cobro);
    setEditFecha(format((cobro.fecha as any)?.toDate?.() ?? new Date(cobro.fecha), 'yyyy-MM-dd'));
    setEditReferencia(cobro.referencia ?? '');
  };

  const handleGuardarEdicionCobro = async () => {
    if (!editCobro || !detailCxc || !user) return;
    if (!editFecha) { toast.error('Ingresa la fecha'); return; }
    setSavingEdit(true);
    try {
      const nuevaFecha = new Date(editFecha + 'T12:00:00');
      await editarCobro(detailCxc.id, editCobro.id, { fecha: nuevaFecha, referencia: editReferencia.trim() });

      if (editCobro.asientoId) {
        try {
          await editarAsiento(editCobro.asientoId, { fecha: nuevaFecha },
            user.uid, user.nombre ?? user.email ?? 'Usuario');
        } catch (e: any) {
          toast.warning(`Cobro actualizado, pero el asiento contable no se pudo actualizar: ${e.message}`, { duration: 10000 });
          setEditCobro(null);
          return;
        }
      }
      toast.success('Cobro actualizado');
      setEditCobro(null);
      setDetailCxc(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al editar el cobro');
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Exportar ──
  const exportar = () => {
    const rows = filtradas.map(c => ({
      Cliente:         c.clienteNombre,
      Comprobante:     numeroComprobante(c),
      ComprobantePago: referenciasCobros(c),
      Identificacion:  c.clienteIdentificacion,
      FechaEmision:    fmtDate(c.fechaEmision),
      FechaVencimiento:fmtDate(c.fechaVencimiento),
      Total:           c.total,
      SaldoPendiente:  c.saldoPendiente,
      Estado:          c.estado,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'CxC');
    XLSX.writeFile(wb, `cuentas_cobrar_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cuentas por Cobrar"
        description="Gestión de créditos a clientes, cobros y aging"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setNuevaOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva CxC
            </Button>
            <Button variant="outline" size="sm" onClick={exportar}>
              <Download className="mr-2 h-4 w-4" /> Exportar
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Saldo total pendiente', value: currency(kpis.totalPendiente), icon: DollarSign, color: 'text-slate-900', bg: 'bg-blue-50' },
          { label: 'Facturas pendientes',   value: kpis.countPendiente,           icon: Clock,       color: 'text-blue-600',  bg: 'bg-blue-50' },
          { label: 'Facturas vencidas',     value: kpis.countVencida,             icon: AlertTriangle,color: 'text-red-600',   bg: 'bg-red-50' },
          { label: 'Cobradas este mes',     value: kpis.countPagada,              icon: CheckCircle,  color: 'text-green-600', bg: 'bg-green-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border p-4 flex items-center gap-3">
            <div className={`${bg} p-2.5 rounded-lg`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div>
              <p className="text-xs text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Aging */}
      <div className="bg-white rounded-xl border p-5">
        <p className="font-semibold text-slate-700 mb-4">Aging de saldos (días vencidos)</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Corriente',  value: aging.corriente, color: 'text-green-600'  },
            { label: '1-30 días',  value: aging.dias30,    color: 'text-yellow-600' },
            { label: '31-60 días', value: aging.dias60,    color: 'text-orange-600' },
            { label: '61-90 días', value: aging.dias90,    color: 'text-red-500'    },
            { label: '> 90 días',  value: aging.masde90,   color: 'text-red-700'    },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`text-base font-bold ${color}`}>{currency(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex flex-wrap gap-3 items-center justify-between">
          <Tabs value={tabActivo} onValueChange={setTabActivo}>
            <TabsList>
              <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
              <TabsTrigger value="vencidas">Vencidas</TabsTrigger>
              <TabsTrigger value="pagadas">Cobradas</TabsTrigger>
              <TabsTrigger value="todas">Todas</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Buscar cliente..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 w-full sm:w-52 h-9 text-sm" />
          </div>
        </div>

        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Cliente</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>N° Comp. Pago</TableHead>
              <TableHead>Emisión</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center">Días</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 10 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}</TableRow>
              ))
            ) : filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-slate-400">
                  No hay registros en esta categoría.
                </TableCell>
              </TableRow>
            ) : filtradas.map(c => {
              const venc = (c.fechaVencimiento as any)?.toDate?.() ?? new Date(c.fechaVencimiento);
              const dias = differenceInDays(new Date(), venc);
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{c.clienteNombre}</p>
                    <p className="text-xs text-slate-400">{c.clienteIdentificacion}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{numeroComprobante(c)}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{referenciasCobros(c)}</TableCell>
                  <TableCell className="text-sm text-slate-500">{fmtDate(c.fechaEmision)}</TableCell>
                  <TableCell className="text-sm text-slate-500">{fmtDate(c.fechaVencimiento)}</TableCell>
                  <TableCell className="text-right font-semibold">{currency(c.total)}</TableCell>
                  <TableCell className="text-right">
                    <span className={`font-bold text-sm ${c.saldoPendiente > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {currency(c.saldoPendiente)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_ESTADO[c.estado] ?? ''}`}>
                      {c.estado}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs font-medium ${dias > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {dias > 0 ? `+${dias}d` : dias === 0 ? 'Hoy' : `${-dias}d`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-blue-600"
                        title="Ver detalle / historial de cobros" onClick={() => setDetailCxc(c)}>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      {c.estado !== 'pagada' && (
                        <Button size="sm" variant="outline" onClick={() => abrirCobro(c)}>
                          Cobrar
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

      {/* Dialog nueva CxC manual */}
      <Dialog open={nuevaOpen} onOpenChange={setNuevaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Cuenta por Cobrar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Buscar cliente */}
            <div>
              <Label>Cliente *</Label>
              {clienteSel ? (
                <div className="mt-1 flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="font-medium text-sm">{clienteSel.nombre}</p>
                    <p className="text-xs text-slate-400">{clienteSel.identificacion}</p>
                  </div>
                  <button onClick={() => { setClienteSel(null); setClienteBusq(''); }}>
                    <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                  </button>
                </div>
              ) : (
                <div className="mt-1 relative">
                  <Input
                    placeholder="Buscar por nombre o cédula/RUC..."
                    value={clienteBusq}
                    onChange={e => setClienteBusq(e.target.value)}
                  />
                  {clientesFiltrados.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border rounded-lg shadow overflow-hidden">
                      {clientesFiltrados.map(c => (
                        <button key={c.id}
                          onClick={() => { setClienteSel(c); setClienteBusq(''); }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0 text-sm">
                          <p className="font-medium">{c.nombre}</p>
                          <p className="text-xs text-slate-400">{c.identificacion}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Monto ($) *</Label>
                <Input type="number" step="0.01" className="mt-1"
                  value={nuevoMonto} onChange={e => setNuevoMonto(e.target.value)} />
              </div>
              <div>
                <Label>Días de crédito *</Label>
                <Input type="number" min="1" className="mt-1"
                  value={nuevosDias} onChange={e => setNuevosDias(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Descripción / Referencia</Label>
              <Input className="mt-1" placeholder="Ej: Factura 001-001-0000005"
                value={nuevaDesc} onChange={e => setNuevaDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNuevaOpen(false)}>Cancelar</Button>
            <Button onClick={handleNuevaCxC} disabled={savingNueva}>
              {savingNueva ? 'Guardando…' : 'Crear CxC'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog cobro */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar cobro</DialogTitle>
          </DialogHeader>
          {cxcSel && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="font-medium">{cxcSel.clienteNombre}</p>
                <p className="text-slate-500 text-xs mt-1">
                  Saldo pendiente: <strong className="text-slate-800">{currency(cxcSel.saldoPendiente)}</strong>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Fecha de cobro *</Label>
                  <Input type="date" value={fechaCobro} max={new Date().toISOString().split('T')[0]}
                    onChange={e => setFechaCobro(e.target.value)} className="mt-1" />
                </div>
                <div className="col-span-2">
                  <Label>Monto a cobrar *</Label>
                  <Input type="number" step="0.01" value={montoCobro}
                    onChange={e => setMontoCobro(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Método de pago</Label>
                  <Select value={metodoPago} onValueChange={v => setMetodoPago(v as MetodoPago)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposito">Papeleta de depósito</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Referencia / N° cheque</Label>
                  <Input value={refCobro} onChange={e => setRefCobro(e.target.value)}
                    placeholder="Opcional" className="mt-1" />
                </div>
                <div className="col-span-2">
                  <Label>Cuenta bancaria que recibe el dinero</Label>
                  <Select value={cuentaBancariaId} onValueChange={setCuentaBancariaId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Sin registrar en Movimientos Bancarios" />
                    </SelectTrigger>
                    <SelectContent>
                      {cuentasBancarias.filter(c => c.activa).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.banco} — {c.numeroCuenta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-400 mt-1">
                    Se registra ya conciliado en Movimientos Bancarios / Conciliación Bancaria.
                  </p>
                </div>
                <div>
                  <Label>Ret. Fuente recibida ($)</Label>
                  <Input type="number" step="0.01" value={retFuente}
                    onChange={e => setRetFuente(e.target.value)}
                    placeholder="0.00" className="mt-1" />
                </div>
                <div>
                  <Label>Ret. IVA recibida ($)</Label>
                  <Input type="number" step="0.01" value={retIVA}
                    onChange={e => setRetIVA(e.target.value)}
                    placeholder="0.00" className="mt-1" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCobro} disabled={saving}>
              {saving ? 'Guardando…' : 'Registrar cobro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog detalle / historial de cobros */}
      <Dialog open={!!detailCxc} onOpenChange={() => setDetailCxc(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Cuenta por Cobrar</DialogTitle>
          </DialogHeader>
          {detailCxc && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-slate-400">Cliente</p><p className="font-medium">{detailCxc.clienteNombre}</p></div>
                <div><p className="text-xs text-slate-400">Identificación</p><p className="font-medium">{detailCxc.clienteIdentificacion}</p></div>
                <div><p className="text-xs text-slate-400">Comprobante</p><p className="font-mono text-xs font-medium">{numeroComprobante(detailCxc)}</p></div>
                <div><p className="text-xs text-slate-400">Fecha emisión</p><p className="font-medium">{fmtDate(detailCxc.fechaEmision)}</p></div>
                <div><p className="text-xs text-slate-400">Vencimiento</p><p className="font-medium">{fmtDate(detailCxc.fechaVencimiento)}</p></div>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total</span>
                <span className="font-bold">{currency(detailCxc.total)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-red-600">
                <span>Saldo pendiente</span>
                <span>{currency(detailCxc.saldoPendiente)}</span>
              </div>
              {(detailCxc.cobros?.length ?? 0) > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2">Historial de cobros</p>
                    <div className="space-y-2">
                      {detailCxc.cobros.map((c, i) => (
                        <div key={i} className={`flex justify-between items-center text-sm py-1.5 border-b last:border-0 ${c.anulado ? 'opacity-50' : ''}`}>
                          <div>
                            <p className={`font-medium ${c.anulado ? 'line-through' : ''}`}>{currency(c.monto)}</p>
                            <p className="text-xs text-slate-400">
                              {c.metodoPago} {c.referencia ? `— ${c.referencia}` : ''}
                              {c.anulado ? ' — anulado' : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-slate-400">{fmtDate(c.fecha)}</p>
                            {!c.anulado && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600"
                                  title="Editar fecha / referencia" onClick={() => abrirEditarCobro(c)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600"
                                  title="Anular este cobro" onClick={() => handleAnularCobro(detailCxc, c)}>
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {(detailCxc.cobros?.length ?? 0) === 0 && (
                <p className="text-xs text-slate-400 text-center py-2">Aún no se han registrado cobros.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog editar fecha/referencia de un cobro */}
      <Dialog open={!!editCobro} onOpenChange={(o) => !o && setEditCobro(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Cobro</DialogTitle>
          </DialogHeader>
          {editCobro && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                Monto: <strong className="text-slate-800">{currency(editCobro.monto)}</strong> — {editCobro.metodoPago}
              </p>
              <div>
                <Label>Fecha de cobro *</Label>
                <Input type="date" value={editFecha} max={new Date().toISOString().split('T')[0]}
                  onChange={e => setEditFecha(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Referencia / N° comprobante</Label>
                <Input value={editReferencia} onChange={e => setEditReferencia(e.target.value)}
                  placeholder="Opcional" className="mt-1" />
              </div>
              {editCobro.asientoId && (
                <p className="text-xs text-slate-400">
                  El asiento contable vinculado se actualizará con la nueva fecha automáticamente.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCobro(null)}>Cancelar</Button>
            <Button onClick={handleGuardarEdicionCobro} disabled={savingEdit}>
              {savingEdit ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtDate(d: any): string {
  try {
    const date = d?.toDate?.() ?? new Date(d);
    return format(date, 'dd/MM/yyyy');
  } catch { return '—'; }
}
