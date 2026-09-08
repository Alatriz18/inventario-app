'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { FileX, Plus } from 'lucide-react';
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
  crearAsientoNotaCreditoRecibida, crearAsientoNotaDebitoRecibida,
} from '@/lib/contabilidad/motor-asientos';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${(v ?? 0).toFixed(2)}`;
const TIPO_LABEL: Record<string, string> = { nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito' };
const TIPO_COLOR: Record<string, string> = {
  nota_credito: 'bg-emerald-50 text-emerald-700',
  nota_debito:  'bg-orange-50 text-orange-700',
};

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

  useEffect(() => subscribeToDocsRecibidos(d => { setDocs(d); setLoading(false); }), []);

  const filtrados = useMemo(() => docs.filter(d =>
    !search ||
    d.proveedorNombre.toLowerCase().includes(search.toLowerCase()) ||
    d.proveedorRuc.includes(search) ||
    d.numero.includes(search)
  ), [docs, search]);

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

      if (asientoId) {
        await updateDocRecibido(docId, { asientoId });
        toast.success(`${TIPO_LABEL[tipo]} registrada — contabilizada automáticamente`);
      } else {
        toast.warning(`${TIPO_LABEL[tipo]} registrada, pero el asiento contable NO se pudo generar. Revísala en Contabilidad → Libro Diario.`, { duration: 12000 });
      }
      setDialogOpen(false);
      resetDialog();
    } catch (e: any) {
      toast.error(e.message ?? 'Error al registrar el documento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Documentos Recibidos (NC / ND)"
        description="Notas de crédito y débito de proveedores — contabilizadas automáticamente"
        action={
          <Button size="sm" onClick={() => { resetDialog(); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Registrar manualmente
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Buscar por proveedor, RUC o número…"
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <p className="text-xs text-slate-400">
          También puedes importar el XML del proveedor desde Facturas de Proveedores → "Importar XML"
          (detecta automáticamente si es factura, NC, ND o retención).
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}</TableRow>
              ))
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  <FileX className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No hay notas de crédito/débito recibidas.
                </TableCell>
              </TableRow>
            ) : filtrados.map(d => (
              <TableRow key={d.id}>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLOR[d.tipo] ?? ''}`}>
                    {TIPO_LABEL[d.tipo] ?? d.tipo}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="font-medium text-sm">{d.proveedorNombre}</p>
                  <p className="text-xs text-slate-400">{d.proveedorRuc}</p>
                </TableCell>
                <TableCell className="font-mono text-xs">{d.numero}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">{d.docModificado ?? '—'}</TableCell>
                <TableCell className="text-sm text-slate-500">
                  {format((d.fechaEmision as any)?.toDate?.() ?? new Date(d.fechaEmision), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell className="text-right text-sm">{currency(d.subtotal)}</TableCell>
                <TableCell className="text-right text-sm">{currency(d.iva)}</TableCell>
                <TableCell className="text-right font-semibold">{currency(d.total)}</TableCell>
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
    </div>
  );
}
