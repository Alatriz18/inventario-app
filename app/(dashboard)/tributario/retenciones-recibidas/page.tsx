'use client';

import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, FileText, Upload } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { RetencionRecibida, LineaRetencionRecibida, Venta } from '@/types';
import {
  subscribeToRetencionesRecibidas,
  createRetencionRecibida,
  updateRetencionRecibida,
} from '@/lib/firebase/retenciones-recibidas';
import { crearAsientoRetencionRecibida } from '@/lib/contabilidad/motor-asientos';
import { parsearRetencionXML, detectarTipoComprobante } from '@/lib/sri/xmlParser';
import { subscribeToComprobantes, Comprobante } from '@/lib/firebase/comprobantes';
import { subscribeToVentas } from '@/lib/firebase/ventas';
import { getCxCByVentaId, registrarCobroCxC, vincularAsientoCobro } from '@/lib/firebase/cuentas-cobrar';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;

function parseFechaXml(s: string): Date {
  const [dd, MM, yyyy] = (s || '').split('/');
  // new Date(`${yyyy}-${MM}-${dd}`) parsea como medianoche UTC — en Ecuador
  // (UTC-5) eso corre el documento al día anterior al leerlo en hora local.
  return yyyy ? new Date(Number(yyyy), Number(MM) - 1, Number(dd), 12) : new Date();
}

const CODIGOS_FUENTE = [
  { codigo: '303', descripcion: 'Honorarios profesionales — 10%',          porcentaje: 10 },
  { codigo: '304', descripcion: 'Servicios — 2%',                          porcentaje: 2  },
  { codigo: '307', descripcion: 'Arrendamiento inmuebles — 8%',            porcentaje: 8  },
  { codigo: '310', descripcion: 'Transferencia bienes muebles — 1%',       porcentaje: 1  },
  { codigo: '312', descripcion: 'Otras compras de bienes — 1%',            porcentaje: 1  },
  { codigo: '340', descripcion: 'Otras retenciones aplicables — 1%',       porcentaje: 1  },
  { codigo: '332', descripcion: 'Pagos por seguros y reaseguros — 1%',     porcentaje: 1  },
];

const CODIGOS_IVA = [
  { codigo: '721', descripcion: 'Bienes — 30% del IVA',  porcentaje: 30 },
  { codigo: '723', descripcion: 'Servicios — 70% del IVA', porcentaje: 70 },
  { codigo: '725', descripcion: '100% del IVA',            porcentaje: 100 },
];

interface LineaForm {
  tipo:          'fuente_ir' | 'iva';
  codigoCodigo:  string;
  baseImponible: string;
}

function nuevaLinea(): LineaForm {
  return { tipo: 'fuente_ir', codigoCodigo: '310', baseImponible: '' };
}

export default function RetencionesRecibidasPage() {
  const { user } = useAuth();
  const [retenciones, setRetenciones] = useState<RetencionRecibida[]>([]);
  const [comprobantesEmitidos, setComprobantesEmitidos] = useState<Comprobante[]>([]);
  const [ventas,      setVentas]      = useState<Venta[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [importing,   setImporting]   = useState(false);
  const xmlRef = useRef<HTMLInputElement>(null);

  // Dialog "Vincular venta" — para retenciones que quedaron con ventaId vacío
  // (ej. una registrada a mano sin llenar la referencia, o una importada por
  // XML cuyo comprobante emitido no se pudo emparejar automáticamente). Sin
  // ventaId el ATS no puede sumarle las retenciones a esa venta.
  const [vincularRet,   setVincularRet]   = useState<RetencionRecibida | null>(null);
  const [ventaElegida,  setVentaElegida]  = useState('');
  const [savingVincularVenta, setSavingVincularVenta] = useState(false);

  // Form state
  const [clienteNombre,        setClienteNombre]        = useState('');
  const [clienteIdentificacion, setClienteIdentificacion] = useState('');
  const [numeroRetencion,      setNumeroRetencion]      = useState('');
  const [fechaEmision,         setFechaEmision]         = useState(format(new Date(), 'yyyy-MM-dd'));
  const [ejercicioFiscal,      setEjercicioFiscal]      = useState(String(new Date().getFullYear()));
  const [ventaRef,             setVentaRef]             = useState('');
  const [lineas,               setLineas]               = useState<LineaForm[]>([nuevaLinea()]);

  useEffect(() => {
    const u1 = subscribeToRetencionesRecibidas(d => { setRetenciones(d); setLoading(false); }, { limite: 500 });
    const u2 = subscribeToComprobantes(setComprobantesEmitidos, { limite: 1000 });
    const u3 = subscribeToVentas(setVentas, { limite: 3000 });
    return () => { u1(); u2(); u3(); };
  }, []);

  const abrirVincularVenta = (r: RetencionRecibida) => {
    setVincularRet(r);
    setVentaElegida(r.ventaId || '');
  };

  const guardarVinculoVenta = async () => {
    if (!vincularRet || !ventaElegida) { toast.error('Selecciona una venta'); return; }
    setSavingVincularVenta(true);
    try {
      await updateRetencionRecibida(vincularRet.id, { ventaId: ventaElegida });
      toast.success('Retención vinculada a la venta — ya se va a incluir en el próximo ATS que generes');
      setVincularRet(null);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al vincular');
    } finally {
      setSavingVincularVenta(false);
    }
  };

  // Ventas candidatas para vincular: mismo cliente (por identificación), lo
  // más reciente primero — normalmente son muy pocas para elegir a simple vista.
  const ventasCandidatas = vincularRet
    ? ventas.filter(v => v.clienteIdentificacion === vincularRet.clienteIdentificacion)
    : [];

  // ── Importar XML(s) de comprobantes de retención que nos entregan los clientes ──
  const handleImportarXML = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !user) return;
    setImporting(true);
    let ok = 0, dup = 0, err = 0, sinAsiento = 0;
    const existentes = new Set(retenciones.map(r => r.claveAcceso).filter(Boolean) as string[]);

    for (const file of files) {
      try {
        const xml = await file.text();
        if (detectarTipoComprobante(xml) !== 'retencion') { err++; continue; }
        const d = parsearRetencionXML(xml);
        if (!d) { err++; continue; }
        if (d.claveAcceso && existentes.has(d.claveAcceso)) { dup++; continue; }

        const numeroRet = `${d.estab}-${d.ptoEmi}-${d.secuencial}`;

        let ventaId = '', numeroComprobante = '';
        if (d.numDocSustento && d.numDocSustento.length === 15) {
          const serieBuscada = `${d.numDocSustento.slice(0, 3)}-${d.numDocSustento.slice(3, 6)}`;
          const secBuscado   = d.numDocSustento.slice(6);
          const comp = comprobantesEmitidos.find(c => c.serie === serieBuscada && c.secuencial === secBuscado);
          if (comp) { ventaId = comp.ventaId ?? ''; numeroComprobante = `${comp.serie}-${comp.secuencial}`; }
        }

        const retId = await createRetencionRecibida({
          ventaId, numeroComprobante,
          clienteId: '', clienteNombre: d.razonSocial, clienteIdentificacion: d.ruc,
          numeroRetencion: numeroRet, claveAcceso: d.claveAcceso, fechaEmision: parseFechaXml(d.fechaEmision),
          ejercicioFiscal: d.periodoFiscal,
          lineas: d.lineas.map(l => ({
            tipo: l.tipo, codigo: l.codigo, descripcion: l.codigo,
            porcentaje: l.porcentaje, baseImponible: l.baseImponible, valorRetenido: l.valorRetenido,
          })),
          totalRetenido: d.totalRetenido, retFuente: d.retFuente, retIVA: d.retIVA,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });

        const asientoId = await crearAsientoRetencionRecibida({
          retencionId: retId, fecha: parseFechaXml(d.fechaEmision), clienteNombre: d.razonSocial,
          retFuente: d.retFuente, retIVA: d.retIVA, totalRetenido: d.totalRetenido,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        if (asientoId) await updateRetencionRecibida(retId, { asientoId });
        else sinAsiento++;

        // Si sustenta una venta a crédito con CxC activa, la retención cancela parte del saldo
        if (ventaId && asientoId) {
          try {
            const cxc = await getCxCByVentaId(ventaId);
            if (cxc && cxc.estado !== 'pagada' && cxc.estado !== 'anulada') {
              const cobroId = await registrarCobroCxC(cxc.id, {
                fecha: parseFechaXml(d.fechaEmision), monto: d.totalRetenido, metodoPago: 'retencion',
                referencia: numeroRet, usuarioId: user.uid, usuarioNombre: user.nombre,
              }, user.uid, user.nombre);
              await vincularAsientoCobro(cxc.id, cobroId, asientoId);
            }
          } catch { /* la retención ya quedó registrada; el saldo se puede ajustar manualmente */ }
        }

        if (d.claveAcceso) existentes.add(d.claveAcceso);
        ok++;
      } catch {
        err++;
      }
    }

    setImporting(false);
    if (xmlRef.current) xmlRef.current.value = '';
    toast.success(`Importadas: ${ok} · Duplicadas: ${dup}${err ? ` · Con error: ${err}` : ''}`);
    if (sinAsiento > 0) {
      toast.warning(`${sinAsiento} retención(es) se importaron pero NO generaron asiento contable. Revísalas en Libro Diario.`, { duration: 12000 });
    }
  };

  function addLinea() { setLineas(prev => [...prev, nuevaLinea()]); }
  function removeLinea(i: number) { setLineas(prev => prev.filter((_, idx) => idx !== i)); }
  function updateLinea(i: number, field: keyof LineaForm, value: string) {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function calcLineas(): LineaRetencionRecibida[] {
    return lineas.map(l => {
      const base = parseFloat(l.baseImponible) || 0;
      const lista = l.tipo === 'fuente_ir' ? CODIGOS_FUENTE : CODIGOS_IVA;
      const cod   = lista.find(c => c.codigo === l.codigoCodigo) ?? lista[0];
      const valor = parseFloat((base * cod.porcentaje / 100).toFixed(2));
      return {
        tipo:          l.tipo,
        codigo:        cod.codigo,
        descripcion:   cod.descripcion,
        porcentaje:    cod.porcentaje,
        baseImponible: base,
        valorRetenido: valor,
      };
    });
  }

  async function handleSave() {
    if (!user) return;
    if (!clienteNombre || !numeroRetencion || !fechaEmision) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    if (lineas.some(l => !l.baseImponible || parseFloat(l.baseImponible) <= 0)) {
      toast.error('Base imponible inválida en alguna línea');
      return;
    }

    setSaving(true);
    try {
      const lineasCalc = calcLineas();
      const retFuente  = lineasCalc.filter(l => l.tipo === 'fuente_ir').reduce((s, l) => s + l.valorRetenido, 0);
      const retIVA     = lineasCalc.filter(l => l.tipo === 'iva').reduce((s, l) => s + l.valorRetenido, 0);
      const total      = parseFloat((retFuente + retIVA).toFixed(2));

      // Require obligadoContabilidad setting — always create asiento
      const id = await createRetencionRecibida({
        ventaId:              ventaRef || '',
        numeroComprobante:    '',
        clienteId:            '',
        clienteNombre,
        clienteIdentificacion,
        numeroRetencion,
        fechaEmision:         new Date(fechaEmision),
        ejercicioFiscal,
        lineas:               lineasCalc,
        totalRetenido:        total,
        retFuente,
        retIVA,
        usuarioId:    user.uid,
        usuarioNombre:user.nombre,
      });

      const asientoId = await crearAsientoRetencionRecibida({
        retencionId:   id,
        fecha:         new Date(fechaEmision),
        clienteNombre,
        retFuente,
        retIVA,
        totalRetenido: total,
        usuarioId:     user.uid,
        usuarioNombre: user.nombre,
      });
      if (asientoId) {
        await import('@/lib/firebase/retenciones-recibidas').then(m =>
          m.updateRetencionRecibida(id, { asientoId })
        );
      } else {
        toast.warning('La retención quedó registrada, pero el asiento contable NO se pudo generar. Revísala en Contabilidad → Libro Diario.', { duration: 12000 });
      }

      toast.success('Retención recibida registrada');
      setDialogOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setClienteNombre(''); setClienteIdentificacion(''); setNumeroRetencion('');
    setFechaEmision(format(new Date(), 'yyyy-MM-dd')); setVentaRef('');
    setLineas([nuevaLinea()]);
  }

  const totalRetenido = calcLineas().reduce((s, l) => s + l.valorRetenido, 0);

  return (
    <div>
      <PageHeader
        title="Retenciones Recibidas"
        description="Comprobantes de retención que los clientes nos entregan al pagarnos"
        action={
          <div className="flex gap-2">
            <input ref={xmlRef} type="file" accept=".xml" multiple className="hidden" onChange={handleImportarXML} />
            <Button variant="outline" disabled={importing} onClick={() => xmlRef.current?.click()}
              title="Sube el/los comprobante(s) de retención que te entregó el cliente">
              <Upload className="mr-2 h-4 w-4" /> {importing ? 'Importando…' : 'Importar XML'}
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Registrar Retención
            </Button>
          </div>
        }
      />

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>N° Retención</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Ejercicio</TableHead>
              <TableHead className="text-right">Ret. Fuente</TableHead>
              <TableHead className="text-right">Ret. IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Asiento</TableHead>
              <TableHead>Venta (para ATS)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : retenciones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay retenciones recibidas registradas</p>
                </TableCell>
              </TableRow>
            ) : retenciones.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.numeroRetencion}</TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{r.clienteNombre}</div>
                  <div className="text-xs text-slate-500">{r.clienteIdentificacion}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {r.fechaEmision
                    ? format((r.fechaEmision as any)?.toDate?.() ?? new Date(r.fechaEmision), 'dd/MM/yyyy', { locale: es })
                    : '-'}
                </TableCell>
                <TableCell className="text-sm">{r.ejercicioFiscal}</TableCell>
                <TableCell className="text-right text-sm">{currency(r.retFuente)}</TableCell>
                <TableCell className="text-right text-sm">{currency(r.retIVA)}</TableCell>
                <TableCell className="text-right font-semibold">{currency(r.totalRetenido)}</TableCell>
                <TableCell className="text-center">
                  {r.asientoId
                    ? <Badge variant="default" className="bg-green-100 text-green-700">Sí</Badge>
                    : <Badge variant="secondary">No</Badge>}
                </TableCell>
                <TableCell>
                  {r.ventaId ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">vinculada</span>
                  ) : (
                    <Button variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => abrirVincularVenta(r)}>
                      Vincular venta
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Dialog nueva retención */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Retención Recibida</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Datos cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cliente / Razón Social *</Label>
                <Input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)}
                  placeholder="Nombre del cliente" />
              </div>
              <div className="space-y-1.5">
                <Label>RUC / Cédula *</Label>
                <Input value={clienteIdentificacion} onChange={e => setClienteIdentificacion(e.target.value)}
                  placeholder="1790012345001" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>N° Comprobante Retención *</Label>
                <Input value={numeroRetencion} onChange={e => setNumeroRetencion(e.target.value)}
                  placeholder="001-001-000001" />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha Emisión *</Label>
                <Input type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ejercicio Fiscal</Label>
                <Input value={ejercicioFiscal} onChange={e => setEjercicioFiscal(e.target.value)}
                  placeholder={String(new Date().getFullYear())} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Venta que paga esta retención</Label>
              {(() => {
                const candidatas = clienteIdentificacion
                  ? ventas.filter(v => v.clienteIdentificacion === clienteIdentificacion) : [];
                if (!clienteIdentificacion) {
                  return <p className="text-xs text-slate-400">Ingresa el RUC/cédula del cliente para buscar sus ventas.</p>;
                }
                if (candidatas.length === 0) {
                  return <p className="text-xs text-amber-600">No se encontró ninguna venta con esa identificación — la retención se puede registrar igual, pero no se podrá incluir en el ATS hasta vincularla ("Vincular venta" en la tabla).</p>;
                }
                return (
                  <Select value={ventaRef} onValueChange={setVentaRef}>
                    <SelectTrigger><SelectValue placeholder="Selecciona la venta (opcional)" /></SelectTrigger>
                    <SelectContent>
                      {candidatas.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {format((v.fecha as any)?.toDate?.() ?? new Date(v.fecha), 'dd/MM/yyyy')} — {currency(v.total)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}
            </div>

            {/* Líneas de retención */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Líneas de Retención</Label>
                <Button variant="outline" size="sm" onClick={addLinea}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Agregar Línea
                </Button>
              </div>

              {lineas.map((linea, i) => {
                const lista = linea.tipo === 'fuente_ir' ? CODIGOS_FUENTE : CODIGOS_IVA;
                const cod   = lista.find(c => c.codigo === linea.codigoCodigo) ?? lista[0];
                const base  = parseFloat(linea.baseImponible) || 0;
                const valor = parseFloat((base * cod.porcentaje / 100).toFixed(2));

                return (
                  <div key={i} className="border rounded-lg p-3 space-y-2 bg-slate-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Tipo</Label>
                        <Select value={linea.tipo}
                          onValueChange={v => updateLinea(i, 'tipo', v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fuente_ir">Retención Fuente (IR)</SelectItem>
                            <SelectItem value="iva">Retención IVA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Código</Label>
                        <Select value={linea.codigoCodigo}
                          onValueChange={v => updateLinea(i, 'codigoCodigo', v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {lista.map(c => (
                              <SelectItem key={c.codigo} value={c.codigo}>
                                {c.codigo} — {c.porcentaje}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Base Imponible</Label>
                        <Input
                          type="number" step="0.01" className="h-8 text-sm"
                          value={linea.baseImponible}
                          onChange={e => updateLinea(i, 'baseImponible', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="text-center text-xs text-slate-500">
                        × {cod.porcentaje}%
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-green-700">
                          = {currency(valor)}
                        </span>
                      </div>
                    </div>

                    {lineas.length > 1 && (
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 h-7 px-2"
                        onClick={() => removeLinea(i)}>
                        Eliminar línea
                      </Button>
                    )}
                  </div>
                );
              })}

              <div className="flex justify-end font-semibold text-sm">
                Total retenido: <span className="ml-2 text-green-700">{currency(totalRetenido)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar Retención'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog vincular con la venta */}
      <Dialog open={!!vincularRet} onOpenChange={(o) => !o && setVincularRet(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular con la venta</DialogTitle>
          </DialogHeader>
          {vincularRet && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Sin la venta vinculada, el ATS no puede sumarle esta retención al comprobante que
                corresponde. Elegí la venta de <strong>{vincularRet.clienteNombre}</strong> que esta
                retención está pagando.
              </p>
              {ventasCandidatas.length === 0 ? (
                <p className="text-sm text-amber-600">
                  No se encontró ninguna venta registrada con la identificación {vincularRet.clienteIdentificacion}.
                </p>
              ) : (
                <Select value={ventaElegida} onValueChange={setVentaElegida}>
                  <SelectTrigger><SelectValue placeholder="Selecciona la venta" /></SelectTrigger>
                  <SelectContent>
                    {ventasCandidatas.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {format((v.fecha as any)?.toDate?.() ?? new Date(v.fecha), 'dd/MM/yyyy')} — {currency(v.total)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVincularRet(null)} disabled={savingVincularVenta}>Cancelar</Button>
            <Button onClick={guardarVinculoVenta} disabled={savingVincularVenta || ventasCandidatas.length === 0}>
              {savingVincularVenta ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
