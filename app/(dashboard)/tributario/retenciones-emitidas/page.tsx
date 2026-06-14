'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Send, FileCheck, Trash2, Download } from 'lucide-react';
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

import { RetencionEmitida, FacturaProveedor, ConfigRetencion } from '@/types';
import { subscribeToRetencionesEmitidas, createRetencionEmitida } from '@/lib/firebase/retenciones-emitidas';
import { subscribeToFacturasProveedor }  from '@/lib/firebase/facturas-proveedor';
import { subscribeToRetenciones }        from '@/lib/firebase/retenciones-config';
import { getConfigSRI, incrementarSecuencial } from '@/lib/firebase/config-sri';
import { getConfigEmpresa }              from '@/lib/firebase/config-empresa';
import { generarClaveAcceso }            from '@/lib/sri/clave-acceso';
import { generarXMLRetencion }           from '@/lib/sri/generador-retencion';
import { crearAsientoRetencionEmitida }  from '@/lib/contabilidad/motor-asientos';
import { descargarRIDE }                 from '@/lib/sri/ride-pdf';
import { buildRIDERetencion }            from '@/lib/sri/ride-builders';
import { useAuth }                       from '@/context/AuthContext';

const currency = (v: number) => `$${v.toFixed(2)}`;

const BADGE_ESTADO: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-700',
  autorizado: 'bg-green-100 text-green-700',
  rechazado:  'bg-red-100 text-red-700',
};

interface LineaForm {
  tipo:          'fuente_ir' | 'iva';
  codigoId:      string;
  baseImponible: string;
}

export default function RetencionesEmitidasPage() {
  const { user } = useAuth();
  const [retenciones,  setRetenciones]  = useState<RetencionEmitida[]>([]);
  const [facturas,     setFacturas]     = useState<FacturaProveedor[]>([]);
  const [configRet,    setConfigRet]    = useState<ConfigRetencion[]>([]);
  const [loading,      setLoading]      = useState(true);

  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [facturaSel,   setFacturaSel]   = useState('');
  const [lineas,       setLineas]       = useState<LineaForm[]>([{ tipo: 'fuente_ir', codigoId: '', baseImponible: '' }]);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    const u1 = subscribeToRetencionesEmitidas(d => { setRetenciones(d); setLoading(false); });
    const u2 = subscribeToFacturasProveedor(setFacturas);
    const u3 = subscribeToRetenciones(setConfigRet);
    return () => { u1(); u2(); u3(); };
  }, []);

  const facturasDisponibles = useMemo(
    () => facturas.filter(f => f.estado !== 'pagada'),
    [facturas]
  );

  const facturaSelObj = useMemo(
    () => facturas.find(f => f.id === facturaSel) ?? null,
    [facturas, facturaSel]
  );

  const codigosPorTipo = (tipo: 'fuente_ir' | 'iva') =>
    configRet.filter(c => c.tipo === tipo && c.activo);

  const addLinea = () => setLineas(l => [...l, { tipo: 'fuente_ir', codigoId: '', baseImponible: '' }]);
  const removeLinea = (i: number) => setLineas(l => l.filter((_, idx) => idx !== i));
  const updateLinea = (i: number, field: keyof LineaForm, v: string) =>
    setLineas(l => l.map((x, idx) => idx === i ? { ...x, [field]: v } : x));

  const totalRetenido = useMemo(() => {
    return lineas.reduce((s, l) => {
      const cfg  = configRet.find(c => c.id === l.codigoId);
      const base = parseFloat(l.baseImponible) || 0;
      return s + (cfg ? base * (cfg.porcentaje / 100) : 0);
    }, 0);
  }, [lineas, configRet]);

  const handleEmitir = async () => {
    if (!user) return;
    if (!facturaSel) { toast.error('Selecciona la factura del proveedor'); return; }
    if (lineas.some(l => !l.codigoId || !l.baseImponible)) {
      toast.error('Completa todas las líneas de retención');
      return;
    }

    setSaving(true);
    try {
      const configSRI = await getConfigSRI();
      const configEmp = await getConfigEmpresa();
      if (!configSRI) throw new Error('Configure primero los datos SRI');
      if (!configSRI.agenteRetencion) throw new Error('No está configurado como agente de retención');

      const factura = facturas.find(f => f.id === facturaSel)!;
      const secuencial   = await incrementarSecuencial('secuencialRetencion');
      const fechaEmision = new Date();
      const claveAcceso  = generarClaveAcceso({
        fecha:           fechaEmision,
        tipoComprobante: '07',
        ruc:             configSRI.ruc,
        ambiente:        configSRI.ambiente,
        establecimiento: configSRI.establecimiento,
        puntoEmision:    configSRI.puntoEmision,
        secuencial,
      });

      const numeroRet = `${configSRI.establecimiento.padStart(3,'0')}-${configSRI.puntoEmision.padStart(3,'0')}-${String(secuencial).padStart(9,'0')}`;
      const periodoFiscal = `${String(fechaEmision.getMonth()+1).padStart(2,'0')}/${fechaEmision.getFullYear()}`;

      const fechaFactura = (factura.fechaEmision as any)?.toDate?.() ?? new Date(factura.fechaEmision);
      const fechaFactStr = `${String(fechaFactura.getDate()).padStart(2,'0')}/${String(fechaFactura.getMonth()+1).padStart(2,'0')}/${fechaFactura.getFullYear()}`;

      const lineasXML = lineas.map(l => {
        const cfg  = configRet.find(c => c.id === l.codigoId)!;
        const base = parseFloat(l.baseImponible) || 0;
        return {
          tipo:          cfg.tipo,
          codigo:        cfg.codigo,
          porcentaje:    cfg.porcentaje,
          baseImponible: base,
          valorRetenido: parseFloat((base * cfg.porcentaje / 100).toFixed(2)),
        };
      });

      const tipoId = factura.proveedorRuc.length === 13 ? '04' : '05';
      // numDocSustento debe ir a 15 dígitos sin guiones (estab+ptoEmi+secuencial)
      const numDocSustento = factura.numeroFactura.replace(/\D/g, '').padStart(15, '0').slice(-15);

      const xml = generarXMLRetencion({
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
        tipoIdSujetoRetenido: tipoId,
        identificacionSujeto: factura.proveedorRuc,
        razonSocialSujeto:    factura.proveedorNombre,
        periodoFiscal,
        codDocSustento:          '01',
        numDocSustento,
        fechaEmisionDocSustento: fechaFactStr,
        totalSinImpuestos:       factura.subtotal12 + factura.subtotal0,
        importeTotal:            factura.total,
        lineas:                  lineasXML,
      });

      const resp = await fetch('/api/sri/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xml,
          p12Base64: configSRI.certificadoP12,
          password:  configSRI.certificadoPassword,
          claveAcceso,
          ambiente:  configSRI.ambiente,
        }),
      });
      const result = await resp.json();

      const estado: RetencionEmitida['estado'] =
        result.estado === 'AUTORIZADO' ? 'autorizado' :
        result.estado === 'DEVUELTA'   ? 'rechazado'  : 'pendiente';

      const retFuente = lineasXML
        .filter(l => l.tipo === 'fuente_ir')
        .reduce((s, l) => s + l.valorRetenido, 0);
      const retIVAVal = lineasXML
        .filter(l => l.tipo === 'iva')
        .reduce((s, l) => s + l.valorRetenido, 0);

      const lineasGuardar = lineasXML.map(l => ({
        id:            `ret-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        tipo:          l.tipo,
        codigo:        l.codigo,
        descripcion:   configRet.find(c => c.codigo === l.codigo)?.descripcion ?? l.codigo,
        porcentaje:    l.porcentaje,
        baseImponible: l.baseImponible,
        valorRetenido: l.valorRetenido,
      }));

      const retencionId = await createRetencionEmitida({
        facturaProveedorId:     facturaSel,
        numeroFacturaProveedor: factura.numeroFactura,
        proveedorId:            factura.proveedorId,
        proveedorNombre:        factura.proveedorNombre,
        proveedorRuc:           factura.proveedorRuc,
        fechaFactura:           fechaFactura,
        secuencial:             numeroRet,
        claveAcceso,
        estado,
        numeroAutorizacion: result.numeroAutorizacion,
        fechaAutorizacion:  result.fechaAutorizacion ? new Date(result.fechaAutorizacion) : undefined,
        fechaEmision,
        ejercicioFiscal:    periodoFiscal,
        lineas:             lineasGuardar,
        totalRetenido,
        xmlUrl:       result.xmlAutorizado ?? result.xmlFirmadoB64,
        usuarioId:    user.uid,
        usuarioNombre:user.nombre ?? user.email ?? 'Usuario',
      });

      // Asiento contable
      await crearAsientoRetencionEmitida({
        retencionId,
        fecha:           fechaEmision,
        proveedorNombre: factura.proveedorNombre,
        totalRetenido,
        retFuente,
        retIVA:          retIVAVal,
        usuarioId:       user.uid,
        usuarioNombre:   user.nombre ?? user.email ?? 'Usuario',
      });

      if (estado === 'autorizado') {
        toast.success(`Retención ${numeroRet} autorizada por SRI`);
      } else if (estado === 'rechazado') {
        toast.warning(`SRI rechazó: ${result.mensajes?.join(', ') ?? ''}`);
      } else {
        toast.info('Retención guardada — ' + (result.mensajes?.join(', ') ?? ''));
      }

      setDialogOpen(false);
      setFacturaSel('');
      setLineas([{ tipo: 'fuente_ir', codigoId: '', baseImponible: '' }]);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al emitir retención');
    } finally {
      setSaving(false);
    }
  };

  const descargarRide = async (ret: RetencionEmitida) => {
    try {
      const config = await getConfigSRI();
      if (!config) { toast.error('Configura los datos del SRI primero'); return; }
      descargarRIDE(buildRIDERetencion(ret, config));
    } catch (e: any) {
      toast.error(`Error al generar RIDE: ${e.message ?? 'desconocido'}`);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Retenciones Emitidas"
        description="Comprobantes de retención electrónicos a proveedores"
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva Retención
          </Button>
        }
      />

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>N° Retención</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Factura origen</TableHead>
              <TableHead>Fecha emisión</TableHead>
              <TableHead className="text-right">Total retenido</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}</TableRow>
              ))
            ) : retenciones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                  <FileCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No hay retenciones emitidas.
                </TableCell>
              </TableRow>
            ) : retenciones.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.secuencial}</TableCell>
                <TableCell>
                  <p className="font-medium text-sm">{r.proveedorNombre}</p>
                  <p className="text-xs text-slate-400">{r.proveedorRuc}</p>
                </TableCell>
                <TableCell className="text-sm text-slate-500">{r.numeroFacturaProveedor}</TableCell>
                <TableCell className="text-sm text-slate-500">
                  {format((r.fechaEmision as any)?.toDate?.() ?? new Date(r.fechaEmision), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell className="text-right font-semibold">{currency(r.totalRetenido)}</TableCell>
                <TableCell className="text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_ESTADO[r.estado] ?? ''}`}>
                    {r.estado}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Descargar RIDE"
                    onClick={() => descargarRide(r)}>
                    <Download className="h-4 w-4" />
                  </Button>
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
            <DialogTitle>Emitir Comprobante de Retención</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Factura del proveedor *</Label>
              <Select value={facturaSel} onValueChange={setFacturaSel}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccionar factura…" />
                </SelectTrigger>
                <SelectContent>
                  {facturasDisponibles.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.numeroFactura} — {f.proveedorNombre} — {currency(f.total)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {facturaSelObj && (
                <p className="text-xs text-slate-400 mt-1">
                  Subtotal sin IVA: {currency(facturaSelObj.subtotal12 + facturaSelObj.subtotal0)}
                  &nbsp;|&nbsp;IVA: {currency(facturaSelObj.iva)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Líneas de retención *</Label>
                <Button variant="outline" size="sm" onClick={addLinea}>+ Agregar</Button>
              </div>
              {lineas.map((l, i) => {
                const cfg   = configRet.find(c => c.id === l.codigoId);
                const base  = parseFloat(l.baseImponible) || 0;
                const valor = cfg ? (base * cfg.porcentaje / 100).toFixed(2) : '0.00';
                return (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex gap-2">
                      <Select value={l.tipo} onValueChange={v => updateLinea(i, 'tipo', v)}>
                        <SelectTrigger className="w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fuente_ir">IR Fuente</SelectItem>
                          <SelectItem value="iva">IVA</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={l.codigoId} onValueChange={v => updateLinea(i, 'codigoId', v)}>
                        <SelectTrigger className="flex-1 text-xs">
                          <SelectValue placeholder="Código retención…" />
                        </SelectTrigger>
                        <SelectContent>
                          {codigosPorTipo(l.tipo).map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.codigo} — {c.porcentaje}% — {c.descripcion}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {lineas.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500"
                          onClick={() => removeLinea(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Base imponible"
                        value={l.baseImponible}
                        onChange={e => updateLinea(i, 'baseImponible', e.target.value)}
                        className="text-sm"
                      />
                      {cfg && (
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          Ret: <strong>${valor}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="text-right text-sm font-semibold text-slate-700">
                Total retenido: {currency(totalRetenido)}
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
