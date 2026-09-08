'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Upload, FileSpreadsheet, CheckCircle2, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

import PageHeader   from '@/components/shared/PageHeader';
import { Button }   from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { MetodoPago, ItemVenta } from '@/types';
import { createVenta } from '@/lib/firebase/ventas';
import { createComprobante } from '@/lib/firebase/comprobantes';
import { vincularComprobante } from '@/lib/firebase/ventas';
import { getOrCreateClientePorIdentificacion } from '@/lib/firebase/clientes';
import { crearAsientoVenta } from '@/lib/contabilidad/motor-asientos';
import { useAuth } from '@/context/AuthContext';

const currency = (v: number) => `$${(v ?? 0).toFixed(2)}`;

const METODOS_VALIDOS: Record<string, MetodoPago> = {
  efectivo: 'efectivo', tarjeta: 'tarjeta', transferencia: 'transferencia',
  deposito: 'deposito', 'depósito': 'deposito', cheque: 'cheque',
  credito: 'credito', 'crédito': 'credito',
};

interface FilaLote {
  idx:             number;
  fecha:           Date | null;
  fechaTexto:      string;
  cliente:         string;
  identificacion:  string;
  subtotal:        number;
  iva:             number;
  total:           number;
  metodoPago:      MetodoPago | null;
  diasCredito?:    number;
  tipoComprobante?:'factura' | 'nota_venta';
  numComprobante?: string;
  claveAcceso?:    string;
  numAutorizacion?:string;
  error?:          string;
}

function normalizaClave(obj: Record<string, any>, claves: string[]): any {
  const keys = Object.keys(obj);
  for (const c of claves) {
    const k = keys.find(k => k.trim().toLowerCase() === c);
    if (k !== undefined) return obj[k];
  }
  return undefined;
}

function parseFechaCelda(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseFilas(rows: Record<string, any>[]): FilaLote[] {
  return rows.map((row, i) => {
    const fecha          = parseFechaCelda(normalizaClave(row, ['fecha']));
    const cliente         = String(normalizaClave(row, ['cliente', 'nombre']) ?? '').trim();
    const identificacion  = String(normalizaClave(row, ['identificacion', 'identificación', 'ruc/cedula', 'ruc']) ?? '9999999999999').trim() || '9999999999999';
    const subtotal        = Number(normalizaClave(row, ['subtotal', 'base', 'base imponible'])) || 0;
    let   iva              = normalizaClave(row, ['iva']);
    iva = iva === undefined || iva === '' ? parseFloat((subtotal * 0.15).toFixed(2)) : Number(iva) || 0;
    const metodoRaw        = String(normalizaClave(row, ['metodopago', 'metodo de pago', 'método de pago', 'metodo']) ?? '').trim().toLowerCase();
    const metodoPago       = METODOS_VALIDOS[metodoRaw] ?? null;
    const diasCreditoRaw   = normalizaClave(row, ['diascredito', 'dias credito', 'días de crédito']);
    const tipoCompRaw      = String(normalizaClave(row, ['tipocomprobante', 'tipo comprobante']) ?? '').trim().toLowerCase();
    const tipoComprobante  = tipoCompRaw.includes('factura') ? 'factura' : tipoCompRaw.includes('nota') ? 'nota_venta' : undefined;
    const numComprobante   = String(normalizaClave(row, ['numcomprobante', 'n comprobante', 'n° comprobante', 'numero comprobante']) ?? '').trim() || undefined;
    const claveAcceso      = String(normalizaClave(row, ['claveacceso', 'clave de acceso']) ?? '').trim() || undefined;
    const numAutorizacion  = String(normalizaClave(row, ['numautorizacion', 'n autorizacion', 'n° autorización', 'numero autorizacion']) ?? '').trim() || undefined;

    const fila: FilaLote = {
      idx: i + 2, // fila real en Excel (1 = encabezado)
      fecha, fechaTexto: fecha ? fecha.toLocaleDateString('es-EC') : '',
      cliente: cliente || 'CONSUMIDOR FINAL', identificacion,
      subtotal, iva, total: parseFloat((subtotal + iva).toFixed(2)),
      metodoPago, diasCredito: diasCreditoRaw ? Number(diasCreditoRaw) : undefined,
      tipoComprobante, numComprobante, claveAcceso, numAutorizacion,
    };

    if (!fecha)                         fila.error = 'Fecha inválida o vacía';
    else if (fecha > new Date())        fila.error = 'La fecha no puede ser futura';
    else if (subtotal <= 0)             fila.error = 'Subtotal debe ser mayor a 0';
    else if (!metodoPago)               fila.error = `Método de pago inválido (${metodoRaw || 'vacío'})`;
    else if (metodoPago === 'credito' && !fila.diasCredito) fila.error = 'Falta días de crédito';

    return fila;
  });
}

export default function VentasHistoricoLotePage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filas,      setFilas]      = useState<FilaLote[]>([]);
  const [importando, setImportando] = useState(false);
  const [progreso,   setProgreso]   = useState(0);
  const [resultado,  setResultado]  = useState<{ ok: number; sinAsiento: number; err: number } | null>(null);

  const descargarPlantilla = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        Fecha: '15/03/2026', Cliente: 'CRIOLLO CHAMBA LUIS ANIBAL', Identificacion: '1234567890',
        Subtotal: 100, IVA: 15, MetodoPago: 'efectivo', DiasCredito: '',
        TipoComprobante: '', NumComprobante: '', ClaveAcceso: '', NumAutorizacion: '',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
    XLSX.writeFile(wb, 'Plantilla_Ventas_Historicas.xlsx');
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        if (rows.length === 0) { toast.error('El archivo no tiene filas de datos'); return; }
        setFilas(parseFilas(rows));
        setResultado(null);
      } catch {
        toast.error('No se pudo leer el archivo. Verifica que sea el formato de la plantilla.');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const validas = filas.filter(f => !f.error);

  const importar = async () => {
    if (!user || validas.length === 0) return;
    setImportando(true);
    setProgreso(0);
    let ok = 0, sinAsiento = 0, err = 0;

    for (let i = 0; i < validas.length; i++) {
      const f = validas[i];
      try {
        const cli = await getOrCreateClientePorIdentificacion(f.identificacion, f.cliente);
        const item: ItemVenta = {
          productoId: 'venta-historica', sku: 'VENTA-HIST',
          nombre: 'Venta histórica (carga por lote)',
          cantidad: 1, precioUnitario: f.subtotal, precioCompra: 0,
          descuento: 0, subtotal: f.subtotal, ganancia: 0,
        };
        const fecha = f.fecha!;
        const ventaId = await createVenta(
          {
            fecha, clienteId: cli.id, clienteNombre: cli.nombre, clienteIdentificacion: cli.identificacion,
            items: [item], subtotal: f.subtotal, descuentoGlobal: 0, total: f.total, gananciaTotal: 0,
            metodoPago: f.metodoPago!, estado: 'completada',
            esCxC: f.metodoPago === 'credito', ...(f.diasCredito ? { diasCredito: f.diasCredito } : {}),
            afectaInventario: false,
            usuarioId: user.uid, usuarioNombre: user.nombre,
          },
          user.uid, user.nombre
        );

        if (f.numComprobante) {
          const parts = f.numComprobante.split('-');
          const serie = parts.length >= 3 ? `${parts[0]}-${parts[1]}` : '';
          const secuencial = parts.length >= 3 ? parts[2] : f.numComprobante;
          const compId = await createComprobante({
            tipo: f.tipoComprobante ?? 'factura', ventaId,
            claveAcceso: f.claveAcceso ?? '', secuencial, serie, fechaEmision: fecha,
            clienteNombre: cli.nombre, clienteIdentificacion: cli.identificacion,
            subtotal: f.subtotal, iva: f.iva, total: f.total, estado: 'autorizado',
            numeroAutorizacion: f.numAutorizacion, fechaAutorizacion: fecha.toISOString(),
            emailEnviado: false, mensajesSRI: [],
            usuarioId: user.uid, usuarioNombre: user.nombre, createdAt: new Date(),
          });
          await vincularComprobante(ventaId, compId);
        }

        const asientoId = await crearAsientoVenta({
          ventaId, fecha, clienteNombre: cli.nombre, tieneIVA: f.iva > 0,
          subtotal: f.subtotal, iva: f.iva, total: f.total, costoVenta: 0,
          esCxC: f.metodoPago === 'credito',
          usuarioId: user.uid, usuarioNombre: user.nombre,
        });
        if (asientoId) ok++; else { ok++; sinAsiento++; }
      } catch {
        err++;
      }
      setProgreso(i + 1);
    }

    setResultado({ ok, sinAsiento, err });
    setImportando(false);
    if (err === 0 && sinAsiento === 0) toast.success(`${ok} venta(s) importadas correctamente`);
    else toast.warning(`Importación terminada: ${ok} ok, ${sinAsiento} sin asiento, ${err} con error`, { duration: 10000 });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ventas Anteriores por Lote"
        description="Carga masiva de ventas de meses anteriores — solo registro contable, no afecta inventario ni emite comprobante SRI"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={descargarPlantilla}>
              <Download className="mr-2 h-4 w-4" /> Descargar plantilla
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Subir archivo
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
          </div>
        }
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Cómo funciona</p>
        <p>1. Descarga la plantilla y llénala con una fila por venta (fecha real de cada venta, no la de hoy).</p>
        <p>2. Súbela aquí — se previsualizan todas las filas antes de importar nada.</p>
        <p>3. Cada venta se registra igual que una "venta histórica" del POS: no descuenta inventario, no emite comprobante SRI,
           y genera su asiento contable con la fecha real (para que ATS/Form. 104 la tomen del mes correcto).</p>
        <p>4. Si además ya tienes esa venta facturada electrónicamente, llena NumComprobante/ClaveAcceso/NumAutorizacion
           para que aparezca autorizada en Reportes → Facturas Emitidas.</p>
      </div>

      {filas.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-600">
              <strong>{filas.length}</strong> fila(s) leídas — <strong className="text-green-600">{validas.length} válidas</strong>
              {filas.length - validas.length > 0 && (
                <span className="text-red-600"> · {filas.length - validas.length} con error</span>
              )}
            </p>
            <Button size="sm" onClick={importar} disabled={importando || validas.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {importando ? `Importando ${progreso}/${validas.length}…` : `Importar ${validas.length} venta(s)`}
            </Button>
          </div>

          {resultado && (
            <div className="bg-white rounded-xl border p-4 text-sm space-y-1">
              <p><CheckCircle2 className="inline h-4 w-4 text-green-600 mr-1" /> {resultado.ok} importada(s)</p>
              {resultado.sinAsiento > 0 && (
                <p className="text-amber-600">⚠ {resultado.sinAsiento} sin asiento contable — revisa Libro Diario</p>
              )}
              {resultado.err > 0 && (
                <p className="text-red-600"><XCircle className="inline h-4 w-4 mr-1" /> {resultado.err} con error</p>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Fila</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Identificación</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map(f => (
                    <TableRow key={f.idx} className={f.error ? 'bg-red-50' : ''}>
                      <TableCell className="text-xs text-slate-400">{f.idx}</TableCell>
                      <TableCell className="text-sm">{f.fechaTexto || '—'}</TableCell>
                      <TableCell className="text-sm">{f.cliente}</TableCell>
                      <TableCell className="font-mono text-xs">{f.identificacion}</TableCell>
                      <TableCell className="text-right text-sm">{currency(f.subtotal)}</TableCell>
                      <TableCell className="text-right text-sm">{currency(f.iva)}</TableCell>
                      <TableCell className="text-right font-semibold text-sm">{currency(f.total)}</TableCell>
                      <TableCell className="text-sm text-slate-500">{f.metodoPago ?? '—'}</TableCell>
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
        </>
      )}
    </div>
  );
}
