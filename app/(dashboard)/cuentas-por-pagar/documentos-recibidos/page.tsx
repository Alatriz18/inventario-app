'use client';

import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { FileX } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Input }   from '@/components/ui/input';
import { Skeleton }from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { DocumentoRecibido } from '@/types';
import { subscribeToDocsRecibidos } from '@/lib/firebase/docs-recibidos';

const currency = (v: number) => `$${(v ?? 0).toFixed(2)}`;
const TIPO_LABEL: Record<string, string> = { nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito' };
const TIPO_COLOR: Record<string, string> = {
  nota_credito: 'bg-emerald-50 text-emerald-700',
  nota_debito:  'bg-orange-50 text-orange-700',
};

export default function DocumentosRecibidosPage() {
  const [docs,    setDocs]    = useState<DocumentoRecibido[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => subscribeToDocsRecibidos(d => { setDocs(d); setLoading(false); }), []);

  const filtrados = useMemo(() => docs.filter(d =>
    !search ||
    d.proveedorNombre.toLowerCase().includes(search.toLowerCase()) ||
    d.proveedorRuc.includes(search) ||
    d.numero.includes(search)
  ), [docs, search]);

  return (
    <div>
      <PageHeader
        title="Documentos Recibidos (NC / ND)"
        description="Notas de crédito y débito de proveedores importadas por XML — contabilizadas automáticamente"
      />

      <div className="mb-4">
        <Input placeholder="Buscar por proveedor, RUC o número…"
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
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
                  No hay notas de crédito/débito recibidas. Impórtalas en Facturas de Proveedores.
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
    </div>
  );
}
