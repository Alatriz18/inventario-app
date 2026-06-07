'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Send, Download, Eye, FileX } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
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

import { NotaCredito, Comprobante, MotivoNotaCredito, ItemNotaCredito } from '@/types';
import { subscribeToNotasCredito, createNotaCredito, updateNotaCredito } from '@/lib/firebase/notas-credito';
import { subscribeToComprobantes }  from '@/lib/firebase/comprobantes';
import { getConfigSRI, incrementarSecuencial } from '@/lib/firebase/config-sri';
import { getConfigEmpresa }         from '@/lib/firebase/config-empresa';
import { generarClaveAcceso }       from '@/lib/sri/clave-acceso';
import { generarXMLNotaCredito }    from '@/lib/sri/generador-nota-credito';
import { useAuth }                  from '@/context/AuthContext';

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

export default function NotasCreditoPage() {
  const { user } = useAuth();
  const [notas,        setNotas]        = useState<NotaCredito[]>([]);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading,      setLoading]      = useState(true);

  // Dialog crear
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [compSel,      setCompSel]      = useState<string>('');
  const [motivo,       setMotivo]       = useState<MotivoNotaCredito>('devolucion');
  const [descripMotivo,setDescripMotivo]= useState('');
  const [saving,       setSaving]       = useState(false);

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

  const resetDialog = () => {
    setCompSel('');
    setMotivo('devolucion');
    setDescripMotivo('');
  };

  const handleEmitir = async () => {
    if (!user) return;
    if (!compSel) { toast.error('Selecciona el comprobante origen'); return; }
    if (!descripMotivo.trim()) { toast.error('Ingresa la descripción del motivo'); return; }

    setSaving(true);
    try {
      const configSRI = await getConfigSRI();
      const configEmp = await getConfigEmpresa();
      if (!configSRI) throw new Error('Configure primero los datos SRI');

      const comp = comprobantes.find(c => c.id === compSel);
      if (!comp) throw new Error('Comprobante no encontrado');

      const secuencial  = await incrementarSecuencial('secuencialNotaCredito');
      const fechaEmision= new Date();

      const claveAcceso = generarClaveAcceso({
        fecha:           fechaEmision,
        tipoComprobante: '04',
        ruc:             configSRI.ruc,
        ambiente:        configSRI.ambiente,
        establecimiento: configSRI.establecimiento,
        puntoEmision:    configSRI.puntoEmision,
        secuencial,
      });

      const numeroNC = `${configSRI.establecimiento.padStart(3,'0')}-${configSRI.puntoEmision.padStart(3,'0')}-${String(secuencial).padStart(9,'0')}`;

      // Items: por simplicidad, un ítem genérico con el total de la factura original
      // En producción se podría mostrar los ítems de la venta original
      const items: ItemNotaCredito[] = [{
        codigoPrincipal:       'NC',
        descripcion:           descripMotivo,
        cantidad:              1,
        precioUnitario:        0,
        descuento:             0,
        precioTotalSinImpuesto:0,
        tieneIVA:              false,
      }];

      const fechaOrigen = (comp.fechaEmision as any)?.toDate?.() ?? new Date(comp.fechaEmision);

      const datosNC = {
        claveAcceso,
        secuencial,
        fechaEmision,
        ambiente:    configSRI.ambiente,
        ruc:         configSRI.ruc,
        razonSocial: configSRI.razonSocial,
        nombreComercial: configEmp?.nombreComercial,
        establecimiento: configSRI.establecimiento,
        puntoEmision:    configSRI.puntoEmision,
        direccionMatriz: configSRI.direccionMatriz,
        obligadoContabilidad: configSRI.obligadoContabilidad,
        contribuyenteEspecial: configSRI.contribuyenteEspecial,
        codDocModificado: '01',
        numDocModificado: comp.secuencial,
        fechaEmisionDocSustento: fechaOrigen,
        tipoIdComprador: '07',
        identificacion:  '9999999999999',
        razonSocialComprador: 'Consumidor Final',
        motivo:          descripMotivo,
        items,
        subtotal15:  0,
        subtotal0:   0,
        totalDescuento: 0,
        iva:         0,
        total:       0,
      };

      const xml = generarXMLNotaCredito(datosNC);

      // Enviar a SRI usando la misma API de procesar
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
        result.autorizado ? 'autorizada' :
        result.rechazado  ? 'rechazada'  : 'pendiente';

      const ncData: Omit<NotaCredito, 'id' | 'createdAt'> = {
        comprobanteOrigenId:     compSel,
        numeroComprobanteOrigen: comp.secuencial,
        fechaEmisionOrigen:      fechaOrigen,
        clienteId:               '',
        clienteNombre:           'Consumidor Final',
        clienteIdentificacion:   '9999999999999',
        tipo:                    'nota_credito',
        secuencial:              numeroNC,
        claveAcceso,
        estado,
        numeroAutorizacion:      result.numeroAutorizacion,
        fechaAutorizacion:       result.fechaAutorizacion ? new Date(result.fechaAutorizacion) : undefined,
        motivo,
        descripcionMotivo:       descripMotivo,
        fechaEmision,
        items,
        subtotal: 0,
        iva:      0,
        total:    0,
        usuarioId:    user.uid,
        usuarioNombre:user.displayName ?? user.email ?? 'Usuario',
      };

      await createNotaCredito(ncData);

      if (result.autorizado) {
        toast.success(`Nota de crédito ${numeroNC} autorizada por SRI`);
      } else if (result.rechazado) {
        toast.warning(`SRI rechazó la nota de crédito: ${result.mensajes?.join(', ') ?? ''}`);
      } else {
        toast.info('Nota de crédito guardada como pendiente');
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
              <TableHead>N° Nota Crédito</TableHead>
              <TableHead>Comprobante origen</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Fecha emisión</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead>N° Autorización</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}</TableRow>
              ))
            ) : notas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                  <FileX className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No hay notas de crédito emitidas.
                </TableCell>
              </TableRow>
            ) : notas.map(n => (
              <TableRow key={n.id}>
                <TableCell className="font-mono text-sm">{n.secuencial}</TableCell>
                <TableCell className="text-sm text-slate-500">{n.numeroComprobanteOrigen}</TableCell>
                <TableCell className="text-sm">{MOTIVOS.find(m => m.value === n.motivo)?.label ?? n.motivo}</TableCell>
                <TableCell className="text-sm text-slate-500">
                  {format((n.fechaEmision as any)?.toDate?.() ?? new Date(n.fechaEmision), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell className="text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_ESTADO[n.estado] ?? ''}`}>
                    {n.estado}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-400">
                  {n.numeroAutorizacion ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog emitir */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Emitir Nota de Crédito</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Comprobante origen (factura autorizada) *</Label>
              <Select value={compSel} onValueChange={setCompSel}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccionar factura…" />
                </SelectTrigger>
                <SelectContent>
                  {compAutorizados.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.secuencial} — {format((c.fechaEmision as any)?.toDate?.() ?? new Date(c.fechaEmision), 'dd/MM/yyyy')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motivo *</Label>
              <Select value={motivo} onValueChange={v => setMotivo(v as MotivoNotaCredito)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descripción del motivo *</Label>
              <Textarea
                value={descripMotivo}
                onChange={e => setDescripMotivo(e.target.value)}
                placeholder="Ej: Devolución de 5 unidades de Producto X por defecto de fabricación"
                className="mt-1 resize-none"
                rows={3}
              />
            </div>
            {compSelObj && (
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
                <p>Comprobante: <strong className="text-slate-700">{compSelObj.secuencial}</strong></p>
                <p>Fecha: <strong className="text-slate-700">
                  {format((compSelObj.fechaEmision as any)?.toDate?.() ?? new Date(compSelObj.fechaEmision), 'dd/MM/yyyy')}
                </strong></p>
                <p className="text-yellow-600 font-medium mt-2">
                  La NC se enviará al SRI con monto $0.00. Para NC con monto, registra los ítems manualmente.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleEmitir} disabled={saving}>
              <Send className="mr-2 h-4 w-4" />
              {saving ? 'Enviando…' : 'Emitir y enviar al SRI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
