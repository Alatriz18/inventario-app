'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Send, FileX, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Textarea }from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { NotaCredito, MotivoNotaCredito, ItemNotaCredito, Venta } from '@/types';
import { subscribeToNotasCredito, createNotaCredito } from '@/lib/firebase/notas-credito';
import { subscribeToComprobantes, Comprobante }         from '@/lib/firebase/comprobantes';
import { getVentaById }                                 from '@/lib/firebase/ventas';
import { getConfigSRI, incrementarSecuencial }          from '@/lib/firebase/config-sri';
import { generarClaveAcceso }                           from '@/lib/sri/clave-acceso';
import { generarXMLNotaCredito }                        from '@/lib/sri/generador-nota-credito';
import { crearAsientoNotaCredito }                      from '@/lib/contabilidad/motor-asientos';
import { useAuth }                                      from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;

const MOTIVOS: { value: MotivoNotaCredito; label: string }[] = [
  { value: 'devolucion',  label: 'Devolución de mercadería' },
  { value: 'descuento',   label: 'Descuento comercial' },
  { value: 'error',       label: 'Error en facturación' },
  { value: 'anulacion',   label: 'Anulación de factura' },
];

const BADGE_ESTADO: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-700',
  autorizada: 'bg-green-100 text-green-700',
  rechazada:  'bg-red-100 text-red-700',
};

interface ItemNC {
  productoId:   string;
  sku:          string;
  nombre:       string;
  cantidadOrig: number;
  cantidadNC:   number;
  precioUnitario: number;
  tieneIVA:     boolean;
  subtotal:     number;
}

export default function NotasCreditoPage() {
  const { user } = useAuth();
  const [notas,        setNotas]        = useState<NotaCredito[]>([]);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  // Dialog crear
  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [compSel,       setCompSel]       = useState('');
  const [motivo,        setMotivo]        = useState<MotivoNotaCredito>('devolucion');
  const [descripMotivo, setDescripMotivo] = useState('');
  const [itemsNC,       setItemsNC]       = useState<ItemNC[]>([]);
  const [loadingVenta,  setLoadingVenta]  = useState(false);
  const [saving,        setSaving]        = useState(false);

  useEffect(() => {
    const u1 = subscribeToNotasCredito(d => { setNotas(d); setLoading(false); });
    const u2 = subscribeToComprobantes(setComprobantes);
    return () => { u1(); u2(); };
  }, []);

  const compAutorizados = useMemo(
    () => comprobantes.filter(c => c.estado === 'autorizado' && c.tipo === 'factura'),
    [comprobantes]
  );

  const compSelObj = useMemo(
    () => comprobantes.find(c => c.id === compSel) ?? null,
    [comprobantes, compSel]
  );

  // Al seleccionar un comprobante, cargar los ítems de la venta
  const handleSelectComp = async (id: string) => {
    setCompSel(id);
    setItemsNC([]);
    if (!id) return;
    const comp = comprobantes.find(c => c.id === id);
    if (!comp?.ventaId) return;
    setLoadingVenta(true);
    try {
      const venta = await getVentaById(comp.ventaId);
      if (!venta) return;
      setItemsNC(venta.items.map(i => ({
        productoId:     i.productoId,
        sku:            i.sku,
        nombre:         i.nombre,
        cantidadOrig:   i.cantidad,
        cantidadNC:     i.cantidad,
        precioUnitario: i.precioUnitario,
        tieneIVA:       true,
        subtotal:       i.subtotal,
      })));
    } catch { toast.error('No se pudieron cargar los ítems'); }
    finally { setLoadingVenta(false); }
  };

  const updateCantidad = (idx: number, val: number) => {
    setItemsNC(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const cant = Math.max(0, Math.min(it.cantidadOrig, val));
      return { ...it, cantidadNC: cant, subtotal: cant * it.precioUnitario };
    }));
  };

  const totales = useMemo(() => {
    const subtotal = itemsNC.reduce((s, i) => s + i.subtotal, 0);
    const iva      = itemsNC.filter(i => i.tieneIVA).reduce((s, i) => s + i.subtotal * 0.15, 0);
    return { subtotal, iva, total: subtotal + iva };
  }, [itemsNC]);

  const resetDialog = () => {
    setCompSel('');
    setMotivo('devolucion');
    setDescripMotivo('');
    setItemsNC([]);
  };

  const handleEmitir = async () => {
    if (!user) return;
    if (!compSel)             { toast.error('Selecciona el comprobante origen'); return; }
    if (!descripMotivo.trim()) { toast.error('Ingresa la descripción del motivo'); return; }
    if (totales.total <= 0)    { toast.error('El monto de la NC no puede ser $0.00'); return; }

    const comp = comprobantes.find(c => c.id === compSel);
    if (!comp) return;

    setSaving(true);
    try {
      const configSRI = await getConfigSRI();
      if (!configSRI) throw new Error('Configure primero los datos SRI');

      const secuencial   = await incrementarSecuencial('secuencialNotaCredito');
      const fechaEmision = new Date();
      const fechaOrigen  = (comp.fechaEmision as any)?.toDate?.() ?? new Date(comp.fechaEmision);

      const claveAcceso = generarClaveAcceso({
        fecha:           fechaEmision,
        tipoComprobante: '04',
        ruc:             configSRI.ruc,
        ambiente:        configSRI.ambiente,
        establecimiento: configSRI.establecimiento,
        puntoEmision:    configSRI.puntoEmision,
        secuencial,
      });

      const secStr  = String(secuencial).padStart(9, '0');
      const serie   = `${configSRI.establecimiento.padStart(3,'0')}-${configSRI.puntoEmision.padStart(3,'0')}`;
      const numeroNC = `${serie}-${secStr}`;
      const numDocOrigen = `${comp.serie}-${comp.secuencial}`;

      // Ítems para el XML
      const itemsXML: ItemNotaCredito[] = itemsNC
        .filter(i => i.cantidadNC > 0)
        .map(i => ({
          codigoPrincipal:        i.sku,
          descripcion:            i.nombre,
          cantidad:               i.cantidadNC,
          precioUnitario:         i.precioUnitario,
          descuento:              0,
          precioTotalSinImpuesto: i.subtotal,
          tieneIVA:               i.tieneIVA,
        }));

      const subtotal15 = itemsNC.filter(i => i.tieneIVA).reduce((s, i) => s + i.subtotal, 0);
      const subtotal0  = itemsNC.filter(i => !i.tieneIVA).reduce((s, i) => s + i.subtotal, 0);

      const xml = generarXMLNotaCredito({
        claveAcceso,
        secuencial,
        fechaEmision,
        ambiente:               configSRI.ambiente,
        ruc:                    configSRI.ruc,
        razonSocial:            configSRI.razonSocial,
        establecimiento:        configSRI.establecimiento,
        puntoEmision:           configSRI.puntoEmision,
        direccionMatriz:        configSRI.direccionMatriz,
        obligadoContabilidad:   configSRI.obligadoContabilidad,
        contribuyenteEspecial:  configSRI.contribuyenteEspecial,
        codDocModificado:       '01',
        numDocModificado:       numDocOrigen,
        fechaEmisionDocSustento:fechaOrigen,
        tipoIdComprador:        comp.clienteIdentificacion === '9999999999999' ? '07' :
                                comp.clienteIdentificacion.length === 13 ? '04' : '05',
        identificacion:         comp.clienteIdentificacion,
        razonSocialComprador:   comp.clienteNombre,
        motivo:                 descripMotivo,
        items:                  itemsXML,
        subtotal15,
        subtotal0,
        totalDescuento:         0,
        iva:                    totales.iva,
        total:                  totales.total,
      });

      // Enviar al SRI
      const resp = await fetch('/api/sri/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xml,
          p12Base64:   configSRI.certificadoP12,
          password:    configSRI.certificadoPassword,
          claveAcceso,
          ambiente:    configSRI.ambiente,
        }),
      });
      const result = await resp.json();

      const estado: NotaCredito['estado'] =
        result.estado === 'AUTORIZADO' ? 'autorizada' :
        result.estado === 'DEVUELTA'   ? 'rechazada'  : 'pendiente';

      const ncData: Omit<NotaCredito, 'id' | 'createdAt'> = {
        comprobanteOrigenId:     compSel,
        numeroComprobanteOrigen: numDocOrigen,
        fechaEmisionOrigen:      fechaOrigen,
        clienteId:               '',
        clienteNombre:           comp.clienteNombre,
        clienteIdentificacion:   comp.clienteIdentificacion,
        tipo:                    'nota_credito',
        secuencial:              numeroNC,
        claveAcceso,
        estado,
        numeroAutorizacion:      result.numeroAutorizacion,
        fechaAutorizacion:       result.fechaAutorizacion ? new Date(result.fechaAutorizacion) : undefined,
        motivo,
        descripcionMotivo:       descripMotivo,
        fechaEmision,
        items:                   itemsXML,
        subtotal:                totales.subtotal,
        iva:                     totales.iva,
        total:                   totales.total,
        xmlUrl:                  result.xmlFirmadoB64,
        usuarioId:               user.uid,
        usuarioNombre:           user.nombre ?? user.email ?? 'Usuario',
      };

      const ncId = await createNotaCredito(ncData);

      // Asiento contable (background)
      crearAsientoNotaCredito({
        notaCreditoId: ncId,
        fecha:         fechaEmision,
        clienteNombre: comp.clienteNombre,
        tieneIVA:      subtotal15 > 0,
        subtotal:      totales.subtotal,
        iva:           totales.iva,
        total:         totales.total,
        usuarioId:     user.uid,
        usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
      }).catch(() => {});

      if (estado === 'autorizada') {
        toast.success(`Nota de Crédito ${numeroNC} autorizada por el SRI`);
      } else if (estado === 'rechazada') {
        toast.warning(`SRI rechazó la NC: ${result.mensajes?.join(', ') ?? ''}`);
      } else {
        toast.info(`NC guardada como pendiente — ${result.mensajes?.join(', ') ?? ''}`);
      }

      setDialogOpen(false);
      resetDialog();
    } catch (e: any) {
      toast.error(e.message ?? 'Error al emitir nota de crédito');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notas de Crédito"
        description="Emitir y gestionar notas de crédito electrónicas SRI"
        action={
          <Button size="sm" onClick={() => { resetDialog(); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Nueva Nota de Crédito
          </Button>
        }
      />

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>N° NC</TableHead>
              <TableHead>Factura origen</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}</TableRow>
              ))
            ) : notas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  <FileX className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No hay notas de crédito emitidas.
                </TableCell>
              </TableRow>
            ) : notas.map(n => (
              <>
                <TableRow key={n.id} className="cursor-pointer hover:bg-slate-50/50"
                  onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}>
                  <TableCell className="font-mono text-sm">{n.secuencial}</TableCell>
                  <TableCell className="text-sm text-slate-500">{n.numeroComprobanteOrigen}</TableCell>
                  <TableCell className="text-sm">{n.clienteNombre}</TableCell>
                  <TableCell className="text-sm">{MOTIVOS.find(m => m.value === n.motivo)?.label ?? n.motivo}</TableCell>
                  <TableCell className="text-right font-semibold text-sm">{currency(n.total)}</TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {format((n.fechaEmision as any)?.toDate?.() ?? new Date(n.fechaEmision), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_ESTADO[n.estado] ?? ''}`}>
                      {n.estado}
                    </span>
                  </TableCell>
                  <TableCell>
                    {expandedId === n.id
                      ? <ChevronUp className="h-4 w-4 text-slate-400" />
                      : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </TableCell>
                </TableRow>
                {expandedId === n.id && (
                  <TableRow key={`${n.id}-detail`}>
                    <TableCell colSpan={8} className="bg-slate-50 p-4">
                      <div className="space-y-2 text-xs text-slate-600">
                        <p><strong>Motivo:</strong> {n.descripcionMotivo}</p>
                        {n.numeroAutorizacion && (
                          <p><strong>N° autorización:</strong> <span className="font-mono">{n.numeroAutorizacion}</span></p>
                        )}
                        <div className="grid grid-cols-3 gap-3 mt-2">
                          <div className="bg-white rounded-lg p-2 border">
                            <p className="text-slate-400">Subtotal</p>
                            <p className="font-semibold">{currency(n.subtotal)}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border">
                            <p className="text-slate-400">IVA</p>
                            <p className="font-semibold">{currency(n.iva)}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border">
                            <p className="text-slate-400">Total NC</p>
                            <p className="font-bold text-red-600">{currency(n.total)}</p>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog emitir */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Emitir Nota de Crédito</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            {/* Factura origen */}
            <div>
              <Label>Factura origen (autorizada) *</Label>
              <Select value={compSel} onValueChange={handleSelectComp}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccionar factura…" />
                </SelectTrigger>
                <SelectContent>
                  {compAutorizados.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.serie}-{c.secuencial} — {c.clienteNombre} —{' '}
                      {format((c.fechaEmision as any)?.toDate?.() ?? new Date(c.fechaEmision), 'dd/MM/yyyy')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info cliente */}
            {compSelObj && (
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700 flex gap-4">
                <span><strong>Cliente:</strong> {compSelObj.clienteNombre}</span>
                <span><strong>ID:</strong> {compSelObj.clienteIdentificacion}</span>
                <span><strong>Total factura:</strong> {currency(compSelObj.total)}</span>
              </div>
            )}

            {/* Motivo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Motivo *</Label>
                <Select value={motivo} onValueChange={v => setMotivo(v as MotivoNotaCredito)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descripción *</Label>
                <Textarea value={descripMotivo} onChange={e => setDescripMotivo(e.target.value)}
                  placeholder="Ej: Devolución por defecto de fabricación"
                  className="mt-1 resize-none h-10 text-sm" rows={1} />
              </div>
            </div>

            {/* Ítems */}
            {loadingVenta ? (
              <div className="text-sm text-slate-400 py-4 text-center">Cargando ítems de la factura...</div>
            ) : itemsNC.length > 0 && (
              <div>
                <Label className="mb-2 block">Ítems a incluir en la NC</Label>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-500">Producto</th>
                        <th className="text-center px-2 py-2 font-medium text-slate-500 w-20">Cant. orig.</th>
                        <th className="text-center px-2 py-2 font-medium text-slate-500 w-24">Cant. NC</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-500 w-24">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsNC.map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2">
                            <p className="font-medium">{it.nombre}</p>
                            <p className="text-slate-400">{it.sku} · {currency(it.precioUnitario)}/u</p>
                          </td>
                          <td className="text-center px-2 py-2 text-slate-400">{it.cantidadOrig}</td>
                          <td className="px-2 py-2">
                            <Input
                              type="number" min="0" max={it.cantidadOrig} step="1"
                              value={it.cantidadNC}
                              onChange={e => updateCantidad(idx, Number(e.target.value))}
                              className="h-7 text-center text-xs w-20 mx-auto"
                            />
                          </td>
                          <td className="text-right px-3 py-2 font-semibold">
                            {currency(it.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Totales */}
            {itemsNC.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal sin IVA</span>
                  <span>{currency(totales.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>IVA 15%</span>
                  <span>{currency(totales.iva)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t pt-1">
                  <span>Total NC</span>
                  <span className="text-red-600">{currency(totales.total)}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleEmitir} disabled={saving || totales.total <= 0}>
              <Send className="mr-2 h-4 w-4" />
              {saving ? 'Enviando…' : 'Emitir y enviar al SRI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
