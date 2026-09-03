'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, FileCheck, Upload, ChevronDown, CreditCard,
  FileSearch, AlertTriangle, CheckCircle2, Clock, Download, Files, Mail, Ban, Banknote,
  FileSpreadsheet, UserPlus, XCircle,
} from 'lucide-react';

import PageHeader   from '@/components/shared/PageHeader';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator }from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import {
  crearAsientoPago, crearAsientoCompraFactura,
  crearAsientoNotaCreditoRecibida, crearAsientoNotaDebitoRecibida,
  crearAsientoRetencionRecibida, crearAsientoReversion,
} from '@/lib/contabilidad/motor-asientos';
import { FacturaProveedor, Proveedor } from '@/types';
import {
  subscribeToFacturasProveedor,
  createFacturaProveedor,
  updateFacturaProveedor,
  registrarPago,
} from '@/lib/firebase/facturas-proveedor';
import { createDocRecibido } from '@/lib/firebase/docs-recibidos';
import { createRetencionRecibida } from '@/lib/firebase/retenciones-recibidas';
import { subscribeToProveedores, getOrCreateProveedorPorRuc } from '@/lib/firebase/proveedores';
import { getConfigEmail } from '@/lib/firebase/config-email';
import {
  parsearFacturaXML, extraerIVAdeXML, detectarTipoComprobante,
  parsearNotaCreditoXML, parsearNotaDebitoXML, parsearRetencionXML,
} from '@/lib/sri/xmlParser';
import { descargarZip } from '@/lib/utils/zip';
import {
  BancoPago, PagoBancario, BANCOS_PAGO, descargarTxtPagos,
} from '@/lib/bancos/pagos-txt';
import { useAuth } from '@/context/AuthContext';

const facturaSchema = z.object({
  proveedorId:      z.string().min(1, 'Selecciona un proveedor'),
  numeroFactura:    z.string().min(1, 'Requerido'),
  claveAcceso:      z.string().optional(),
  fechaEmision:     z.string().min(1, 'Requerida'),
  fechaVencimiento: z.string().optional(),
  subtotal12:       z.coerce.number().min(0),
  subtotal0:        z.coerce.number().min(0),
  iva:              z.coerce.number().min(0),
  total:            z.coerce.number().min(0.01, 'El total debe ser mayor a 0'),
  notas:            z.string().optional(),
});

const pagoSchema = z.object({
  monto:      z.coerce.number().min(0.01, 'El monto debe ser mayor a 0'),
  metodoPago: z.enum(['efectivo', 'tarjeta', 'transferencia']),
  referencia: z.string().optional(),
});

type FacturaForm = z.infer<typeof facturaSchema>;
type PagoForm    = z.infer<typeof pagoSchema>;

const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-50 text-amber-700',  icon: Clock },
  parcial:   { label: 'Parcial',   color: 'bg-blue-50 text-blue-700',    icon: CreditCard },
  pagada:    { label: 'Pagada',    color: 'bg-green-50 text-green-700',  icon: CheckCircle2 },
  vencida:   { label: 'Vencida',   color: 'bg-red-50 text-red-700',      icon: AlertTriangle },
  anulada:   { label: 'Anulada',   color: 'bg-slate-100 text-slate-500', icon: Ban },
};

function currency(v: number) { return `$${v.toFixed(2)}`; }
function formatFecha(fecha: any) {
  const d = fecha?.toDate?.() ?? new Date(fecha);
  return format(d, 'dd/MM/yyyy', { locale: es });
}

// ── Importación del reporte "Comprobantes Recibidos" (TXT/TSV) del SRI ──
interface FilaRecibidoTxt {
  rucEmisor: string;
  razonSocialEmisor: string;
  tipoComprobante: string;
  serieComprobante: string;
  claveAcceso: string;
  fechaEmision: string;
  valorSinImpuestos: number;
  iva: number;
  importeTotal: number;
  estado: 'nueva' | 'duplicada' | 'no_soportado';
  proveedorNuevo: boolean;
}

function parseRecibidosTxt(
  texto: string,
  clavesExistentes: Set<string>,
  rucsExistentes: Set<string>
): FilaRecibidoTxt[] {
  const lineas = texto.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lineas.length < 2) return [];

  const headers = lineas[0].split('\t').map(h => h.trim().toUpperCase());
  const idx = (col: string) => headers.indexOf(col);
  const iRuc = idx('RUC_EMISOR'), iRazon = idx('RAZON_SOCIAL_EMISOR'),
    iTipo = idx('TIPO_COMPROBANTE'), iSerie = idx('SERIE_COMPROBANTE'),
    iClave = idx('CLAVE_ACCESO'), iFecha = idx('FECHA_EMISION'),
    iBase = idx('VALOR_SIN_IMPUESTOS'), iIva = idx('IVA'), iTotal = idx('IMPORTE_TOTAL');

  if (iRuc < 0 || iClave < 0 || iTotal < 0) return [];

  const clavesVistas = new Set(clavesExistentes);
  const rucsVistos = new Set(rucsExistentes);
  const filas: FilaRecibidoTxt[] = [];

  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split('\t').map(c => c.trim());
    const claveAcceso = cols[iClave] ?? '';
    const rucEmisor = cols[iRuc] ?? '';
    const tipoComprobante = cols[iTipo] ?? '';
    if (!rucEmisor || !claveAcceso) continue;

    const esFactura = tipoComprobante.trim().toLowerCase() === 'factura';
    const yaExiste = clavesVistas.has(claveAcceso);
    const estado: FilaRecibidoTxt['estado'] = yaExiste
      ? 'duplicada' : !esFactura
      ? 'no_soportado' : 'nueva';

    if (estado === 'nueva') clavesVistas.add(claveAcceso);
    const proveedorNuevo = estado === 'nueva' && !rucsVistos.has(rucEmisor);
    if (proveedorNuevo) rucsVistos.add(rucEmisor);

    filas.push({
      rucEmisor,
      razonSocialEmisor: cols[iRazon] ?? '',
      tipoComprobante,
      serieComprobante: cols[iSerie] ?? '',
      claveAcceso,
      fechaEmision: cols[iFecha] ?? '',
      valorSinImpuestos: parseFloat(cols[iBase]) || 0,
      iva: parseFloat(cols[iIva]) || 0,
      importeTotal: parseFloat(cols[iTotal]) || 0,
      estado,
      proveedorNuevo,
    });
  }
  return filas;
}

export default function FacturasProveedorPage() {
  const { user } = useAuth();

  const [facturas,     setFacturas]     = useState<FacturaProveedor[]>([]);
  const [proveedores,  setProveedores]  = useState<Proveedor[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [pagoDialog,   setPagoDialog]   = useState<FacturaProveedor | null>(null);
  const [detailDialog, setDetailDialog] = useState<FacturaProveedor | null>(null);
  const [xmlDialog,    setXmlDialog]    = useState(false);
  const [xmlPreview,   setXmlPreview]   = useState<any>(null);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [bulkImporting, setBulkImporting] = useState(false);
  const xmlRef  = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  // Importación TXT "Comprobantes Recibidos" del SRI
  const [txtDialogOpen, setTxtDialogOpen] = useState(false);
  const [txtFilas,      setTxtFilas]      = useState<FilaRecibidoTxt[]>([]);
  const [txtImporting,  setTxtImporting]  = useState(false);
  const [txtProgreso,   setTxtProgreso]   = useState(0);
  const txtRef = useRef<HTMLInputElement>(null);

  // Pago bancario por archivo TXT
  const [pagoBancoOpen, setPagoBancoOpen] = useState(false);
  const [bancoSel,      setBancoSel]      = useState<BancoPago>('pichincha');
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [procesandoPago,setProcesandoPago]= useState(false);

  const facturaForm = useForm<FacturaForm>({ resolver: zodResolver(facturaSchema) as any });
  const pagoForm    = useForm<PagoForm>({
    resolver: zodResolver(pagoSchema) as any,
    defaultValues: { metodoPago: 'transferencia' },
  });

  useEffect(() => {
    const u1 = subscribeToFacturasProveedor((d) => { setFacturas(d); setLoading(false); });
    const u2 = subscribeToProveedores(setProveedores);
    return () => { u1(); u2(); };
  }, []);

  const stats = {
    totalPendiente: facturas.filter(f => f.estado !== 'pagada').reduce((s, f) => s + f.saldoPendiente, 0),
    vencidas:       facturas.filter(f => f.estado === 'vencida').length,
    pendientes:     facturas.filter(f => f.estado === 'pendiente' || f.estado === 'parcial').length,
    pagadas:        facturas.filter(f => f.estado === 'pagada').length,
  };

  const filtered = facturas.filter(f => {
    const matchSearch = !search || f.proveedorNombre.toLowerCase().includes(search.toLowerCase()) ||
      f.numeroFactura.includes(search);
    const matchEstado = filtroEstado === 'todos' || f.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

  const openCreate = () => {
    facturaForm.reset({
      proveedorId: '', numeroFactura: '', claveAcceso: '',
      fechaEmision: new Date().toISOString().split('T')[0],
      fechaVencimiento: '', subtotal12: 0, subtotal0: 0, iva: 0, total: 0, notas: '',
    });
    setDialogOpen(true);
  };

  const onSaveFactura = async (data: FacturaForm) => {
    if (!user) return;
    setSaving(true);
    try {
      const prov = proveedores.find(p => p.id === data.proveedorId);
      await createFacturaProveedor({
        proveedorId:      data.proveedorId,
        proveedorNombre:  prov?.nombre ?? '',
        proveedorRuc:     prov?.ruc    ?? '',
        numeroFactura:    data.numeroFactura,
        ...(data.claveAcceso ? { claveAcceso: data.claveAcceso } : {}),
        fechaEmision:     new Date(data.fechaEmision),
        fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : undefined,
        subtotal12:       data.subtotal12,
        subtotal0:        data.subtotal0,
        iva:              data.iva,
        total:            data.total,
        saldoPendiente:   data.total,
        estado:           'pendiente',
        pagos:            [],
        ...(data.notas ? { notas: data.notas } : {}),
        usuarioId:        user.uid,
        usuarioNombre:    user.nombre,
        createdAt:        new Date(),
      });
      toast.success('Factura registrada');
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al guardar la factura');
    } finally {
      setSaving(false);
    }
  };

  const onSavePago = async (data: PagoForm) => {
    if (!pagoDialog || !user) return;
    if (data.monto > pagoDialog.saldoPendiente) {
      toast.error(`El monto supera el saldo pendiente (${currency(pagoDialog.saldoPendiente)})`);
      return;
    }
    setSaving(true);
    try {
      await registrarPago(pagoDialog.id, {
        fecha:         new Date(),
        monto:         data.monto,
        metodoPago:    data.metodoPago,
        ...(data.referencia ? { referencia: data.referencia } : {}),
        usuarioId:     user.uid,
        usuarioNombre: user.nombre,
      });

      toast.success('Pago registrado');

      // ── Motor contable automático (background) ──
      crearAsientoPago({
        facturaId:       pagoDialog.id,
        fecha:           new Date(),
        proveedorNombre: pagoDialog.proveedorNombre,
        monto:           data.monto,
        usuarioId:       user.uid,
        usuarioNombre:   user.nombre,
      }).catch(() => {});

      setPagoDialog(null);
      pagoForm.reset({ metodoPago: 'transferencia' });
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar pago');
    } finally {
      setSaving(false);
    }
  };

  const handleXMLUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const xml  = ev.target?.result as string;
      const data = parsearFacturaXML(xml);
      const iva  = extraerIVAdeXML(xml);
      if (!data) { toast.error('No se pudo leer el XML del SRI'); return; }
      setXmlPreview({ data, iva, xmlRaw: xml });
      setXmlDialog(true);
    };
    reader.readAsText(file);
    if (xmlRef.current) xmlRef.current.value = '';
  };

  const confirmarImportXML = async () => {
    if (!xmlPreview || !user) return;
    setSaving(true);
    try {
      const existentes = new Set(facturas.map(f => f.claveAcceso).filter(Boolean) as string[]);
      const r = await procesarXmlRecibido(xmlPreview.xmlRaw, existentes);
      if (r === 'ok')                 toast.success('Factura importada — proveedor y asiento de compra generados');
      else if (r === 'ok_sin_asiento')toast.warning('Factura importada, pero el asiento contable NO se pudo generar. Revísala en Libro Diario.', { duration: 10000 });
      else if (r === 'dup')           toast.warning('Esta factura ya estaba registrada (clave de acceso duplicada)');
      else                            toast.error('No se pudo importar la factura');
      setXmlDialog(false);
      setXmlPreview(null);
    } catch {
      toast.error('Error al importar la factura');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Procesa un XML recibido: parsea, evita duplicados, crea (o reutiliza) el
   * proveedor por RUC, registra la factura y genera el asiento de compra.
   * Devuelve 'ok' | 'dup' | 'err'.
   */
  const parseFecha = (s: string): Date => {
    const [dd, MM, yyyy] = (s || '').split('/');
    return yyyy ? new Date(`${yyyy}-${MM}-${dd}`) : new Date();
  };

  const procesarXmlRecibido = async (
    xml: string,
    existentes: Set<string>
  ): Promise<'ok' | 'ok_sin_asiento' | 'dup' | 'err' | 'omitido'> => {
    if (!user) return 'err';
    const tipo = detectarTipoComprobante(xml);

    try {
      // ── FACTURA → CxP + asiento de compra ──
      if (tipo === 'factura') {
        const data = parsearFacturaXML(xml);
        if (!data) return 'err';
        const it = data.infoTributaria, inf = data.infoFactura;
        const clave = it.claveAcceso;
        if (clave && existentes.has(clave)) return 'dup';
        const numDoc   = `${it.estab}-${it.ptoEmi}-${it.secuencial}`;
        const iva      = extraerIVAdeXML(xml);
        const subtotal = Number(inf.totalSinImpuestos) || 0;
        const total    = Number(inf.importeTotal) || 0;
        const fechaEmision = parseFecha(inf.fechaEmision);
        const prov = await getOrCreateProveedorPorRuc(it.ruc, it.razonSocial);

        const facturaId = await createFacturaProveedor({
          proveedorId: prov.id, proveedorNombre: it.razonSocial, proveedorRuc: it.ruc,
          numeroFactura: numDoc, claveAcceso: clave, fechaEmision,
          subtotal12: subtotal, subtotal0: 0, iva, total, saldoPendiente: total,
          estado: 'pendiente', pagos: [], xmlData: data, xmlRaw: xml,
          usuarioId: user.uid, usuarioNombre: user.nombre, createdAt: new Date(),
        });
        const asientoId = await crearAsientoCompraFactura({
          facturaId, fecha: fechaEmision, proveedorNombre: it.razonSocial,
          subtotal, iva, total, usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        if (clave) existentes.add(clave);
        return asientoId ? 'ok' : 'ok_sin_asiento';
      }

      // ── NOTA DE CRÉDITO recibida → reversa de compra ──
      if (tipo === 'nota_credito') {
        const d = parsearNotaCreditoXML(xml);
        if (!d) return 'err';
        if (d.claveAcceso && existentes.has(d.claveAcceso)) return 'dup';
        const prov = await getOrCreateProveedorPorRuc(d.ruc, d.razonSocial);
        const docId = await createDocRecibido({
          tipo: 'nota_credito', proveedorId: prov.id, proveedorNombre: d.razonSocial,
          proveedorRuc: d.ruc, numero: `${d.estab}-${d.ptoEmi}-${d.secuencial}`,
          claveAcceso: d.claveAcceso, docModificado: d.docModificado,
          fechaEmision: parseFecha(d.fechaEmision),
          subtotal: d.subtotal, iva: d.iva, total: d.total,
          xmlRaw: xml, usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        const asientoNcId = await crearAsientoNotaCreditoRecibida({
          docId, fecha: parseFecha(d.fechaEmision), proveedorNombre: d.razonSocial,
          subtotal: d.subtotal, iva: d.iva, total: d.total,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        if (d.claveAcceso) existentes.add(d.claveAcceso);
        return asientoNcId ? 'ok' : 'ok_sin_asiento';
      }

      // ── NOTA DE DÉBITO recibida → aumenta CxP ──
      if (tipo === 'nota_debito') {
        const d = parsearNotaDebitoXML(xml);
        if (!d) return 'err';
        if (d.claveAcceso && existentes.has(d.claveAcceso)) return 'dup';
        const prov = await getOrCreateProveedorPorRuc(d.ruc, d.razonSocial);
        const docId = await createDocRecibido({
          tipo: 'nota_debito', proveedorId: prov.id, proveedorNombre: d.razonSocial,
          proveedorRuc: d.ruc, numero: `${d.estab}-${d.ptoEmi}-${d.secuencial}`,
          claveAcceso: d.claveAcceso, docModificado: d.docModificado,
          fechaEmision: parseFecha(d.fechaEmision),
          subtotal: d.subtotal, iva: d.iva, total: d.total,
          xmlRaw: xml, usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        const asientoNdId = await crearAsientoNotaDebitoRecibida({
          docId, fecha: parseFecha(d.fechaEmision), proveedorNombre: d.razonSocial,
          subtotal: d.subtotal, iva: d.iva, total: d.total,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        if (d.claveAcceso) existentes.add(d.claveAcceso);
        return asientoNdId ? 'ok' : 'ok_sin_asiento';
      }

      // ── RETENCIÓN recibida (un cliente nos retuvo) ──
      if (tipo === 'retencion') {
        const d = parsearRetencionXML(xml);
        if (!d) return 'err';
        if (d.claveAcceso && existentes.has(d.claveAcceso)) return 'dup';
        const numeroRet = `${d.estab}-${d.ptoEmi}-${d.secuencial}`;
        const retId = await createRetencionRecibida({
          ventaId: '', numeroComprobante: '',
          clienteId: '', clienteNombre: d.razonSocial, clienteIdentificacion: d.ruc,
          numeroRetencion: numeroRet, claveAcceso: d.claveAcceso, fechaEmision: parseFecha(d.fechaEmision),
          ejercicioFiscal: d.periodoFiscal,
          lineas: d.lineas.map(l => ({
            tipo: l.tipo, codigo: l.codigo, descripcion: l.codigo,
            porcentaje: l.porcentaje, baseImponible: l.baseImponible, valorRetenido: l.valorRetenido,
          })),
          totalRetenido: d.totalRetenido, retFuente: d.retFuente, retIVA: d.retIVA,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        const asientoRetId = await crearAsientoRetencionRecibida({
          retencionId: retId, fecha: parseFecha(d.fechaEmision), clienteNombre: d.razonSocial,
          retFuente: d.retFuente, retIVA: d.retIVA, totalRetenido: d.totalRetenido,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        if (d.claveAcceso) existentes.add(d.claveAcceso);
        return asientoRetId ? 'ok' : 'ok_sin_asiento';
      }

      return 'omitido'; // liquidación / desconocido
    } catch (e: any) {
      if (/ya está registrad[oa]/.test(String(e?.message ?? ''))) return 'dup';
      return 'err';
    }
  };

  // ── Carga MASIVA de XMLs recibidos (los descargados del portal del SRI) ──
  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !user) return;
    setBulkImporting(true);
    let ok = 0, dup = 0, err = 0, omit = 0, sinAsiento = 0;
    const existentes = new Set(facturas.map(f => f.claveAcceso).filter(Boolean) as string[]);
    for (const file of files) {
      const r = await procesarXmlRecibido(await file.text(), existentes);
      if (r === 'ok') ok++;
      else if (r === 'ok_sin_asiento') { ok++; sinAsiento++; }
      else if (r === 'dup') dup++;
      else if (r === 'omitido') omit++;
      else err++;
    }
    toast.success(
      `Importadas: ${ok} · Duplicadas: ${dup}` +
      `${omit ? ` · Omitidas (NC/ND/retención): ${omit}` : ''}${err ? ` · Con error: ${err}` : ''}`
    );
    if (sinAsiento > 0) {
      toast.warning(`${sinAsiento} factura(s) se importaron pero NO generaron asiento contable. Revísalas en Libro Diario.`, { duration: 12000 });
    }
    setBulkImporting(false);
    if (bulkRef.current) bulkRef.current.value = '';
  };

  // ── Importar el reporte "Comprobantes Recibidos" (TXT) descargado del SRI ──
  const handleTxtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const texto = ev.target?.result as string;
      const clavesExistentes = new Set(facturas.map(f => f.claveAcceso).filter(Boolean) as string[]);
      const rucsExistentes   = new Set(proveedores.map(p => p.ruc));
      const filas = parseRecibidosTxt(texto, clavesExistentes, rucsExistentes);
      if (filas.length === 0) {
        toast.error('No se reconoció el formato. Verifica que sea el TXT de "Comprobantes Recibidos" del SRI.');
        return;
      }
      setTxtFilas(filas);
      setTxtDialogOpen(true);
    };
    reader.readAsText(file);
    if (txtRef.current) txtRef.current.value = '';
  };

  const confirmarImportTxt = async () => {
    if (!user) return;
    const pendientes = txtFilas.filter(f => f.estado === 'nueva');
    if (pendientes.length === 0) { setTxtDialogOpen(false); return; }

    setTxtImporting(true);
    setTxtProgreso(0);
    let ok = 0, err = 0, proveedoresCreados = 0;
    const facturasSinAsiento: string[] = [];

    for (let i = 0; i < pendientes.length; i++) {
      const f = pendientes[i];
      try {
        const yaExistia = proveedores.some(p => p.ruc === f.rucEmisor);
        const prov = await getOrCreateProveedorPorRuc(f.rucEmisor, f.razonSocialEmisor);
        if (!yaExistia) proveedoresCreados++;

        const fechaEmision = parseFecha(f.fechaEmision);
        const subtotal12 = f.iva > 0 ? f.valorSinImpuestos : 0;
        const subtotal0  = f.iva > 0 ? 0 : f.valorSinImpuestos;

        const facturaId = await createFacturaProveedor({
          proveedorId: prov.id, proveedorNombre: f.razonSocialEmisor, proveedorRuc: f.rucEmisor,
          numeroFactura: f.serieComprobante, claveAcceso: f.claveAcceso, fechaEmision,
          subtotal12, subtotal0, iva: f.iva, total: f.importeTotal, saldoPendiente: f.importeTotal,
          estado: 'pendiente', pagos: [],
          notas: 'Importado desde reporte de Comprobantes Recibidos del SRI',
          usuarioId: user.uid, usuarioNombre: user.nombre, createdAt: new Date(),
        });
        const asientoId = await crearAsientoCompraFactura({
          facturaId, fecha: fechaEmision, proveedorNombre: f.razonSocialEmisor,
          subtotal: f.valorSinImpuestos, iva: f.iva, total: f.importeTotal,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        if (!asientoId) facturasSinAsiento.push(`${f.razonSocialEmisor} (${f.serieComprobante})`);
        ok++;
      } catch {
        err++;
      }
      setTxtProgreso(i + 1);
    }

    toast.success(
      `Importadas: ${ok}${err ? ` · Con error: ${err}` : ''}` +
      `${proveedoresCreados ? ` · Proveedores nuevos creados: ${proveedoresCreados}` : ''}`
    );
    if (facturasSinAsiento.length > 0) {
      toast.warning(
        `${facturasSinAsiento.length} factura(s) se importaron pero NO generaron asiento contable: ` +
        `${facturasSinAsiento.slice(0, 5).join(', ')}${facturasSinAsiento.length > 5 ? '…' : ''}. ` +
        `Revísalas en Contabilidad → Libro Diario, o edítalas para forzar el recálculo del asiento.`,
        { duration: 15000 }
      );
    }
    setTxtImporting(false);
    setTxtDialogOpen(false);
    setTxtFilas([]);
  };

  // ── Traer facturas directamente del CORREO (IMAP) sin entrar al SRI ──
  const handleImportarCorreo = async () => {
    if (!user) return;
    const cfg = await getConfigEmail();
    if (!cfg?.email || !cfg?.password) {
      toast.error('Configura tu correo en Configuración → Correo primero');
      return;
    }
    setBulkImporting(true);
    try {
      const resp = await fetch('/api/email/recibidos', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ smtp: cfg, sinceDays: 30 }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error ?? 'Error al leer el correo');

      const xmls: { filename: string; xml: string }[] = result.xmls ?? [];
      if (xmls.length === 0) {
        toast.info('No se encontraron XML de facturas en el correo (últimos 30 días)');
        return;
      }
      let ok = 0, dup = 0, err = 0, omit = 0, sinAsiento = 0;
      const existentes = new Set(facturas.map(f => f.claveAcceso).filter(Boolean) as string[]);
      for (const item of xmls) {
        const r = await procesarXmlRecibido(item.xml, existentes);
        if (r === 'ok') ok++;
        else if (r === 'ok_sin_asiento') { ok++; sinAsiento++; }
        else if (r === 'dup') dup++;
        else if (r === 'omitido') omit++;
        else err++;
      }
      toast.success(
        `Desde correo — Importadas: ${ok} · Duplicadas: ${dup}` +
        `${omit ? ` · Omitidas: ${omit}` : ''}${err ? ` · Con error: ${err}` : ''}`
      );
      if (sinAsiento > 0) {
        toast.warning(`${sinAsiento} factura(s) se importaron pero NO generaron asiento contable. Revísalas en Libro Diario.`, { duration: 12000 });
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Error al importar desde el correo');
    } finally {
      setBulkImporting(false);
    }
  };

  // ── Anular factura de proveedor (reversa el asiento de compra) ──
  const anularFactura = async (f: FacturaProveedor) => {
    if (!user) return;
    if (f.estado === 'anulada') { toast.info('La factura ya está anulada'); return; }
    if ((f.pagos?.length ?? 0) > 0) { toast.error('No se puede anular: la factura tiene pagos registrados'); return; }
    if (!window.confirm(`¿Anular la factura ${f.numeroFactura} de ${f.proveedorNombre}? Se revertirá su asiento de compra.`)) return;
    try {
      // El asiento puede provenir de la importación ('factura_proveedor') o de una entrada ('entrada')
      let rev = await crearAsientoReversion({
        referenciaId: f.id, referenciaTipo: 'factura_proveedor',
        fecha: new Date(), concepto: `Anulación factura ${f.numeroFactura}`,
        usuarioId: user.uid, usuarioNombre: user.nombre,
      });
      if (!rev.ok && f.entradaId) {
        rev = await crearAsientoReversion({
          referenciaId: f.entradaId, referenciaTipo: 'entrada',
          fecha: new Date(), concepto: `Anulación factura ${f.numeroFactura}`,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
      }
      await updateFacturaProveedor(f.id, { estado: 'anulada', saldoPendiente: 0 });
      toast.success(rev.ok ? 'Factura anulada y asiento revertido' : `Factura anulada (${rev.advertencia ?? 'sin asiento'})`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al anular la factura');
    }
  };

  // ── Descargar TODOS los XML recibidos guardados (en un .zip) ──
  const descargarTodosXML = () => {
    const conXml = facturas.filter(f => f.xmlRaw);
    if (conXml.length === 0) {
      toast.error('No hay XMLs guardados. Importa comprobantes para poder exportarlos.');
      return;
    }
    const archivos = conXml.map(f => ({
      name:    `${f.claveAcceso || f.numeroFactura || f.id}.xml`,
      content: f.xmlRaw as string,
    }));
    descargarZip(archivos, `comprobantes_recibidos_${new Date().toISOString().slice(0,10)}.zip`);
    toast.success(`${archivos.length} XML exportados en ZIP`);
  };

  // ── Pago bancario por archivo TXT (individual o masivo) + egreso ──
  const facturasPagables = facturas.filter(f => f.estado !== 'pagada' && f.estado !== 'anulada' && f.saldoPendiente > 0);

  const toggleSel = (id: string) =>
    setSeleccionadas(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const abrirPagoBanco = () => { setSeleccionadas(new Set()); setPagoBancoOpen(true); };

  const totalSeleccionado = facturasPagables
    .filter(f => seleccionadas.has(f.id))
    .reduce((s, f) => s + f.saldoPendiente, 0);

  const procesarPagoBanco = async () => {
    if (!user) return;
    const sel = facturasPagables.filter(f => seleccionadas.has(f.id));
    if (sel.length === 0) { toast.error('Selecciona al menos una factura'); return; }

    setProcesandoPago(true);
    const pagos: PagoBancario[] = [];
    let sinDatos = 0;
    try {
      for (const f of sel) {
        const prov = proveedores.find(p => p.id === f.proveedorId);
        // 1. Registrar el pago (salda la factura)
        await registrarPago(f.id, {
          fecha: new Date(), monto: f.saldoPendiente, metodoPago: 'transferencia',
          referencia: `Pago archivo ${BANCOS_PAGO.find(b => b.value === bancoSel)?.label ?? ''}`,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        // 2. Egreso contable (DB CxP / CR Bancos)
        crearAsientoPago({
          facturaId: f.id, fecha: new Date(), proveedorNombre: f.proveedorNombre,
          monto: f.saldoPendiente, usaBanco: true,
          usuarioId: user.uid, usuarioNombre: user.nombre,
        }).catch(() => {});
        // 3. Línea para el archivo del banco
        if (!prov?.numeroCuentaBancaria || !prov?.bancoCodigo) sinDatos++;
        pagos.push({
          identificacion:     f.proveedorRuc,
          tipoIdentificacion: f.proveedorRuc.length === 13 ? 'R' : f.proveedorRuc.length === 10 ? 'C' : 'P',
          nombre:             f.proveedorNombre,
          bancoCodigo:        prov?.bancoCodigo ?? '',
          tipoCuenta:         prov?.tipoCuentaBancaria ?? 'corriente',
          numeroCuenta:       prov?.numeroCuentaBancaria ?? '',
          valor:              f.saldoPendiente,
          referencia:         f.numeroFactura,
          email:              prov?.emailPago ?? prov?.email,
        });
      }
      // 4. Generar y descargar el TXT
      descargarTxtPagos(bancoSel, pagos);
      toast.success(
        `${pagos.length} pago(s) registrados, egreso contable creado y archivo generado.` +
        (sinDatos ? ` ⚠ ${sinDatos} sin datos bancarios completos.` : '')
      );
      setPagoBancoOpen(false);
      setSeleccionadas(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al procesar los pagos');
    } finally {
      setProcesandoPago(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Facturas de Proveedores"
        description="Control de cuentas por pagar — registra y gestiona facturas de proveedores"
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => xmlRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Importar XML
            </Button>
            <Button variant="outline" disabled={bulkImporting} onClick={() => bulkRef.current?.click()}>
              <Files className="mr-2 h-4 w-4" />
              {bulkImporting ? 'Importando…' : 'Importar varios XML'}
            </Button>
            <Button variant="outline" disabled={bulkImporting} onClick={handleImportarCorreo}>
              <Mail className="mr-2 h-4 w-4" />
              {bulkImporting ? 'Buscando…' : 'Buscar en mi correo'}
            </Button>
            <Button variant="outline" onClick={() => txtRef.current?.click()}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Importar TXT (Recibidos SRI)
            </Button>
            <Button variant="outline" onClick={descargarTodosXML}>
              <Download className="mr-2 h-4 w-4" /> Descargar todos (ZIP)
            </Button>
            <Button variant="outline" onClick={abrirPagoBanco}>
              <Banknote className="mr-2 h-4 w-4" /> Pago bancario (TXT)
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Nueva Factura
            </Button>
            <input ref={xmlRef} type="file" accept=".xml" className="hidden" onChange={handleXMLUpload} />
            <input ref={bulkRef} type="file" accept=".xml" multiple className="hidden" onChange={handleBulkUpload} />
            <input ref={txtRef} type="file" accept=".txt,.tsv" className="hidden" onChange={handleTxtUpload} />
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total por pagar', value: currency(stats.totalPendiente), color: 'text-slate-800', big: true },
          { label: 'Vencidas',        value: stats.vencidas,   color: 'text-red-600' },
          { label: 'Pendientes',      value: stats.pendientes, color: 'text-amber-600' },
          { label: 'Pagadas',         value: stats.pagadas,    color: 'text-green-600' },
        ].map(({ label, value, color, big }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`font-bold mt-1 ${color} ${big ? 'text-xl' : 'text-2xl'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input placeholder="Buscar por proveedor o número..."
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select onValueChange={setFiltroEstado} defaultValue="todos">
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="parcial">Parciales</SelectItem>
            <SelectItem value="vencida">Vencidas</SelectItem>
            <SelectItem value="pagada">Pagadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Proveedor</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Emisión</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-28">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  <FileCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay facturas registradas.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(f => {
              const cfg      = ESTADO_CONFIG[f.estado] ?? ESTADO_CONFIG.pendiente;
              const Icon     = cfg.icon;
              const esVencida = f.estado === 'vencida';
              return (
                <TableRow key={f.id} className={f.estado === 'pagada' ? 'opacity-60' : ''}>
                  <TableCell>
                    <p className="font-medium text-sm">{f.proveedorNombre}</p>
                    <p className="text-xs text-slate-400">{f.proveedorRuc}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{f.numeroFactura}</TableCell>
                  <TableCell className="text-sm text-slate-500">{formatFecha(f.fechaEmision)}</TableCell>
                  <TableCell className={`text-sm ${esVencida ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                    {f.fechaVencimiento ? formatFecha(f.fechaVencimiento) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{currency(f.total)}</TableCell>
                  <TableCell className={`text-right font-bold ${f.saldoPendiente > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {currency(f.saldoPendiente)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                      <Icon className="h-3 w-3" />{cfg.label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon" title="Ver detalle"
                        onClick={() => setDetailDialog(f)}
                        className="h-8 w-8 text-slate-500 hover:text-blue-600">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      {f.estado !== 'pagada' && f.estado !== 'anulada' && (
                        <Button variant="ghost" size="icon" title="Registrar pago"
                          onClick={() => {
                            setPagoDialog(f);
                            pagoForm.reset({ monto: f.saldoPendiente, metodoPago: 'transferencia' });
                          }}
                          className="h-8 w-8 text-slate-500 hover:text-green-600">
                          <CreditCard className="h-4 w-4" />
                        </Button>
                      )}
                      {f.estado !== 'anulada' && (
                        <Button variant="ghost" size="icon" title="Anular factura"
                          onClick={() => anularFactura(f)}
                          className="h-8 w-8 text-slate-500 hover:text-red-600">
                          <Ban className="h-4 w-4" />
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

      {/* ─── DIALOG NUEVA FACTURA ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Factura de Proveedor</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 col-span-2">
              <Label>Proveedor *</Label>
              <Select onValueChange={v => facturaForm.setValue('proveedorId', v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona el proveedor" /></SelectTrigger>
                <SelectContent>
                  {proveedores.filter(p => p.activo).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre} — {p.ruc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {facturaForm.formState.errors.proveedorId && (
                <p className="text-xs text-red-500">{facturaForm.formState.errors.proveedorId.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Número de factura *</Label>
              <Input placeholder="001-001-000000001" {...facturaForm.register('numeroFactura')} />
            </div>
            <div className="space-y-1.5">
              <Label>Clave de acceso SRI</Label>
              <Input placeholder="49 dígitos (opcional)" {...facturaForm.register('claveAcceso')} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de emisión *</Label>
              <Input type="date" {...facturaForm.register('fechaEmision')} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de vencimiento</Label>
              <Input type="date" {...facturaForm.register('fechaVencimiento')} />
            </div>
            <Separator className="col-span-2" />
            <div className="space-y-1.5">
              <Label>Base imponible 15%</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input type="number" step="0.01" min="0" className="pl-7"
                  {...facturaForm.register('subtotal12')}
                  onChange={e => {
                    const s12 = Number(e.target.value);
                    const s0  = facturaForm.getValues('subtotal0');
                    const iva = s12 * 0.15;
                    facturaForm.setValue('subtotal12', s12);
                    facturaForm.setValue('iva',   parseFloat(iva.toFixed(2)));
                    facturaForm.setValue('total', parseFloat((s12 + s0 + iva).toFixed(2)));
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Base imponible 0%</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input type="number" step="0.01" min="0" className="pl-7"
                  {...facturaForm.register('subtotal0')}
                  onChange={e => {
                    const s0  = Number(e.target.value);
                    const s12 = facturaForm.getValues('subtotal12');
                    const iva = s12 * 0.15;
                    facturaForm.setValue('subtotal0', s0);
                    facturaForm.setValue('total', parseFloat((s12 + s0 + iva).toFixed(2)));
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>IVA 15%</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input type="number" step="0.01" min="0" className="pl-7 bg-slate-50"
                  readOnly {...facturaForm.register('iva')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Total *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input type="number" step="0.01" min="0" className="pl-7 font-bold"
                  {...facturaForm.register('total')} />
              </div>
              {facturaForm.formState.errors.total && (
                <p className="text-xs text-red-500">{facturaForm.formState.errors.total.message}</p>
              )}
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Textarea placeholder="Observaciones..." rows={2} {...facturaForm.register('notas')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => facturaForm.handleSubmit(onSaveFactura)()} disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar Factura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG REGISTRAR PAGO ─── */}
      <Dialog open={!!pagoDialog} onOpenChange={() => setPagoDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          {pagoDialog && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Proveedor</span>
                  <span className="font-medium">{pagoDialog.proveedorNombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Factura</span>
                  <span className="font-mono text-xs">{pagoDialog.numeroFactura}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total factura</span>
                  <span className="font-medium">{currency(pagoDialog.total)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Saldo pendiente</span>
                  <span className="text-red-600">{currency(pagoDialog.saldoPendiente)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Monto a pagar *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <Input type="number" step="0.01" min="0.01"
                    max={pagoDialog.saldoPendiente}
                    className="pl-7" {...pagoForm.register('monto')} />
                </div>
                {pagoForm.formState.errors.monto && (
                  <p className="text-xs text-red-500">{pagoForm.formState.errors.monto.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Método de pago *</Label>
                <Select onValueChange={v => pagoForm.setValue('metodoPago', v as 'efectivo' | 'tarjeta' | 'transferencia')}
                  defaultValue="transferencia">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Referencia / Número de transacción</Label>
                <Input placeholder="Número de transferencia, cheque, etc."
                  {...pagoForm.register('referencia')} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagoDialog(null)}>Cancelar</Button>
            <Button onClick={() => pagoForm.handleSubmit(onSavePago)()} disabled={saving}
              className="bg-green-600 hover:bg-green-700">
              {saving ? 'Registrando...' : 'Confirmar Pago'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG DETALLE ─── */}
      <Dialog open={!!detailDialog} onOpenChange={() => setDetailDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Factura</DialogTitle>
          </DialogHeader>
          {detailDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-slate-400">Proveedor</p><p className="font-medium">{detailDialog.proveedorNombre}</p></div>
                <div><p className="text-xs text-slate-400">RUC</p><p className="font-medium">{detailDialog.proveedorRuc}</p></div>
                <div><p className="text-xs text-slate-400">Número</p><p className="font-mono text-xs">{detailDialog.numeroFactura}</p></div>
                <div><p className="text-xs text-slate-400">Fecha emisión</p><p className="font-medium">{formatFecha(detailDialog.fechaEmision)}</p></div>
                {detailDialog.claveAcceso && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400">Clave de acceso</p>
                    <p className="font-mono text-xs break-all">{detailDialog.claveAcceso}</p>
                  </div>
                )}
              </div>
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Base 15%</span><span>{currency(detailDialog.subtotal12)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Base 0%</span><span>{currency(detailDialog.subtotal0)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>IVA 15%</span><span>{currency(detailDialog.iva)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span><span>{currency(detailDialog.total)}</span>
                </div>
                <div className="flex justify-between font-bold text-red-600">
                  <span>Saldo pendiente</span><span>{currency(detailDialog.saldoPendiente)}</span>
                </div>
              </div>
              {detailDialog.pagos?.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2">Historial de pagos</p>
                    <div className="space-y-2">
                      {detailDialog.pagos.map((p, i) => (
                        <div key={i} className="flex justify-between items-center text-sm py-1.5 border-b last:border-0">
                          <div>
                            <p className="font-medium">{currency(p.monto)}</p>
                            <p className="text-xs text-slate-400">
                              {p.metodoPago} {p.referencia ? `— ${p.referencia}` : ''}
                            </p>
                          </div>
                          <p className="text-xs text-slate-400">{formatFecha(p.fecha)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG CONFIRMAR XML ─── */}
      <Dialog open={xmlDialog} onOpenChange={() => { setXmlDialog(false); setXmlPreview(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSearch className="h-4 w-4" /> Confirmar importación XML
            </DialogTitle>
          </DialogHeader>
          {xmlPreview && (
            <div className="space-y-3 py-2">
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Emisor</span>
                  <span className="font-medium">{xmlPreview.data.infoTributaria.razonSocial}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">RUC</span>
                  <span className="font-mono text-xs">{xmlPreview.data.infoTributaria.ruc}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Número</span>
                  <span className="font-mono text-xs">
                    {xmlPreview.data.infoTributaria.estab}-{xmlPreview.data.infoTributaria.ptoEmi}-{xmlPreview.data.infoTributaria.secuencial}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fecha</span>
                  <span>{xmlPreview.data.infoFactura.fechaEmision}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span>{currency(Number(xmlPreview.data.infoFactura.totalSinImpuestos))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IVA</span>
                  <span>{currency(xmlPreview.iva)}</span>
                </div>
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>{currency(Number(xmlPreview.data.infoFactura.importeTotal))}</span>
                </div>
              </div>
              {!proveedores.find(p => p.ruc === xmlPreview.data.infoTributaria.ruc) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  ⚠️ El proveedor con RUC <strong>{xmlPreview.data.infoTributaria.ruc}</strong> no está
                  registrado. La factura se importará igualmente pero sin asociar al proveedor.
                </div>
              )}
              <p className="text-xs text-slate-400">
                Se importarán {xmlPreview.data.detalles?.length ?? 0} línea(s) de detalle.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setXmlDialog(false); setXmlPreview(null); }}>
              Cancelar
            </Button>
            <Button onClick={confirmarImportXML} disabled={saving}>
              {saving ? 'Importando...' : 'Confirmar importación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG IMPORTAR TXT "COMPROBANTES RECIBIDOS" SRI ─── */}
      <Dialog open={txtDialogOpen} onOpenChange={(open) => { if (!txtImporting) { setTxtDialogOpen(open); if (!open) setTxtFilas([]); } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-slate-700" />
              Importar Comprobantes Recibidos (SRI)
            </DialogTitle>
          </DialogHeader>

          {(() => {
            const nuevas       = txtFilas.filter(f => f.estado === 'nueva');
            const duplicadas   = txtFilas.filter(f => f.estado === 'duplicada');
            const noSoportadas = txtFilas.filter(f => f.estado === 'no_soportado');
            const proveedoresNuevos = nuevas.filter(f => f.proveedorNuevo).length;
            const totalImporte = nuevas.reduce((s, f) => s + f.importeTotal, 0);
            const pctProgreso  = nuevas.length > 0 ? Math.round((txtProgreso / nuevas.length) * 100) : 0;

            return (
              <div className="space-y-4 py-1">
                {/* Resumen */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3 border">
                    <p className="text-xs text-slate-400">Filas leídas</p>
                    <p className="text-xl font-bold text-slate-800">{txtFilas.length}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                    <p className="text-xs text-green-700">Se importarán</p>
                    <p className="text-xl font-bold text-green-700">{nuevas.length}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                    <p className="text-xs text-amber-700">Ya registradas</p>
                    <p className="text-xl font-bold text-amber-700">{duplicadas.length}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                    <p className="text-xs text-blue-700 flex items-center gap-1"><UserPlus className="h-3 w-3" /> Proveedores nuevos</p>
                    <p className="text-xl font-bold text-blue-700">{proveedoresNuevos}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2 border">
                  <span className="text-slate-500">Total a importar</span>
                  <span className="font-bold text-slate-800">{currency(totalImporte)}</span>
                </div>

                {noSoportadas.length > 0 && (
                  <div className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-500 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span>
                      {noSoportadas.length} fila(s) no son de tipo "Factura" (notas de crédito/débito, retenciones, etc.)
                      y no se importan desde aquí — cárgalas por XML en sus respectivas secciones.
                    </span>
                  </div>
                )}

                {/* Tabla previa */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow className="bg-slate-50">
                          <TableHead className="w-24">Estado</TableHead>
                          <TableHead>Proveedor</TableHead>
                          <TableHead>Comprobante</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {txtFilas.slice(0, 150).map((f, i) => (
                          <TableRow key={`${f.claveAcceso}-${i}`}>
                            <TableCell>
                              {f.estado === 'nueva' && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                                  <CheckCircle2 className="h-3 w-3" /> Nueva
                                </span>
                              )}
                              {f.estado === 'duplicada' && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
                                  <Clock className="h-3 w-3" /> Duplicada
                                </span>
                              )}
                              {f.estado === 'no_soportado' && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                                  <XCircle className="h-3 w-3" /> No soportada
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <p className="text-sm font-medium">
                                {f.razonSocialEmisor}
                                {f.proveedorNuevo && (
                                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 align-middle">
                                    <UserPlus className="h-2.5 w-2.5" /> nuevo
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-400">{f.rucEmisor}</p>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-500">{f.serieComprobante}</TableCell>
                            <TableCell className="text-sm text-slate-500">{f.fechaEmision}</TableCell>
                            <TableCell className="text-right font-semibold text-sm">{currency(f.importeTotal)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {txtFilas.length > 150 && (
                    <p className="text-xs text-slate-400 text-center py-2 border-t bg-slate-50">
                      +{txtFilas.length - 150} fila(s) más (se procesan igual al confirmar)
                    </p>
                  )}
                </div>

                {txtImporting && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Importando {txtProgreso} de {nuevas.length}…</span>
                      <span>{pctProgreso}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-900 transition-all duration-200" style={{ width: `${pctProgreso}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" disabled={txtImporting}
              onClick={() => { setTxtDialogOpen(false); setTxtFilas([]); }}>
              Cancelar
            </Button>
            <Button onClick={confirmarImportTxt}
              disabled={txtImporting || txtFilas.filter(f => f.estado === 'nueva').length === 0}>
              {txtImporting ? 'Importando…' : `Importar ${txtFilas.filter(f => f.estado === 'nueva').length} factura(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DIALOG PAGO BANCARIO (TXT) ─── */}
      <Dialog open={pagoBancoOpen} onOpenChange={setPagoBancoOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pago a proveedores por archivo bancario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div className="space-y-1.5">
                <Label>Banco</Label>
                <Select value={bancoSel} onValueChange={v => setBancoSel(v as BancoPago)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BANCOS_PAGO.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Seleccionado</p>
                <p className="text-xl font-bold">{currency(totalSeleccionado)}</p>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead className="text-center">Datos banco</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facturasPagables.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-400 text-sm">
                      No hay facturas pendientes de pago.
                    </TableCell></TableRow>
                  ) : facturasPagables.map(f => {
                    const prov = proveedores.find(p => p.id === f.proveedorId);
                    const tieneBanco = !!prov?.numeroCuentaBancaria && !!prov?.bancoCodigo;
                    return (
                      <TableRow key={f.id} className="cursor-pointer" onClick={() => toggleSel(f.id)}>
                        <TableCell>
                          <input type="checkbox" checked={seleccionadas.has(f.id)} onChange={() => toggleSel(f.id)} />
                        </TableCell>
                        <TableCell className="text-sm">{f.proveedorNombre}</TableCell>
                        <TableCell className="font-mono text-xs">{f.numeroFactura}</TableCell>
                        <TableCell className="text-center">
                          {tieneBanco
                            ? <span className="text-xs text-green-600">✓ completos</span>
                            : <span className="text-xs text-amber-600">⚠ faltan</span>}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{currency(f.saldoPendiente)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              Al confirmar: se <strong>registra el pago</strong> de cada factura, se crea el <strong>egreso contable</strong>
              (CxP / Bancos) y se descarga el <strong>archivo .txt</strong> para cargar en la banca electrónica.
              Los datos bancarios se toman del proveedor (Proveedores → editar).
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagoBancoOpen(false)}>Cancelar</Button>
            <Button onClick={procesarPagoBanco} disabled={procesandoPago || seleccionadas.size === 0}>
              <Banknote className="mr-2 h-4 w-4" />
              {procesandoPago ? 'Procesando...' : `Pagar y generar archivo (${seleccionadas.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}