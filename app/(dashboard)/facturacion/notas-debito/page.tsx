'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Send, FileX, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Label }   from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { NotaDebito, Comprobante, RazonNotaDebito } from '@/types';
import { subscribeToNotasDebito, createNotaDebito }from '@/lib/firebase/notas-debito';
import { subscribeToComprobantes }                  from '@/lib/firebase/comprobantes';
import { getConfigSRI, incrementarSecuencial }      from '@/lib/firebase/config-sri';
import { getConfigEmpresa }                         from '@/lib/firebase/config-empresa';
import { generarClaveAcceso }                       from '@/lib/sri/clave-acceso';
import { generarXMLNotaDebito }                     from '@/lib/sri/generador-nota-debito';
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
      const configEmp = await getConfigEmpresa();
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

      const numeroND = `${configSRI.establecimiento.padStart(3,'0')}-${configSRI.puntoEmision.padStart(3,'0')}-${String(secuencial).padStart(9,'0')}`;
      const razonesNum: RazonNotaDebito[] = razones.map(r => ({
        descripcion: r.descripcion,
        valor:       parseFloat(r.valor) || 0,
      }));

      const fechaOrigen = (comp.fechaEmision as any)?.toDate?.() ?? new Date(comp.fechaEmision);
      const iva = totalND * 0.15;

      const xml = generarXMLNotaDebito({
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
        codDocModificado:    '01',
        numDocModificado:    comp.secuencial,
        fechaEmisionDocSustento: fechaOrigen,
        tipoIdComprador:     '07',
        identificacion:      '9999999999999',
        razonSocialComprador:'Consumidor Final',
        razones:             razonesNum,
        subtotal15:  totalND,
        subtotal0:   0,
        iva,
        total:       totalND + iva,
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

      const estado: NotaDebito['estado'] =
        result.autorizado ? 'autorizada' :
        result.rechazado  ? 'rechazada'  : 'pendiente';

      await createNotaDebito({
        comprobanteOrigenId:     compSel,
        numeroComprobanteOrigen: comp.secuencial,
        fechaEmisionOrigen:      fechaOrigen,
        clienteId:               '',
        clienteNombre:           'Consumidor Final',
        clienteIdentificacion:   '9999999999999',
        tipo:                    'nota_debito',
        secuencial:              numeroND,
        claveAcceso,
        estado,
        numeroAutorizacion: result.numeroAutorizacion,
        fechaAutorizacion:  result.fechaAutorizacion ? new Date(result.fechaAutorizacion) : undefined,
        fechaEmision,
        razones:            razonesNum,
        subtotal:           totalND,
        iva,
        total:              totalND + iva,
        usuarioId:          user.uid,
        usuarioNombre:      user.nombre ?? user.email ?? 'Usuario',
      });

      if (result.autorizado) {
        toast.success(`Nota de débito ${numeroND} autorizada`);
      } else {
        toast.info('Nota de débito guardada — ' + (result.mensajes?.join(', ') ?? ''));
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
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>N° Nota Débito</TableHead>
              <TableHead>Comprobante origen</TableHead>
              <TableHead>Fecha emisión</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead>N° Autorización</TableHead>
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
                <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                  <FileX className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No hay notas de débito emitidas.
                </TableCell>
              </TableRow>
            ) : notas.map(n => (
              <TableRow key={n.id}>
                <TableCell className="font-mono text-sm">{n.secuencial}</TableCell>
                <TableCell className="text-sm text-slate-500">{n.numeroComprobanteOrigen}</TableCell>
                <TableCell className="text-sm text-slate-500">
                  {format((n.fechaEmision as any)?.toDate?.() ?? new Date(n.fechaEmision), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell className="text-right font-semibold">{currency(n.total)}</TableCell>
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

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Emitir Nota de Débito</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
