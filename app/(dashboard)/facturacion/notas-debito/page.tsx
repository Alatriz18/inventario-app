'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Send, FileX, Trash2, Download, Ban } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { NotaDebito, RazonNotaDebito } from '@/types';
import { subscribeToNotasDebito, createNotaDebito, updateNotaDebito } from '@/lib/firebase/notas-debito';
import { subscribeToComprobantes, Comprobante }     from '@/lib/firebase/comprobantes';
import { getConfigSRI, incrementarSecuencial }      from '@/lib/firebase/config-sri';
import { generarClaveAcceso }                       from '@/lib/sri/clave-acceso';
import { generarXMLNotaDebito }                     from '@/lib/sri/generador-nota-debito';
import { crearAsientoNotaDebito, crearAsientoReversion } from '@/lib/contabilidad/motor-asientos';
import { descargarRIDE }                             from '@/lib/sri/ride-pdf';
import { buildRIDENotaDebito }                        from '@/lib/sri/ride-builders';
import { useAuth }                                  from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;

const BADGE_ESTADO: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-700',
  autorizado: 'bg-green-100 text-green-700',
  rechazado:  'bg-red-100 text-red-700',
};

export default function NotasDebitoPage() {
  const { user } = useAuth();
  const [notas,        setNotas]        = useState<NotaDebito[]>([]);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [compSel,      setCompSel]      = useState('');
  const [razones,      setRazones]      = useState<{ descripcion: string; valor: string }[]>([
    { descripcion: '', valor: '' },
  ]);
  const [saving,       setSaving]       = useState(false);

  // Registro histórico: ND ya emitida y autorizada por el SRI en el pasado.
  const [esHistoricaND,       setEsHistoricaND]       = useState(false);
  const [histCliente,         setHistCliente]         = useState('');
  const [histClienteIdent,    setHistClienteIdent]    = useState('');
  const [histNumFacturaOrigen,setHistNumFacturaOrigen]= useState('');
  const [histFechaOrigen,     setHistFechaOrigen]     = useState('');
  const [histFechaEmision,    setHistFechaEmision]    = useState('');
  const [histSecuencial,      setHistSecuencial]      = useState('');
  const [histClaveAcceso,     setHistClaveAcceso]     = useState('');
  const [histNumAutorizacion, setHistNumAutorizacion] = useState('');

  useEffect(() => {
    const u1 = subscribeToNotasDebito(d => { setNotas(d); setLoading(false); });
    const u2 = subscribeToComprobantes(setComprobantes);
    return () => { u1(); u2(); };
  }, []);

  const compAutorizados = useMemo(
    () => comprobantes.filter(c => c.estado === 'autorizado' && c.tipo === 'factura'),
    [comprobantes]
  );

  const addRazon = () => setRazones(r => [...r, { descripcion: '', valor: '' }]);
  const removeRazon = (i: number) => setRazones(r => r.filter((_, idx) => idx !== i));
  const updateRazon = (i: number, field: 'descripcion' | 'valor', v: string) =>
    setRazones(r => r.map((x, idx) => idx === i ? { ...x, [field]: v } : x));

  const totalND = useMemo(() => {
    return razones.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
  }, [razones]);

  const handleEmitir = async () => {
    if (!user) return;
    if (!compSel) { toast.error('Selecciona el comprobante origen'); return; }
    if (razones.some(r => !r.descripcion || !r.valor)) {
      toast.error('Completa todas las razones con descripción y valor');
      return;
    }

    setSaving(true);
    try {
      const configSRI = await getConfigSRI();
      if (!configSRI) throw new Error('Configure primero los datos SRI');

      const comp = comprobantes.find(c => c.id === compSel);
      if (!comp) throw new Error('Comprobante no encontrado');

      const secuencial   = await incrementarSecuencial('secuencialNotaDebito');
      const fechaEmision = new Date();
      const claveAcceso  = generarClaveAcceso({
        fecha:           fechaEmision,
        tipoComprobante: '05',
        ruc:             configSRI.ruc,
        ambiente:        configSRI.ambiente,
        establecimiento: configSRI.establecimiento,
        puntoEmision:    configSRI.puntoEmision,
        secuencial,
      });

      const secStr   = String(secuencial).padStart(9, '0');
      const serie    = `${configSRI.establecimiento.padStart(3,'0')}-${configSRI.puntoEmision.padStart(3,'0')}`;
      const numeroND = `${serie}-${secStr}`;
      const numDocOrigen = `${comp.serie}-${comp.secuencial}`;
      const razonesNum: RazonNotaDebito[] = razones.map(r => ({
        descripcion: r.descripcion,
        valor:       parseFloat(r.valor) || 0,
      }));

      const fechaOrigen = (comp.fechaEmision as any)?.toDate?.() ?? new Date(comp.fechaEmision);
      const iva = totalND * 0.15;

      const tipoIdComp = comp.clienteIdentificacion === '9999999999999' ? '07'
        : comp.clienteIdentificacion.length === 13 ? '04' : '05';

      const xml = generarXMLNotaDebito({
        claveAcceso,
        secuencial,
        fechaEmision,
        ambiente:    configSRI.ambiente,
        ruc:         configSRI.ruc,
        razonSocial: configSRI.razonSocial,
        establecimiento: configSRI.establecimiento,
        puntoEmision:    configSRI.puntoEmision,
        direccionMatriz: configSRI.direccionMatriz,
        obligadoContabilidad: configSRI.obligadoContabilidad,
        contribuyenteEspecial: configSRI.contribuyenteEspecial,
        codDocModificado:    '01',
        numDocModificado:    numDocOrigen,
        fechaEmisionDocSustento: fechaOrigen,
        tipoIdComprador:     tipoIdComp,
        identificacion:      comp.clienteIdentificacion,
        razonSocialComprador:comp.clienteNombre,
        razones:             razonesNum,
        subtotal15:  totalND,
        subtotal0:   0,
        iva,
        total:       totalND + iva,
      });

      // Crear el registro en Firestore ANTES de llamar al SRI (estado: pendiente),
      // para que quede constancia aunque la llamada falle a medio camino.
      const ndId = await createNotaDebito({
        comprobanteOrigenId:     compSel,
        numeroComprobanteOrigen: numDocOrigen,
        fechaEmisionOrigen:      fechaOrigen,
        clienteId:               '',
        clienteNombre:           comp.clienteNombre,
        clienteIdentificacion:   comp.clienteIdentificacion,
        tipo:                    'nota_debito',
        secuencial:              numeroND,
        claveAcceso,
        estado:                  'pendiente',
        fechaEmision,
        razones:                 razonesNum,
        subtotal:                totalND,
        iva,
        total:                   totalND + iva,
        usuarioId:               user.uid,
        usuarioNombre:           user.nombre ?? user.email ?? 'Usuario',
      });

      const resp = await fetch('/api/sri/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xml,
          p12Base64:  configSRI.certificadoP12,
          password:   configSRI.certificadoPassword,
          claveAcceso,
          ambiente:   configSRI.ambiente,
        }),
      });
      const result = await resp.json();

      // Error HTTP (400/500: validación, firma, envío) — mostrar el motivo real
      if (!resp.ok) {
        const etapa      = result.etapa ?? 'desconocida';
        const detalle     = result.error ?? `Error HTTP ${resp.status}`;
        const msgCompleto = `[${etapa.toUpperCase()}] ${detalle}`;
        await updateNotaDebito(ndId, { estado: 'rechazada', mensajesSRI: [msgCompleto] });
        toast.error(msgCompleto, { duration: 8000 });
        return;
      }

      const estado: NotaDebito['estado'] =
        result.estado === 'AUTORIZADO' ? 'autorizada' :
        result.estado === 'DEVUELTA'   ? 'rechazada'  : 'pendiente';
      const mensajesSRI: string[] = (result.mensajes ?? []).map((m: any) =>
        typeof m === 'string' ? m : `[${m.identificador ?? '?'}] ${m.mensaje ?? ''} ${m.informacionAdicional ?? ''}`
      );

      await updateNotaDebito(ndId, {
        estado,
        numeroAutorizacion: result.numeroAutorizacion,
        fechaAutorizacion:  result.fechaAutorizacion ? new Date(result.fechaAutorizacion) : undefined,
        xmlUrl:             result.xmlAutorizado ?? result.xmlFirmadoB64,
        mensajesSRI,
      });

      // Asiento contable (background) — solo si el SRI la autorizó
      if (estado === 'autorizada') {
        crearAsientoNotaDebito({
          notaDebitoId:  ndId,
          fecha:         fechaEmision,
          clienteNombre: comp.clienteNombre,
          tieneIVA:      iva > 0,
          subtotal:      totalND,
          iva,
          total:         totalND + iva,
          usuarioId:     user.uid,
          usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
        }).catch(() => {});
      }

      if (estado === 'autorizada') {
        toast.success(`Nota de Débito ${numeroND} autorizada por el SRI`);
      } else if (estado === 'rechazada') {
        toast.warning(`SRI rechazó la ND: ${mensajesSRI.join(', ') || 'sin detalle'}`, { duration: 8000 });
      } else {
        toast.info(`ND guardada como pendiente — ${mensajesSRI.join(', ') || 'sin detalle'}`);
      }

      setDialogOpen(false);
      setCompSel('');
      setRazones([{ descripcion: '', valor: '' }]);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al emitir nota de débito');
    } finally {
      setSaving(false);
    }
  };

  const resetHistorico = () => {
    setEsHistoricaND(false);
    setHistCliente(''); setHistClienteIdent(''); setHistNumFacturaOrigen('');
    setHistFechaOrigen(''); setHistFechaEmision(''); setHistSecuencial('');
    setHistClaveAcceso(''); setHistNumAutorizacion('');
  };

  // ND ya autorizada por el SRI en el pasado — solo se registra en el sistema.
  const handleRegistrarHistorica = async () => {
    if (!user) return;
    if (!histCliente.trim() || !histClienteIdent.trim()) { toast.error('Ingresa el cliente'); return; }
    if (!histFechaEmision) { toast.error('Ingresa la fecha de emisión de la ND'); return; }
    if (!histSecuencial.trim()) { toast.error('Ingresa el número de la ND'); return; }
    if (razones.some(r => !r.descripcion || !r.valor)) {
      toast.error('Completa todas las razones con descripción y valor');
      return;
    }
    const iva = totalND * 0.15;
    const total = totalND + iva;
    if (total <= 0) { toast.error('El monto de la ND no puede ser $0.00'); return; }

    setSaving(true);
    try {
      const fechaEmision = new Date(histFechaEmision + 'T12:00:00');
      const fechaOrigen  = histFechaOrigen ? new Date(histFechaOrigen + 'T12:00:00') : fechaEmision;
      const razonesNum: RazonNotaDebito[] = razones.map(r => ({
        descripcion: r.descripcion,
        valor:       parseFloat(r.valor) || 0,
      }));

      const ndId = await createNotaDebito({
        comprobanteOrigenId:     '',
        numeroComprobanteOrigen: histNumFacturaOrigen.trim(),
        fechaEmisionOrigen:      fechaOrigen,
        clienteId:               '',
        clienteNombre:           histCliente.trim(),
        clienteIdentificacion:   histClienteIdent.trim(),
        tipo:                    'nota_debito',
        secuencial:              histSecuencial.trim(),
        claveAcceso:             histClaveAcceso.trim(),
        numeroAutorizacion:      histNumAutorizacion.trim() || undefined,
        fechaAutorizacion:       fechaEmision,
        estado:                  'autorizada',
        fechaEmision,
        razones:                 razonesNum,
        subtotal:                totalND,
        iva,
        total,
        usuarioId:               user.uid,
        usuarioNombre:           user.nombre ?? user.email ?? 'Usuario',
      });

      const asientoId = await crearAsientoNotaDebito({
        notaDebitoId:  ndId,
        fecha:         fechaEmision,
        clienteNombre: histCliente.trim(),
        tieneIVA:      iva > 0,
        subtotal:      totalND,
        iva,
        total,
        usuarioId:     user.uid,
        usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
      });

      if (!asientoId) {
        toast.warning('La ND quedó registrada, pero el asiento contable NO se pudo generar. Revísala en Contabilidad → Libro Diario.', { duration: 12000 });
      } else {
        toast.success(`ND ${histSecuencial} registrada en el sistema`);
      }
      setDialogOpen(false);
      setCompSel('');
      setRazones([{ descripcion: '', valor: '' }]);
      resetHistorico();
    } catch (e: any) {
      toast.error(e.message ?? 'Error al registrar la ND');
    } finally {
      setSaving(false);
    }
  };

  const anularND = async (n: NotaDebito) => {
    if (!user) return;
    if (n.estado === 'anulada') { toast.info('La ND ya está anulada'); return; }
    if (!window.confirm(`¿Anular la ND ${n.secuencial}? Se revertirá su asiento contable.`)) return;
    try {
      const rev = await crearAsientoReversion({
        referenciaId: n.id, referenciaTipo: 'nota_debito', fecha: new Date(),
        concepto: `Anulación ND ${n.secuencial}`,
        usuarioId: user.uid, usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
      });
      await updateNotaDebito(n.id, { estado: 'anulada' });
      toast.success(rev.ok ? 'ND anulada y asiento revertido' : `ND anulada (${rev.advertencia ?? 'sin asiento'})`);
    } catch (e: any) { toast.error(e?.message ?? 'Error al anular'); }
  };

  const descargarRide = async (nd: NotaDebito) => {
    try {
      const config = await getConfigSRI();
      if (!config) { toast.error('Configura los datos del SRI primero'); return; }
      descargarRIDE(buildRIDENotaDebito(nd, config));
    } catch (e: any) {
      toast.error(`Error al generar RIDE: ${e.message ?? 'desconocido'}`);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notas de Débito"
        description="Emitir y gestionar notas de débito electrónicas SRI"
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva Nota de Débito
          </Button>
        }
      />

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>N° Nota Débito</TableHead>
              <TableHead>Factura origen</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}</TableRow>
              ))
            ) : notas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                  <FileX className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No hay notas de débito emitidas.
                </TableCell>
              </TableRow>
            ) : notas.map(n => (
              <TableRow key={n.id}>
                <TableCell className="font-mono text-sm">{n.secuencial}</TableCell>
                <TableCell className="text-sm text-slate-500">{n.numeroComprobanteOrigen}</TableCell>
                <TableCell className="text-sm">{n.clienteNombre}</TableCell>
                <TableCell className="text-sm text-slate-500">
                  {format((n.fechaEmision as any)?.toDate?.() ?? new Date(n.fechaEmision), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell className="text-right font-bold">{currency(n.total)}</TableCell>
                <TableCell className="text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_ESTADO[n.estado] ?? ''}`}>
                    {n.estado}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Descargar RIDE"
                    onClick={() => descargarRide(n)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {n.estado !== 'anulada' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-600"
                      title="Anular" onClick={() => anularND(n)}>
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{esHistoricaND ? 'Registrar Nota de Débito ya emitida' : 'Emitir Nota de Débito'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-start gap-2 bg-slate-50 border rounded-lg px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={esHistoricaND}
                onChange={e => { setEsHistoricaND(e.target.checked); setCompSel(''); }}
                className="mt-0.5" />
              <span className="text-xs text-slate-600">
                📂 <strong>Ya fue emitida y autorizada por el SRI</strong> (de antes de usar el sistema) —
                solo quiero registrarla en contabilidad, sin volver a enviarla al SRI.
              </span>
            </label>

            {esHistoricaND ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Cliente *</Label>
                  <Input value={histCliente} onChange={e => setHistCliente(e.target.value)}
                    placeholder="Nombre del cliente" className="mt-1" />
                </div>
                <div>
                  <Label>Identificación *</Label>
                  <Input value={histClienteIdent} onChange={e => setHistClienteIdent(e.target.value)}
                    placeholder="RUC / cédula" className="mt-1" />
                </div>
                <div>
                  <Label>N° factura origen</Label>
                  <Input value={histNumFacturaOrigen} onChange={e => setHistNumFacturaOrigen(e.target.value)}
                    placeholder="001-001-000000123" className="mt-1" />
                </div>
                <div>
                  <Label>Fecha factura origen</Label>
                  <Input type="date" value={histFechaOrigen} onChange={e => setHistFechaOrigen(e.target.value)}
                    max={new Date().toISOString().split('T')[0]} className="mt-1" />
                </div>
                <div>
                  <Label>Fecha de emisión de la ND *</Label>
                  <Input type="date" value={histFechaEmision} onChange={e => setHistFechaEmision(e.target.value)}
                    max={new Date().toISOString().split('T')[0]} className="mt-1" />
                </div>
                <div>
                  <Label>N° de la ND *</Label>
                  <Input value={histSecuencial} onChange={e => setHistSecuencial(e.target.value)}
                    placeholder="001-020-000000005" className="mt-1" />
                </div>
                <div>
                  <Label>Clave de acceso (opcional)</Label>
                  <Input value={histClaveAcceso} onChange={e => setHistClaveAcceso(e.target.value)}
                    placeholder="49 dígitos" className="mt-1 font-mono text-xs" />
                </div>
                <div>
                  <Label>N° de autorización (opcional)</Label>
                  <Input value={histNumAutorizacion} onChange={e => setHistNumAutorizacion(e.target.value)}
                    className="mt-1 font-mono text-xs" />
                </div>
              </div>
            ) : (
              <div>
                <Label>Comprobante origen *</Label>
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
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Razones del cargo *</Label>
                <Button variant="outline" size="sm" onClick={addRazon}>+ Agregar</Button>
              </div>
              {razones.map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="Descripción"
                    value={r.descripcion}
                    onChange={e => updateRazon(i, 'descripcion', e.target.value)}
                    className="flex-1 text-sm"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Valor"
                    value={r.valor}
                    onChange={e => updateRazon(i, 'valor', e.target.value)}
                    className="w-28 text-sm"
                  />
                  {razones.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeRazon(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="text-right text-sm font-semibold text-slate-700">
                Subtotal: {currency(totalND)} + IVA 15%: {currency(totalND * 0.15)} = {currency(totalND * 1.15)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            {esHistoricaND ? (
              <Button onClick={handleRegistrarHistorica} disabled={saving}>
                <Send className="mr-2 h-4 w-4" />
                {saving ? 'Registrando…' : 'Registrar ND'}
              </Button>
            ) : (
              <Button onClick={handleEmitir} disabled={saving}>
                <Send className="mr-2 h-4 w-4" />
                {saving ? 'Enviando…' : 'Emitir y enviar al SRI'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
