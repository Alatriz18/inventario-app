'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { FileX, Plus, Upload, FileSpreadsheet, CheckCircle2, XCircle, Pencil, Ban, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { DocumentoRecibido, TipoDocRecibido } from '@/types';
import { subscribeToDocsRecibidos, createDocRecibido, updateDocRecibido } from '@/lib/firebase/docs-recibidos';
import { getOrCreateProveedorPorRuc } from '@/lib/firebase/proveedores';
import {
  buscarFacturaPorNumero, aplicarAjusteDocRecibido, getFacturasProveedor, getFacturaProveedorById,
  revertirAjusteDocRecibido,
} from '@/lib/firebase/facturas-proveedor';
import {
  crearAsientoNotaCreditoRecibida, crearAsientoNotaDebitoRecibida, crearAsientoReversion,
} from '@/lib/contabilidad/motor-asientos';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${(v ?? 0).toFixed(2)}`;
const TIPO_LABEL: Record<string, string> = { nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito' };
const TIPO_COLOR: Record<string, string> = {
  nota_credito: 'bg-emerald-50 text-emerald-700',
  nota_debito:  'bg-orange-50 text-orange-700',
};

// ── Importación masiva TXT "Comprobantes Recibidos" del SRI (NC/ND) ──────
interface FilaDocTxt {
  idx:            number;
  tipo:           TipoDocRecibido;
  proveedorRuc:   string;
  proveedorNombre:string;
  numero:         string;
  claveAcceso:    string;
  fecha:          Date | null;
  fechaTexto:     string;
  docModificado:  string;
  subtotal:       number;
  iva:            number;
  total:          number;
  error?:         string;
}

function parseFechaTxt(v: string): Date | null {
  const s = (v ?? '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseDocsRecibidosTxt(texto: string): FilaDocTxt[] {
  const lineas = texto.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lineas.length < 2) return [];

  const headers = lineas[0].split('\t').map(h => h.trim().toUpperCase());
  const idx = (col: string) => headers.indexOf(col);
  const iRuc = idx('RUC_EMISOR'), iRazon = idx('RAZON_SOCIAL_EMISOR'),
    iTipo = idx('TIPO_COMPROBANTE'), iSerie = idx('SERIE_COMPROBANTE'),
    iClave = idx('CLAVE_ACCESO'), iFecha = idx('FECHA_EMISION'),
    iBase = idx('VALOR_SIN_IMPUESTOS'), iIva = idx('IVA'), iTotal = idx('IMPORTE_TOTAL'),
    iDocMod = idx('NUMERO_DOCUMENTO_MODIFICADO');

  if (iRuc < 0 || iTipo < 0 || iClave < 0) return [];

  const filas: FilaDocTxt[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split('\t').map(c => c.trim());
    const tipoRaw = (cols[iTipo] ?? '').trim().toLowerCase();
    if (!tipoRaw.includes('nota de crédito') && !tipoRaw.includes('nota de credito') &&
        !tipoRaw.includes('nota de débito') && !tipoRaw.includes('nota de debito')) continue; // omite facturas/retenciones

    const tipo: TipoDocRecibido = tipoRaw.includes('débito') || tipoRaw.includes('debito') ? 'nota_debito' : 'nota_credito';
    const fecha  = parseFechaTxt(cols[iFecha] ?? '');
    const subtotal = parseFloat((cols[iBase] ?? '').replace(',', '.')) || 0;
    const iva      = parseFloat((cols[iIva] ?? '').replace(',', '.')) || 0;
    const totalCol = parseFloat((cols[iTotal] ?? '').replace(',', '.')) || 0;
    const total    = totalCol > 0 ? totalCol : parseFloat((subtotal + iva).toFixed(2));

    const fila: FilaDocTxt = {
      idx: i + 1, tipo,
      proveedorRuc: cols[iRuc] ?? '', proveedorNombre: cols[iRazon] ?? '',
      numero: cols[iSerie] ?? '', claveAcceso: cols[iClave] ?? '',
      fecha, fechaTexto: fecha ? fecha.toLocaleDateString('es-EC') : '',
      docModificado: (iDocMod >= 0 ? cols[iDocMod] : '') ?? '',
      subtotal, iva, total,
    };

    if (!fila.proveedorRuc)  fila.error = 'Falta RUC del proveedor';
    else if (!fecha)         fila.error = 'Fecha inválida o vacía';
    else if (total <= 0)     fila.error = 'El monto no puede ser $0.00';

    filas.push(fila);
  }
  return filas;
}

export default function DocumentosRecibidosPage() {
  const { user } = useAuth();
  const [docs,    setDocs]    = useState<DocumentoRecibido[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  // Dialog registro manual
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [tipo,         setTipo]         = useState<TipoDocRecibido>('nota_credito');
  const [proveedor,    setProveedor]    = useState('');
  const [proveedorRuc, setProveedorRuc] = useState('');
  const [numero,       setNumero]       = useState('');
  const [docModificado,setDocModificado]= useState('');
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().split('T')[0]);
  const [claveAcceso,  setClaveAcceso]  = useState('');
  const [subtotal,     setSubtotal]     = useState(0);
  const [iva,          setIva]          = useState(0);
  const [saving,       setSaving]       = useState(false);

  // Importación masiva TXT
  const txtRef = useRef<HTMLInputElement>(null);
  const [txtDialogOpen, setTxtDialogOpen] = useState(false);
  const [txtFilas,      setTxtFilas]      = useState<FilaDocTxt[]>([]);
  const [txtImporting,  setTxtImporting]  = useState(false);
  const [txtProgreso,   setTxtProgreso]   = useState(0);
  const [txtResultado,  setTxtResultado]  = useState<{ ok: number; sinAsiento: number; err: number } | null>(null);

  // Dialog "vincular manual" — para NC/ND cuya factura original no está
  // registrada en el sistema (no se pudo enlazar automáticamente), pero el
  // usuario sí tiene su número de autorización/clave de acceso (ej. desde el
  // portal del SRI) y el ATS lo exige igual.
  const [vincularDoc,    setVincularDoc]    = useState<DocumentoRecibido | null>(null);
  const [autModificado,  setAutModificado]  = useState('');
  const [savingVincular, setSavingVincular] = useState(false);

  const abrirVincularManual = (d: DocumentoRecibido) => {
    setVincularDoc(d);
    setAutModificado(d.autorizacionModificado ?? '');
  };

  const guardarVinculoManual = async () => {
    if (!vincularDoc) return;
    if (!autModificado.trim()) { toast.error('Ingresa el número de autorización'); return; }
    setSavingVincular(true);
    try {
      await updateDocRecibido(vincularDoc.id, { autorizacionModificado: autModificado.trim() });
      toast.success('Autorización guardada — ya se incluirá en el próximo ATS que generes');
      setVincularDoc(null);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al guardar');
    } finally {
      setSavingVincular(false);
    }
  };

  // "Reintentar enlaces automáticos" — el enlace solo corre al importar la
  // NC/ND; si la factura original se registra DESPUÉS, nadie vuelve a
  // intentarlo. Este botón revisa todas las NC/ND sin enlazar contra TODAS
  // las facturas actuales (no solo las cargadas en pantalla) y aplica el
  // ajuste de saldo donde ahora sí exista un match por RUC + número.
  const [reintentando, setReintentando] = useState(false);

  const handleReintentarEnlaces = async () => {
    if (!user) return;
    const pendientes = docs.filter(d => d.docModificado && !d.facturaProveedorId);
    if (pendientes.length === 0) {
      toast.info('No hay notas sin enlazar — nada que reintentar.');
      return;
    }
    setReintentando(true);
    let enlazadas = 0, err = 0;
    try {
      const todasFacturas = await getFacturasProveedor();
      const facturaPorClave = new Map(
        todasFacturas.map(f => [`${f.proveedorRuc}|${f.numeroFactura}`, f])
      );
      for (const d of pendientes) {
        const facturaMod = facturaPorClave.get(`${d.proveedorRuc}|${d.docModificado}`);
        if (!facturaMod) continue;
        try {
          await aplicarAjusteDocRecibido(facturaMod.id, {
            tipo: d.tipo, docId: d.id, numero: d.numero, monto: d.total,
            fecha: (d.fechaEmision as any)?.toDate?.() ?? new Date(d.fechaEmision),
            usuarioId: user.uid, usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
          });
          await updateDocRecibido(d.id, { facturaProveedorId: facturaMod.id });
          enlazadas++;
        } catch { err++; }
      }
      if (enlazadas === 0) {
        toast.info('Ninguna factura nueva coincide todavía — si ya importaste la factura original, revisa que el número coincida exacto.');
      } else {
        toast.success(`${enlazadas} nota(s) enlazadas automáticamente` + (err ? ` — ${err} con error` : ''), { duration: 10000 });
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Error al reintentar los enlaces');
    } finally {
      setReintentando(false);
    }
  };

  // Dialog "Editar" — corrige datos básicos de un documento ya registrado
  // (no toca el asiento ni el ajuste; si el monto cambia, avisa para que se
  // anule y se vuelva a registrar en vez de dejar la contabilidad descuadrada).
  const [editDoc,       setEditDoc]       = useState<DocumentoRecibido | null>(null);
  const [editProveedor, setEditProveedor] = useState('');
  const [editNumero,    setEditNumero]    = useState('');
  const [editDocMod,    setEditDocMod]    = useState('');
  const [editClave,     setEditClave]     = useState('');
  const [editFecha,     setEditFecha]     = useState('');
  const [savingEdit,    setSavingEdit]    = useState(false);

  const abrirEditar = (d: DocumentoRecibido) => {
    setEditDoc(d);
    setEditProveedor(d.proveedorNombre);
    setEditNumero(d.numero);
    setEditDocMod(d.docModificado ?? '');
    setEditClave(d.claveAcceso ?? '');
    setEditFecha(format((d.fechaEmision as any)?.toDate?.() ?? new Date(d.fechaEmision), 'yyyy-MM-dd'));
  };

  const guardarEdicion = async () => {
    if (!editDoc) return;
    if (!editProveedor.trim() || !editNumero.trim() || !editFecha) {
      toast.error('Completa proveedor, número y fecha'); return;
    }
    setSavingEdit(true);
    try {
      await updateDocRecibido(editDoc.id, {
        proveedorNombre: editProveedor.trim(),
        numero:          editNumero.trim(),
        fechaEmision:    new Date(editFecha + 'T12:00:00'),
        ...(editClave.trim()  ? { claveAcceso:   editClave.trim() }  : {}),
        ...(editDocMod.trim() ? { docModificado: editDocMod.trim() } : {}),
      });
      toast.success('Documento actualizado');
      setEditDoc(null);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al guardar');
    } finally {
      setSavingEdit(false);
    }
  };

  // Anular: reversa el asiento contable (sin borrarlo, como en el resto del
  // sistema) y, si estaba enlazada a una factura, revierte el ajuste de
  // saldo que le había aplicado — para que no quede nada descuadrado.
  const [anulando, setAnulando] = useState<string | null>(null);

  const handleAnular = async (d: DocumentoRecibido) => {
    if (!user) return;
    setAnulando(d.id);
    try {
      if (d.facturaProveedorId) {
        const factura = await getFacturaProveedorById(d.facturaProveedorId);
        const ajuste = factura?.ajustes?.find(a => a.docId === d.id && !a.anulado);
        if (ajuste) await revertirAjusteDocRecibido(d.facturaProveedorId, ajuste.id);
      }
      const referenciaTipo = d.tipo === 'nota_credito' ? 'nota_credito_recibida' : 'nota_debito_recibida';
      const rev = await crearAsientoReversion({
        referenciaId: d.id, referenciaTipo, fecha: new Date(),
        concepto: `Anulación ${TIPO_LABEL[d.tipo]} ${d.numero} - ${d.proveedorNombre}`,
        usuarioId: user.uid, usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
      });
      await updateDocRecibido(d.id, { anulado: true });
      if (!rev.ok) {
        toast.warning(`Documento anulado, pero el asiento no se pudo reversar automáticamente: ${rev.advertencia}. Revísalo en Libro Diario.`, { duration: 12000 });
      } else {
        toast.success('Documento anulado y asiento reversado');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Error al anular');
    } finally {
      setAnulando(null);
    }
  };

  const handleReactivar = async (d: DocumentoRecibido) => {
    if (!user) return;
    setAnulando(d.id);
    try {
      if (d.facturaProveedorId) {
        await aplicarAjusteDocRecibido(d.facturaProveedorId, {
          tipo: d.tipo, docId: d.id, numero: d.numero, monto: d.total,
          fecha: (d.fechaEmision as any)?.toDate?.() ?? new Date(d.fechaEmision),
          usuarioId: user.uid, usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
        });
      }
      const referenciaTipo = d.tipo === 'nota_credito' ? 'nota_credito_recibida' : 'nota_debito_recibida';
      const rev = await crearAsientoReversion({
        referenciaId: d.id, referenciaTipo: `${referenciaTipo}_anulacion`, fecha: new Date(),
        concepto: `Reactivación ${TIPO_LABEL[d.tipo]} ${d.numero} - ${d.proveedorNombre}`,
        usuarioId: user.uid, usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
      });
      await updateDocRecibido(d.id, { anulado: false });
      if (!rev.ok) {
        toast.warning(`Documento reactivado, pero el asiento no se pudo restaurar automáticamente: ${rev.advertencia}. Revísalo en Libro Diario.`, { duration: 12000 });
      } else {
        toast.success('Documento reactivado');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Error al reactivar');
    } finally {
      setAnulando(null);
    }
  };

  useEffect(() => subscribeToDocsRecibidos(d => { setDocs(d); setLoading(false); }, { limite: 500 }), []);

  const filtrados = useMemo(() => docs.filter(d =>
    !search ||
    d.proveedorNombre.toLowerCase().includes(search.toLowerCase()) ||
    d.proveedorRuc.includes(search) ||
    d.numero.includes(search)
  ), [docs, search]);

  // Si el documento trae "factura que modifica", busca esa factura de este
  // mismo proveedor y le aplica el ajuste (NC reduce saldo, ND lo aumenta).
  // Si no la encuentra, el documento queda igual solo con docModificado como
  // referencia de texto — no bloquea el registro del documento.
  const vincularConFactura = async (
    docId: string, proveedorRuc: string, docModificado: string,
    tipo: TipoDocRecibido, numero: string, total: number, fecha: Date,
  ): Promise<boolean> => {
    const facturaMod = await buscarFacturaPorNumero(proveedorRuc, docModificado);
    if (!facturaMod || !user) return false;
    await aplicarAjusteDocRecibido(facturaMod.id, {
      tipo, docId, numero, monto: total, fecha,
      usuarioId: user.uid, usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
    });
    await updateDocRecibido(docId, { facturaProveedorId: facturaMod.id });
    return true;
  };

  const resetDialog = () => {
    setTipo('nota_credito'); setProveedor(''); setProveedorRuc('');
    setNumero(''); setDocModificado(''); setFechaEmision(new Date().toISOString().split('T')[0]);
    setClaveAcceso(''); setSubtotal(0); setIva(0);
  };

  const handleRegistrar = async () => {
    if (!user) return;
    if (!proveedor.trim() || !proveedorRuc.trim()) { toast.error('Ingresa el proveedor'); return; }
    if (!numero.trim())      { toast.error('Ingresa el número del documento'); return; }
    if (!fechaEmision)       { toast.error('Ingresa la fecha de emisión'); return; }
    const total = subtotal + iva;
    if (total <= 0) { toast.error('El monto no puede ser $0.00'); return; }

    setSaving(true);
    try {
      const prov  = await getOrCreateProveedorPorRuc(proveedorRuc.trim(), proveedor.trim());
      const fecha = new Date(fechaEmision + 'T12:00:00');

      const docId = await createDocRecibido({
        tipo,
        proveedorId:     prov.id,
        proveedorNombre: proveedor.trim(),
        proveedorRuc:    proveedorRuc.trim(),
        numero:          numero.trim(),
        ...(claveAcceso.trim() ? { claveAcceso: claveAcceso.trim() } : {}),
        ...(docModificado.trim() ? { docModificado: docModificado.trim() } : {}),
        fechaEmision:    fecha,
        subtotal,
        iva,
        total,
        usuarioId:       user.uid,
        usuarioNombre:   user.nombre ?? user.email ?? 'Usuario',
      });

      const crearAsiento = tipo === 'nota_credito' ? crearAsientoNotaCreditoRecibida : crearAsientoNotaDebitoRecibida;
      const asientoId = await crearAsiento({
        docId, fecha, proveedorNombre: proveedor.trim(),
        subtotal, iva, total,
        usuarioId: user.uid, usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
      });

      if (asientoId) await updateDocRecibido(docId, { asientoId });

      let vinculada = false;
      if (docModificado.trim()) {
        try {
          vinculada = await vincularConFactura(
            docId, proveedorRuc.trim(), docModificado.trim(), tipo, numero.trim(), total, fecha
          );
        } catch { /* no bloquea el registro del documento */ }
      }

      if (!asientoId) {
        toast.warning(`${TIPO_LABEL[tipo]} registrada, pero el asiento contable NO se pudo generar. Revísala en Contabilidad → Libro Diario.`, { duration: 12000 });
      } else if (docModificado.trim() && !vinculada) {
        toast.warning(`${TIPO_LABEL[tipo]} registrada y contabilizada, pero no se encontró la factura ${docModificado.trim()} de este proveedor para enlazar el saldo.`, { duration: 12000 });
      } else if (vinculada) {
        toast.success(`${TIPO_LABEL[tipo]} registrada, contabilizada y enlazada al saldo de la factura ${docModificado.trim()}`);
      } else {
        toast.success(`${TIPO_LABEL[tipo]} registrada — contabilizada automáticamente`);
      }
      setDialogOpen(false);
      resetDialog();
    } catch (e: any) {
      toast.error(e.message ?? 'Error al registrar el documento');
    } finally {
      setSaving(false);
    }
  };

  const handleTxtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const texto = String(ev.target?.result ?? '');
        const parsed = parseDocsRecibidosTxt(texto);
        if (parsed.length === 0) {
          toast.error('No se encontraron notas de crédito/débito en este TXT (o no coincide el formato del SRI)');
          return;
        }
        setTxtFilas(parsed);
        setTxtResultado(null);
        setTxtDialogOpen(true);
      } catch {
        toast.error('No se pudo leer el archivo TXT.');
      }
    };
    reader.readAsText(file, 'utf-8');
    if (txtRef.current) txtRef.current.value = '';
  };

  const txtValidas = txtFilas.filter(f => !f.error);

  const importarTxt = async () => {
    if (!user || txtValidas.length === 0) return;
    setTxtImporting(true);
    setTxtProgreso(0);
    let ok = 0, sinAsiento = 0, err = 0;

    for (let i = 0; i < txtValidas.length; i++) {
      const f = txtValidas[i];
      try {
        const prov  = await getOrCreateProveedorPorRuc(f.proveedorRuc, f.proveedorNombre);
        const fecha = f.fecha!;

        const docId = await createDocRecibido({
          tipo: f.tipo,
          proveedorId:     prov.id,
          proveedorNombre: f.proveedorNombre || prov.nombre,
          proveedorRuc:    f.proveedorRuc,
          numero:          f.numero,
          ...(f.claveAcceso ? { claveAcceso: f.claveAcceso } : {}),
          ...(f.docModificado ? { docModificado: f.docModificado } : {}),
          fechaEmision:    fecha,
          subtotal: f.subtotal, iva: f.iva, total: f.total,
          usuarioId:       user.uid,
          usuarioNombre:   user.nombre ?? user.email ?? 'Usuario',
        });

        const crearAsiento = f.tipo === 'nota_credito' ? crearAsientoNotaCreditoRecibida : crearAsientoNotaDebitoRecibida;
        const asientoId = await crearAsiento({
          docId, fecha, proveedorNombre: f.proveedorNombre || prov.nombre,
          subtotal: f.subtotal, iva: f.iva, total: f.total,
          usuarioId: user.uid, usuarioNombre: user.nombre ?? user.email ?? 'Usuario',
        });

        if (asientoId) await updateDocRecibido(docId, { asientoId });
        if (f.docModificado) {
          try {
            await vincularConFactura(
              docId, f.proveedorRuc, f.docModificado, f.tipo, f.numero, f.total, fecha
            );
          } catch { /* no bloquea el registro del documento */ }
        }
        ok++;
        if (!asientoId) sinAsiento++;
      } catch {
        err++;
      }
      setTxtProgreso(i + 1);
    }

    setTxtResultado({ ok, sinAsiento, err });
    setTxtImporting(false);
    if (err === 0 && sinAsiento === 0) toast.success(`${ok} documento(s) importados correctamente`);
    else toast.warning(`Importación terminada: ${ok} ok, ${sinAsiento} sin asiento, ${err} con error`, { duration: 10000 });
  };

  return (
    <div>
      <PageHeader
        title="Documentos Recibidos (NC / ND)"
        description="Notas de crédito y débito de proveedores — contabilizadas automáticamente"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => txtRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Importar TXT del SRI
            </Button>
            <input ref={txtRef} type="file" accept=".txt" className="hidden" onChange={handleTxtUpload} />
            <Button size="sm" variant="outline" onClick={handleReintentarEnlaces} disabled={reintentando}
              title="Revisa las NC/ND sin enlazar contra todas las facturas registradas, por si su factura original ya se importó">
              {reintentando ? 'Reintentando…' : 'Reintentar enlaces automáticos'}
            </Button>
            <Button size="sm" onClick={() => { resetDialog(); setDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Registrar manualmente
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Buscar por proveedor, RUC o número…"
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <p className="text-xs text-slate-400">
          También puedes importar el XML del proveedor desde Facturas de Proveedores → "Importar XML"
          (detecta automáticamente si es factura, NC, ND o retención), o el TXT "Comprobantes Recibidos"
          del SRI arriba (se toman solo las filas de Nota de Crédito / Nota de Débito).
        </p>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Tipo</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Doc. modificado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}</TableRow>
              ))
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                  <FileX className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No hay notas de crédito/débito recibidas.
                </TableCell>
              </TableRow>
            ) : filtrados.map(d => (
              <TableRow key={d.id} className={d.anulado ? 'opacity-50' : ''}>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLOR[d.tipo] ?? ''}`}>
                    {TIPO_LABEL[d.tipo] ?? d.tipo}
                  </span>
                  {d.anulado && (
                    <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 align-middle">anulada</span>
                  )}
                </TableCell>
                <TableCell>
                  <p className={`font-medium text-sm ${d.anulado ? 'line-through' : ''}`}>{d.proveedorNombre}</p>
                  <p className="text-xs text-slate-400">{d.proveedorRuc}</p>
                </TableCell>
                <TableCell className="font-mono text-xs">{d.numero}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">
                  {d.docModificado ?? '—'}
                  {d.docModificado && (
                    d.facturaProveedorId
                      ? <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 align-middle">enlazada</span>
                      : <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 align-middle">sin enlazar</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-slate-500">
                  {format((d.fechaEmision as any)?.toDate?.() ?? new Date(d.fechaEmision), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell className="text-right text-sm">{currency(d.subtotal)}</TableCell>
                <TableCell className="text-right text-sm">{currency(d.iva)}</TableCell>
                <TableCell className={`text-right font-semibold ${d.anulado ? 'line-through' : ''}`}>{currency(d.total)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {!d.anulado && d.docModificado && !d.facturaProveedorId && (
                      <Button variant="outline" size="sm" className="h-7 text-xs"
                        onClick={() => abrirVincularManual(d)}>
                        {d.autorizacionModificado ? 'Editar autorización' : 'Vincular manual'}
                      </Button>
                    )}
                    {!d.anulado && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600"
                          title="Editar datos" onClick={() => abrirEditar(d)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600"
                          title="Anular" disabled={anulando === d.id} onClick={() => handleAnular(d)}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {d.anulado && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600"
                        title="Reactivar" disabled={anulando === d.id} onClick={() => handleReactivar(d)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Dialog registro manual */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Nota de Crédito / Débito de Proveedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={v => setTipo(v as TipoDocRecibido)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nota_credito">Nota de crédito</SelectItem>
                  <SelectItem value="nota_debito">Nota de débito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Proveedor *</Label>
                <Input value={proveedor} onChange={e => setProveedor(e.target.value)}
                  placeholder="Nombre del proveedor" className="mt-1" />
              </div>
              <div>
                <Label>RUC proveedor *</Label>
                <Input value={proveedorRuc} onChange={e => setProveedorRuc(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>N° del documento *</Label>
                <Input value={numero} onChange={e => setNumero(e.target.value)}
                  placeholder="001-001-000000123" className="mt-1" />
              </div>
              <div>
                <Label>Fecha de emisión *</Label>
                <Input type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)}
                  max={new Date().toISOString().split('T')[0]} className="mt-1" />
              </div>
              <div>
                <Label>Factura que modifica</Label>
                <Input value={docModificado} onChange={e => setDocModificado(e.target.value)}
                  placeholder="001-001-000000100 (opcional)" className="mt-1" />
              </div>
              <div>
                <Label>Clave de acceso (opcional)</Label>
                <Input value={claveAcceso} onChange={e => setClaveAcceso(e.target.value)}
                  placeholder="49 dígitos" className="mt-1 font-mono text-xs" />
              </div>
              <div>
                <Label>Subtotal sin IVA *</Label>
                <Input type="number" min="0" step="0.01" value={subtotal}
                  onChange={e => {
                    const v = Number(e.target.value) || 0;
                    setSubtotal(v);
                    setIva(parseFloat((v * 0.15).toFixed(2)));
                  }}
                  className="mt-1" />
              </div>
              <div>
                <Label>IVA</Label>
                <Input type="number" min="0" step="0.01" value={iva}
                  onChange={e => setIva(Number(e.target.value) || 0)} className="mt-1" />
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 flex justify-between font-bold text-base">
              <span>Total</span>
              <span className={tipo === 'nota_credito' ? 'text-emerald-600' : 'text-orange-600'}>
                {currency(subtotal + iva)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleRegistrar} disabled={saving}>
              {saving ? 'Registrando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog importación masiva TXT */}
      <Dialog open={txtDialogOpen} onOpenChange={(o) => { setTxtDialogOpen(o); if (!o) { setTxtFilas([]); setTxtResultado(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Notas de Crédito / Débito — TXT del SRI</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-600">
              <strong>{txtFilas.length}</strong> fila(s) leídas — <strong className="text-green-600">{txtValidas.length} válidas</strong>
              {txtFilas.length - txtValidas.length > 0 && (
                <span className="text-red-600"> · {txtFilas.length - txtValidas.length} con error</span>
              )}
            </p>
            <Button size="sm" onClick={importarTxt} disabled={txtImporting || txtValidas.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {txtImporting ? `Importando ${txtProgreso}/${txtValidas.length}…` : `Importar ${txtValidas.length} documento(s)`}
            </Button>
          </div>

          {txtResultado && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
              <p><CheckCircle2 className="inline h-4 w-4 text-green-600 mr-1" /> {txtResultado.ok} importado(s)</p>
              {txtResultado.sinAsiento > 0 && (
                <p className="text-amber-600">⚠ {txtResultado.sinAsiento} sin asiento contable — revisa Libro Diario</p>
              )}
              {txtResultado.err > 0 && (
                <p className="text-red-600"><XCircle className="inline h-4 w-4 mr-1" /> {txtResultado.err} con error</p>
              )}
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Tipo</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txtFilas.map(f => (
                    <TableRow key={f.idx} className={f.error ? 'bg-red-50' : ''}>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLOR[f.tipo]}`}>
                          {TIPO_LABEL[f.tipo]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <p>{f.proveedorNombre}</p>
                        <p className="text-xs text-slate-400 font-mono">{f.proveedorRuc}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{f.numero}</TableCell>
                      <TableCell className="text-sm">{f.fechaTexto || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{currency(f.subtotal)}</TableCell>
                      <TableCell className="text-right text-sm">{currency(f.iva)}</TableCell>
                      <TableCell className="text-right font-semibold text-sm">{currency(f.total)}</TableCell>
                      <TableCell>
                        {f.error
                          ? <span className="text-xs text-red-600">✗ {f.error}</span>
                          : <span className="text-xs text-green-600">✓ Lista</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog vincular manual: autorización de la factura original cuando no está en el sistema */}
      <Dialog open={!!vincularDoc} onOpenChange={(o) => !o && setVincularDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular con la factura original</DialogTitle>
          </DialogHeader>
          {vincularDoc && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                No se encontró la factura <strong>{vincularDoc.docModificado}</strong> de{' '}
                <strong>{vincularDoc.proveedorNombre}</strong> registrada en el sistema, así que no se
                pudo enlazar automáticamente. El ATS exige igual el número de autorización (clave de
                acceso) de esa factura — podés obtenerlo en el portal del SRI, en "Documentos
                relacionados" de esta nota.
              </p>
              <div>
                <Label>Número de autorización / clave de acceso de la factura original *</Label>
                <Input value={autModificado} onChange={e => setAutModificado(e.target.value)}
                  placeholder="49 dígitos" className="mt-1 font-mono text-xs" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVincularDoc(null)} disabled={savingVincular}>Cancelar</Button>
            <Button onClick={guardarVinculoManual} disabled={savingVincular}>
              {savingVincular ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar datos básicos */}
      <Dialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar documento</DialogTitle>
          </DialogHeader>
          {editDoc && (
            <div className="space-y-3">
              <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
                Esto corrige datos de identificación, no el monto ni la contabilización. Si el
                subtotal/IVA está mal, anula el documento y regístralo de nuevo con el valor correcto.
              </p>
              <div>
                <Label>Proveedor *</Label>
                <Input value={editProveedor} onChange={e => setEditProveedor(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Número *</Label>
                <Input value={editNumero} onChange={e => setEditNumero(e.target.value)} className="mt-1 font-mono text-xs" />
              </div>
              <div>
                <Label>Fecha de emisión *</Label>
                <Input type="date" value={editFecha} max={new Date().toISOString().split('T')[0]}
                  onChange={e => setEditFecha(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Factura que modifica</Label>
                <Input value={editDocMod} onChange={e => setEditDocMod(e.target.value)}
                  placeholder="001-001-000000100 (opcional)" className="mt-1 font-mono text-xs" />
                {editDoc.facturaProveedorId && (
                  <p className="text-xs text-amber-600 mt-1">
                    Ya está enlazada a una factura — cambiar este número no mueve el enlace ni el ajuste ya aplicado.
                  </p>
                )}
              </div>
              <div>
                <Label>Clave de acceso</Label>
                <Input value={editClave} onChange={e => setEditClave(e.target.value)}
                  placeholder="49 dígitos (opcional)" className="mt-1 font-mono text-xs" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDoc(null)} disabled={savingEdit}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={savingEdit}>
              {savingEdit ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
