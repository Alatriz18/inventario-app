'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Search, Trash2, Plus, Minus, ShoppingCart, User,
  Banknote, CreditCard, ArrowRightLeft, CheckCircle, UserPlus, Clock, CalendarDays, Printer,
} from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import QuickCreateCliente from '@/components/shared/QuickCreateCliente';
import { crearAsientoVenta } from '@/lib/contabilidad/motor-asientos';
import { Producto, Cliente, MetodoPago, ItemVenta } from '@/types';
import { subscribeToProductos } from '@/lib/firebase/productos';
import { subscribeToClientes }  from '@/lib/firebase/clientes';
import { createVenta, getVentaById } from '@/lib/firebase/ventas';
import { getConfigSRI }         from '@/lib/firebase/config-sri';
import { descargarTicket }      from '@/lib/pdf/ticket-venta';
import { tieneAccesoAccion }    from '@/lib/permisos';
import { useAuth }              from '@/context/AuthContext';
import Link from 'next/link';

// ─── Consumidor Final por defecto ────────────────────────────────────────────
const CONSUMIDOR_FINAL: Cliente = {
  id:                 'consumidor_final',
  tipoIdentificacion: 'consumidor_final',
  identificacion:     '9999999999999',
  nombre:             'CONSUMIDOR FINAL',
  tipoCliente:        'local',
  tipoPago:           'contado',
  pais:               'Ecuador',
  codigoPais:         'EC',
  activo:             true,
  createdAt:          new Date(),
};

interface CartItem extends ItemVenta {
  precioCompraRef: number;
}

function currency(v: number) {
  return `$${v.toFixed(2)}`;
}

export default function POSPage() {
  const { user } = useAuth();
  const router   = useRouter();
  const verCostos = user ? tieneAccesoAccion(user.rol, 'ver_costos') : false;
  const verGanancias = user ? tieneAccesoAccion(user.rol, 'ver_ganancias') : false;

  const [productos,      setProductos]      = useState<Producto[]>([]);
  const [clientes,       setClientes]       = useState<Cliente[]>([]);
  const [cart,           setCart]           = useState<CartItem[]>([]);
  const [search,         setSearch]         = useState('');
  const [cliente,        setCliente]        = useState<Cliente>(CONSUMIDOR_FINAL);
  const [metodoPago,     setMetodoPago]     = useState<MetodoPago>('efectivo');
  const [descuento,      setDescuento]      = useState(0);
  const [montoPagado,    setMontoPagado]    = useState('');
  const [diasCredito,    setDiasCredito]    = useState(30);
  const [saving,         setSaving]         = useState(false);
  const [successId,      setSuccessId]      = useState<string | null>(null);
  const [esCxC,          setEsCxC]          = useState(false);
  const [searchCliente,  setSearchCliente]  = useState('');
  const [showClientes,   setShowClientes]   = useState(false);
  const [quickCliente,   setQuickCliente]   = useState(false); // ← dentro del componente
  const [fechaVenta,     setFechaVenta]     = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const u1 = subscribeToProductos(setProductos);
    const u2 = subscribeToClientes(setClientes);
    return () => { u1(); u2(); };
  }, []);

  // ─── Cálculos ─────────────────────────────────────────────────────────────
  const subtotalSinDescuento = cart.reduce((s, i) => s + i.subtotal, 0);
  const montoDescuento       = subtotalSinDescuento * (descuento / 100);
  const total                = subtotalSinDescuento - montoDescuento;
  const gananciaTotal        = cart.reduce((s, i) => s + i.ganancia, 0);
  const cambio               = metodoPago === 'efectivo'
    ? Math.max(0, Number(montoPagado) - total) : 0;

  // ─── Buscar productos ─────────────────────────────────────────────────────
  const productosFiltrados = search.length >= 1
    ? productos.filter(p =>
        p.activo && p.stockActual > 0 && (
          p.nombre.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase())
        )
      ).slice(0, 6)
    : [];

  const clientesFiltrados = searchCliente.length >= 1
    ? clientes.filter(c =>
        c.activo && (
          c.nombre.toLowerCase().includes(searchCliente.toLowerCase()) ||
          c.identificacion.includes(searchCliente)
        )
      ).slice(0, 5)
    : [];

  // ─── Agregar al carrito ───────────────────────────────────────────────────
  const addToCart = (prod: Producto) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productoId === prod.id);
      if (idx >= 0) {
        const updated = [...prev];
        const item    = updated[idx];
        const newQty  = item.cantidad + 1;
        if (newQty > prod.stockActual) {
          toast.error(`Stock máximo: ${prod.stockActual}`);
          return prev;
        }
        updated[idx] = {
          ...item,
          cantidad: newQty,
          subtotal: newQty * item.precioUnitario * (1 - item.descuento / 100),
          ganancia: (item.precioUnitario * (1 - item.descuento / 100) - item.precioCompraRef) * newQty,
        };
        return updated;
      }
      return [...prev, {
        productoId:      prod.id,
        sku:             prod.sku,
        nombre:          prod.nombre,
        cantidad:        1,
        precioUnitario:  prod.precioVenta,
        precioCompra:    prod.precioCompra,
        precioCompraRef: prod.precioCompra,
        descuento:       0,
        subtotal:        prod.precioVenta,
        ganancia:        prod.precioVenta - prod.precioCompra,
      }];
    });
    setSearch('');
  };

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      const item    = updated[idx];
      const prod    = productos.find(p => p.id === item.productoId);
      const newQty  = item.cantidad + delta;
      if (newQty < 1) return prev;
      if (prod && newQty > prod.stockActual) {
        toast.error(`Stock máximo: ${prod.stockActual}`);
        return prev;
      }
      const precioFinal = item.precioUnitario * (1 - item.descuento / 100);
      updated[idx] = {
        ...item,
        cantidad: newQty,
        subtotal: newQty * precioFinal,
        ganancia: (precioFinal - item.precioCompraRef) * newQty,
      };
      return updated;
    });
  };

  const removeFromCart = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDescuentoItem = (idx: number, pct: number) => {
    setCart(prev => {
      const updated = [...prev];
      const item    = updated[idx];
      const d       = Math.min(100, Math.max(0, pct));
      const precioFinal = item.precioUnitario * (1 - d / 100);
      updated[idx] = {
        ...item,
        descuento: d,
        subtotal:  item.cantidad * precioFinal,
        ganancia:  (precioFinal - item.precioCompraRef) * item.cantidad,
      };
      return updated;
    });
  };

  // ─── Confirmar venta ──────────────────────────────────────────────────────
  const confirmarVenta = async () => {
    if (!user) return;
    if (cart.length === 0) { toast.error('El carrito está vacío'); return; }
    if (metodoPago === 'efectivo' && Number(montoPagado) < total) {
      toast.error('El monto pagado es insuficiente'); return;
    }
    if (metodoPago === 'credito' && cliente.id === 'consumidor_final') {
      toast.error('Selecciona un cliente identificado para ventas a crédito'); return;
    }

    setSaving(true);
    try {
      const items: ItemVenta[] = cart.map(i => ({
        productoId:     i.productoId,
        sku:            i.sku,
        nombre:         i.nombre,
        cantidad:       i.cantidad,
        precioUnitario: i.precioUnitario,
        precioCompra:   i.precioCompraRef,
        descuento:      i.descuento,
        subtotal:       i.subtotal,
        ganancia:       i.ganancia,
      }));

      const fechaSeleccionada = new Date(fechaVenta + 'T12:00:00');
      const ventaId = await createVenta(
        {
          fecha:                 fechaSeleccionada,
          clienteId:             cliente.id,
          clienteNombre:         cliente.nombre,
          clienteIdentificacion: cliente.identificacion,
          items,
          subtotal:              subtotalSinDescuento,
          descuentoGlobal:       descuento,
          total,
          gananciaTotal,
          metodoPago,
          estado:                'completada',
          esCxC:                 metodoPago === 'credito' || undefined,
          diasCredito:           metodoPago === 'credito' ? diasCredito : undefined,
          usuarioId:             user.uid,
          usuarioNombre:         user.nombre,
        },
        user.uid,
        user.nombre
      );

      setSuccessId(ventaId);

      // ── Motor contable automático (background, no bloquea) ──
      const costoVenta = cart.reduce(
        (s, item) => s + item.precioCompraRef * item.cantidad, 0
      );
      const baseTotal = total / 1.15;
      const ivaTotal  = total - baseTotal;

      crearAsientoVenta({
        ventaId,
        fecha:         fechaSeleccionada,
        clienteNombre: cliente.nombre,
        tieneIVA:      true,
        subtotal:      parseFloat(baseTotal.toFixed(2)),
        iva:           parseFloat(ivaTotal.toFixed(2)),
        total,
        costoVenta:    parseFloat(costoVenta.toFixed(2)),
        esCxC:         metodoPago === 'credito',
        usuarioId:     user.uid,
        usuarioNombre: user.nombre,
      }).catch(() => {});

      setEsCxC(metodoPago === 'credito');
      // Reset
      setCart([]);
      setCliente(CONSUMIDOR_FINAL);
      setDescuento(0);
      setMontoPagado('');
      setMetodoPago('efectivo');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar la venta');
    } finally {
      setSaving(false);
    }
  };

  const margenColor = gananciaTotal >= 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">

      {/* ─── PANEL IZQUIERDO — Productos y carrito ─── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar producto por nombre o SKU..."
            className="pl-9 h-11 text-base"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {productosFiltrados.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border rounded-xl shadow-lg overflow-hidden">
              {productosFiltrados.map(p => (
                <button key={p.id} type="button"
                  onClick={() => addToCart(p)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 border-b last:border-0">
                  <div className="text-left">
                    <p className="font-medium text-sm">{p.nombre}</p>
                    <p className="text-xs text-slate-400">{p.sku} — Stock: {p.stockActual}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-800">{currency(p.precioVenta)}</p>
                    {verCostos && <p className="text-xs text-slate-400">compra: {currency(p.precioCompra)}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Carrito */}
        <div className="flex-1 bg-white rounded-xl border overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-slate-500" />
            <span className="font-semibold text-sm text-slate-700">
              Carrito — {cart.length} producto(s)
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
              <ShoppingCart className="h-12 w-12 mb-2" />
              <p className="text-sm">Busca y selecciona productos</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-slate-500">Producto</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-500 w-28">Cantidad</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-500 w-24">Precio</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-500 w-20">Desc%</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-500 w-24">Subtotal</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => (
                    <tr key={idx} className="border-b hover:bg-slate-50/50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{item.nombre}</p>
                        <p className="text-xs text-slate-400">{item.sku}</p>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => updateQty(idx, -1)}
                            className="h-6 w-6 rounded border flex items-center justify-center hover:bg-slate-100">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center font-semibold">{item.cantidad}</span>
                          <button onClick={() => updateQty(idx, 1)}
                            className="h-6 w-6 rounded border flex items-center justify-center hover:bg-slate-100">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right font-medium">
                        {currency(item.precioUnitario)}
                      </td>
                      <td className="px-2 py-2.5">
                        <Input
                          type="number" min="0" max="100"
                          value={item.descuento}
                          onChange={e => updateDescuentoItem(idx, Number(e.target.value))}
                          className="h-7 text-center text-xs w-16 mx-auto"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold">
                        {currency(item.subtotal)}
                      </td>
                      <td className="pr-2">
                        <button onClick={() => removeFromCart(idx)}
                          className="text-slate-300 hover:text-red-500 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {cart.length > 0 && (
            <div className="px-4 py-2 border-t bg-slate-50 flex justify-between items-center">
              {verGanancias ? (
                <span className="text-xs text-slate-400">
                  Ganancia estimada:
                  <span className={`ml-1 font-semibold ${margenColor}`}>
                    {currency(gananciaTotal - gananciaTotal * descuento / 100)}
                  </span>
                </span>
              ) : <span />}
              <button onClick={() => setCart([])}
                className="text-xs text-red-400 hover:text-red-600 underline">
                Vaciar carrito
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── PANEL DERECHO — Cobro ─── */}
      <div className="w-80 flex flex-col gap-3 shrink-0">

        {/* Cliente */}
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-400" />
              <Label className="text-sm font-semibold">Cliente</Label>
            </div>
            <button
              onClick={() => setQuickCliente(true)}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <UserPlus className="h-3 w-3" /> Nuevo
            </button>
          </div>
          <div
            className="border rounded-lg px-3 py-2 cursor-pointer hover:border-slate-400 transition-colors"
            onClick={() => setShowClientes(true)}
          >
            <p className="font-medium text-sm">{cliente.nombre}</p>
            <p className="text-xs text-slate-400">{cliente.identificacion}</p>
          </div>
          {cliente.id !== 'consumidor_final' && (
            <button onClick={() => setCliente(CONSUMIDOR_FINAL)}
              className="text-xs text-slate-400 hover:text-slate-600 underline">
              Cambiar a consumidor final
            </button>
          )}
        </div>

        {/* Método de pago */}
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <Label className="text-sm font-semibold">Método de pago</Label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'efectivo',      label: 'Efectivo',      icon: Banknote },
              { value: 'tarjeta',       label: 'Tarjeta',       icon: CreditCard },
              { value: 'transferencia', label: 'Transfer.',     icon: ArrowRightLeft },
              { value: 'credito',       label: 'Crédito',       icon: Clock },
            ] as const).map(({ value, label, icon: Icon }) => (
              <button key={value}
                onClick={() => setMetodoPago(value)}
                className={`flex items-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-colors ${
                  metodoPago === value
                    ? value === 'credito'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-slate-900 text-white border-slate-900'
                    : 'hover:bg-slate-50 text-slate-600'
                }`}>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>

          {metodoPago === 'credito' && (
            <div className="space-y-1.5">
              <Label className="text-xs text-amber-700 font-semibold">Días de crédito</Label>
              <div className="flex gap-1.5">
                {[15, 30, 60, 90].map(d => (
                  <button key={d}
                    onClick={() => setDiasCredito(d)}
                    className={`flex-1 py-1.5 rounded border text-xs font-medium transition-colors ${
                      diasCredito === d ? 'bg-amber-600 text-white border-amber-600' : 'hover:bg-amber-50 text-slate-600'
                    }`}>
                    {d}d
                  </button>
                ))}
              </div>
              {cliente.id === 'consumidor_final' && (
                <p className="text-xs text-red-500">Selecciona un cliente identificado</p>
              )}
            </div>
          )}

          {metodoPago === 'efectivo' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Monto recibido</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input
                  type="number" step="0.01" min="0"
                  placeholder="0.00"
                  className="pl-7"
                  value={montoPagado}
                  onChange={e => setMontoPagado(e.target.value)}
                />
              </div>
              {Number(montoPagado) > 0 && (
                <div className={`flex justify-between text-sm font-semibold px-1 ${cambio >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span>Cambio:</span>
                  <span>{currency(cambio)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fecha de venta */}
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <Label className="text-sm font-semibold">Fecha de venta</Label>
          </div>
          <Input
            type="date"
            value={fechaVenta}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => setFechaVenta(e.target.value)}
            className="text-center"
          />
          {fechaVenta !== new Date().toISOString().split('T')[0] && (
            <p className="text-xs text-amber-600 font-medium">
              Registrando con fecha anterior: {new Date(fechaVenta + 'T12:00:00').toLocaleDateString('es-EC')}
            </p>
          )}
        </div>

        {/* Descuento global */}
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <Label className="text-sm font-semibold">Descuento global</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number" min="0" max="100" step="0.5"
              value={descuento}
              onChange={e => setDescuento(Number(e.target.value))}
              className="text-center"
            />
            <span className="text-slate-500 font-medium">%</span>
          </div>
        </div>

        {/* Totales */}
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <div className="flex justify-between text-sm text-slate-500">
            <span>Subtotal</span>
            <span>{currency(subtotalSinDescuento)}</span>
          </div>
          {descuento > 0 && (
            <div className="flex justify-between text-sm text-amber-600">
              <span>Descuento ({descuento}%)</span>
              <span>−{currency(montoDescuento)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-lg">
            <span>TOTAL</span>
            <span>{currency(total)}</span>
          </div>
        </div>

        {/* Botón confirmar */}
        <Button
          className={`h-14 text-base font-bold ${metodoPago === 'credito' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
          disabled={saving || cart.length === 0}
          onClick={confirmarVenta}
        >
          {saving
            ? 'Procesando...'
            : metodoPago === 'credito'
              ? `Venta a crédito ${currency(total)}`
              : `Cobrar ${currency(total)}`}
        </Button>
      </div>

      {/* ─── MODAL SELECCIONAR CLIENTE ─── */}
      <Dialog open={showClientes} onOpenChange={setShowClientes}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Seleccionar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar por nombre o identificación..."
              value={searchCliente}
              onChange={e => setSearchCliente(e.target.value)}
              autoFocus
            />
            <button
              onClick={() => { setCliente(CONSUMIDOR_FINAL); setShowClientes(false); setSearchCliente(''); }}
              className="w-full text-left px-4 py-3 rounded-lg border-2 border-dashed border-slate-200 hover:border-slate-400 transition-colors">
              <p className="font-medium text-sm">CONSUMIDOR FINAL</p>
              <p className="text-xs text-slate-400">9999999999999</p>
            </button>
            {clientesFiltrados.length > 0 && (
              <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                {clientesFiltrados.map(c => (
                  <button key={c.id}
                    onClick={() => { setCliente(c); setShowClientes(false); setSearchCliente(''); }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b last:border-0">
                    <p className="font-medium text-sm">{c.nombre}</p>
                    <p className="text-xs text-slate-400">{c.tipoIdentificacion.toUpperCase()} — {c.identificacion}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL VENTA EXITOSA ─── */}
      <Dialog open={!!successId} onOpenChange={() => setSuccessId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="sr-only">Venta registrada</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <CheckCircle className={`h-14 w-14 ${esCxC ? 'text-amber-500' : 'text-green-500'}`} />
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-900">
                {esCxC ? '¡Venta a crédito registrada!' : '¡Venta completada!'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {esCxC
                  ? `Vence en ${diasCredito} días — registrada en Cuentas por Cobrar.`
                  : 'Stock actualizado correctamente.'}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 w-full space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{esCxC ? 'Total a cobrar' : 'Total cobrado'}</span>
                <span className="font-bold">{currency(total)}</span>
              </div>
              {!esCxC && metodoPago === 'efectivo' && Number(montoPagado) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Cambio</span>
                  <span className="font-bold">{currency(cambio)}</span>
                </div>
              )}
              {esCxC && (
                <Link href="/cuentas-por-cobrar"
                  onClick={() => setSuccessId(null)}
                  className="block w-full text-center py-2 mt-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
                  Ver Cuentas por Cobrar →
                </Link>
              )}
            </div>

            <div className="w-full space-y-2">
              {/* Ticket para impresora Zebra */}
              <Button
                variant="outline"
                className="w-full h-10 text-sm font-semibold gap-2"
                onClick={async () => {
                  if (!successId) return;
                  try {
                    const [ventaData, config] = await Promise.all([
                      getVentaById(successId),
                      getConfigSRI(),
                    ]);
                    if (!ventaData) { toast.error('Venta no encontrada'); return; }
                    descargarTicket({
                      nombreNegocio: config?.nombreComercial || config?.razonSocial || 'Mi Negocio',
                      ruc:           config?.ruc || '',
                      direccion:     config?.direccionMatriz || '',
                      venta:         ventaData,
                    });
                    toast.success('Ticket descargado');
                  } catch { toast.error('Error al generar ticket'); }
                }}
              >
                <Printer className="h-4 w-4" />
                Imprimir Ticket (Zebra)
              </Button>

              <p className="text-xs text-slate-400 text-center font-medium">¿Emitir comprobante SRI?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="text-xs h-9"
                  onClick={() => {
                    router.push(`/facturacion/emitir?ventaId=${successId}&tipo=factura`);
                    setSuccessId(null);
                  }}
                >
                  📄 Factura
                </Button>
                <Button
                  variant="outline"
                  className="text-xs h-9"
                  onClick={() => {
                    router.push(`/facturacion/emitir?ventaId=${successId}&tipo=nota_venta`);
                    setSuccessId(null);
                  }}
                >
                  🧾 Nota de Venta
                </Button>
              </div>
              <Button className="w-full" onClick={() => setSuccessId(null)}>
                Nueva Venta
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── QUICK CREATE CLIENTE ─── */}
      <QuickCreateCliente
        open={quickCliente}
        onClose={() => setQuickCliente(false)}
        onCreated={(c) => {
          setCliente({
            id:                 'nuevo',
            tipoIdentificacion: c.tipoIdentificacion,
            identificacion:     c.identificacion,
            nombre:             c.nombre,
            tipoCliente:        'local',
            tipoPago:           'contado',
            pais:               'Ecuador',
            codigoPais:         'EC',
            activo:             true,
            createdAt:          new Date(),
          });
          setQuickCliente(false);
        }}
      />
    </div>
  );
}