'use client';

import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { FileSearch, Download, FileText } from 'lucide-react';
import { create } from 'xmlbuilder2';
import * as XLSX from 'xlsx';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Separator }from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { Venta, FacturaProveedor } from '@/types';
import { subscribeToVentas }              from '@/lib/firebase/ventas';
import { subscribeToFacturasProveedor }   from '@/lib/firebase/facturas-proveedor';
import { getConfigSRI }                   from '@/lib/firebase/config-sri';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const TIPO_ID_MAP: Record<string, string> = {
  ruc:'04', cedula:'05', pasaporte:'06',
  consumidor_final:'07', identificacion_exterior:'08',
};

function currency(v: number) { return `$${v.toFixed(2)}`; }

function formatFecha(fecha: any) {
  const d = fecha?.toDate?.() ?? new Date(fecha);
  const dd = String(d.getDate()).padStart(2,'0');
  const MM = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${MM}/${yyyy}`;
}

export default function ATSPage() {
  const [ventas,    setVentas]    = useState<Venta[]>([]);
  const [compras,   setCompras]   = useState<FacturaProveedor[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [anio,      setAnio]      = useState(String(new Date().getFullYear()));
  const [mes,       setMes]       = useState(String(new Date().getMonth() + 1));
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    const u1 = subscribeToVentas(d => { setVentas(d); setLoading(false); });
    const u2 = subscribeToFacturasProveedor(setCompras);
    return () => { u1(); u2(); };
  }, []);

  const filtrar = (items: any[]) => {
    return items.filter(item => {
      const fecha = item.fecha?.toDate?.() ?? item.fechaEmision?.toDate?.()
        ?? new Date(item.fecha ?? item.fechaEmision);
      return fecha.getFullYear() === Number(anio) && fecha.getMonth() + 1 === Number(mes);
    });
  };

  const ventasMes  = useMemo(() => filtrar(ventas.filter(v => v.estado !== 'anulada')), [ventas, anio, mes]);
  const comprasMes = useMemo(() => filtrar(compras), [compras, anio, mes]);

  const resumen = useMemo(() => ({
    totalVentas:   ventasMes.reduce((s, v) => s + v.total, 0),
    totalCompras:  comprasMes.reduce((s, f) => s + f.total, 0),
    ivaVentas:     ventasMes.reduce((s, v) => s + (v.total - v.subtotal), 0),
    ivaCompras:    comprasMes.reduce((s, f) => s + f.iva, 0),
    numVentas:     ventasMes.length,
    numCompras:    comprasMes.length,
  }), [ventasMes, comprasMes]);

  const exportExcel = () => {
    const wsVentas = XLSX.utils.json_to_sheet(
      ventasMes.map(v => ({
        Fecha:         formatFecha(v.fecha),
        TipoID:        TIPO_ID_MAP[v.clienteIdentificacion?.length === 13 ? 'ruc' : 'cedula'] ?? '07',
        Identificacion:v.clienteIdentificacion,
        Cliente:       v.clienteNombre,
        Base0:         0,
        Base15:        v.subtotal,
        IVA:           v.total - v.subtotal,
        Total:         v.total,
      }))
    );
    const wsCompras = XLSX.utils.json_to_sheet(
      comprasMes.map(f => ({
        Fecha:    formatFecha(f.fechaEmision),
        RUC:      f.proveedorRuc,
        Proveedor:f.proveedorNombre,
        Numero:   f.numeroFactura,
        Base0:    f.subtotal0,
        Base15:   f.subtotal12,
        IVA:      f.iva,
        Total:    f.total,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsVentas,  'Ventas');
    XLSX.utils.book_append_sheet(wb, wsCompras, 'Compras');
    XLSX.writeFile(wb, `ATS_${anio}_${mes.padStart(2,'0')}.xlsx`);
  };

  const generarXML = async () => {
    setGenerando(true);
    try {
      const config = await getConfigSRI();
      if (!config) { toast.error('Configura el SRI primero'); return; }

      const doc = create({ version:'1.0', encoding:'UTF-8' })
        .ele('iva', { id:'informacionATS' });

      doc.ele('TipoIDInformante').txt('04');
      doc.ele('IdInformante').txt(config.ruc);
      doc.ele('razonSocial').txt(config.razonSocial);
      doc.ele('Anio').txt(anio);
      doc.ele('Mes').txt(mes.padStart(2,'0'));
      doc.ele('numEstabRuc').txt(config.establecimiento.padStart(3,'0'));
      doc.ele('totalVentas').txt(resumen.totalVentas.toFixed(2));
      doc.ele('codigoOperativo').txt('IVA');

      // Compras
      const comprasNode = doc.ele('compras');
      comprasMes.forEach(f => {
        const det = comprasNode.ele('detalleCompras');
        det.ele('codSustento').txt('01');
        det.ele('tpIdProv').txt('04');
        det.ele('idProv').txt(f.proveedorRuc);
        det.ele('tipoComp').txt('01');
        det.ele('parteRel').txt('NO');
        const fechaEmi = f.fechaEmision?.toDate?.() ?? new Date(f.fechaEmision);
        det.ele('fechaRegistro').txt(formatFecha(fechaEmi));
        const numParts = f.numeroFactura.split('-');
        det.ele('establecimiento').txt((numParts[0] ?? '001').padStart(3,'0'));
        det.ele('puntoEmision').txt((numParts[1] ?? '001').padStart(3,'0'));
        det.ele('secuencial').txt((numParts[2] ?? '000000001').padStart(9,'0'));
        det.ele('fechaEmision').txt(formatFecha(fechaEmi));
        det.ele('autorizacion').txt(f.claveAcceso ?? f.numeroFactura);
        det.ele('baseNoGraIva').txt('0.00');
        det.ele('baseImponible').txt(f.subtotal0.toFixed(2));
        det.ele('baseImpGrav').txt(f.subtotal12.toFixed(2));
        det.ele('montoIva').txt(f.iva.toFixed(2));
        det.ele('montoIce').txt('0.00');
        det.ele('valorRetBien10').txt('0.00');
        det.ele('valorRetServ20').txt('0.00');
        det.ele('valorRetServ50').txt('0.00');
        det.ele('valorRetIva100').txt('0.00');
        det.ele('valorRetIva70').txt('0.00');
        det.ele('formaPago').txt('01');
      });

      // Ventas agrupadas por cliente y tipo de comprobante
      const ventasNode = doc.ele('ventas');
      const grupoVentas = new Map<string, {
        tpId:string; idCliente:string; tipoComp:string;
        base0:number; base15:number; iva:number; total:number; num:number;
      }>();

      ventasMes.forEach(v => {
        const tpId = v.clienteIdentificacion === '9999999999999' ? '07'
          : v.clienteIdentificacion?.length === 13 ? '04' : '05';
        const tipoComp = '18'; // nota de venta default
        const key = `${v.clienteIdentificacion}-${tipoComp}`;
        const prev = grupoVentas.get(key) ?? { tpId, idCliente:v.clienteIdentificacion,
          tipoComp, base0:0, base15:0, iva:0, total:0, num:0 };
        grupoVentas.set(key, {
          ...prev,
          base15: prev.base15 + v.subtotal,
          iva:    prev.iva    + (v.total - v.subtotal),
          total:  prev.total  + v.total,
          num:    prev.num    + 1,
        });
      });

      grupoVentas.forEach(g => {
        const det = ventasNode.ele('detalleVentas');
        det.ele('tpIdCliente').txt(g.tpId);
        det.ele('idCliente').txt(g.idCliente);
        det.ele('parteRelVtas').txt('NO');
        det.ele('tipoComprobante').txt(g.tipoComp);
        det.ele('tipoEm').txt('E');
        det.ele('numeroComprobantes').txt(String(g.num));
        det.ele('baseNoGraIva').txt('0.00');
        det.ele('baseImponible').txt(g.base0.toFixed(2));
        det.ele('baseImpGrav').txt(g.base15.toFixed(2));
        det.ele('montoIva').txt(g.iva.toFixed(2));
        det.ele('montoIce').txt('0.00');
        det.ele('valorRetBien').txt('0.00');
        det.ele('valorRetServ').txt('0.00');
        det.ele('valorRetIva').txt('0.00');
      });

      const xmlStr = doc.end({ prettyPrint: true });
      const blob   = new Blob([xmlStr], { type: 'text/xml' });
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement('a');
      a.href       = url;
      a.download   = `ATS_${anio}_${mes.padStart(2,'0')}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('XML ATS generado correctamente para DIMM');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al generar XML');
    } finally {
      setGenerando(false);
    }
  };

  const anios = Array.from({length:4}, (_,i) => String(new Date().getFullYear() - 1 + i));

  return (
    <div>
      <PageHeader
        title="ATS — Anexo Transaccional Simplificado"
        description="Genera el XML para cargar en DIMM del SRI Ecuador"
      />

      {/* Selector período */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center mb-5">
        <Select onValueChange={setAnio} defaultValue={anio}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anios.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select onValueChange={setMes} defaultValue={mes}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">
          {MESES[Number(mes)-1]} {anio}
        </Badge>
      </div>

      {/* Resumen del período */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {[
          { label:'Ventas del mes',   value:currency(resumen.totalVentas),  sub:`${resumen.numVentas} transacciones`,  color:'text-green-600' },
          { label:'Compras del mes',  value:currency(resumen.totalCompras), sub:`${resumen.numCompras} facturas`,      color:'text-blue-600'  },
          { label:'IVA neto',         value:currency(resumen.ivaVentas - resumen.ivaCompras),
            sub:`V:${currency(resumen.ivaVentas)} C:${currency(resumen.ivaCompras)}`,
            color: resumen.ivaVentas - resumen.ivaCompras >= 0 ? 'text-red-600' : 'text-green-600' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Botones de exportación */}
      <div className="flex gap-3 mb-5">
        <Button variant="outline" onClick={exportExcel}
          disabled={loading || (ventasMes.length === 0 && comprasMes.length === 0)}>
          <Download className="mr-2 h-4 w-4" /> Exportar Excel
        </Button>
        <Button onClick={generarXML} disabled={generando || loading}
          className="bg-slate-900 hover:bg-slate-800">
          <FileText className={`mr-2 h-4 w-4 ${generando ? 'animate-spin' : ''}`} />
          {generando ? 'Generando...' : 'Generar XML para DIMM'}
        </Button>
      </div>

      {/* Detalle ventas */}
      <div className="bg-white rounded-xl border overflow-hidden mb-4">
        <div className="px-4 py-3 border-b bg-green-50">
          <p className="font-semibold text-green-800 text-sm">
            Ventas — {ventasMes.length} transacciones
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Identificación</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({length:3}).map((_,i) => (
                <TableRow key={i}>{Array.from({length:6}).map((_,j) =>
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
              ))
            ) : ventasMes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-slate-400 text-sm">
                  Sin ventas en el período.
                </TableCell>
              </TableRow>
            ) : ventasMes.map(v => (
              <TableRow key={v.id}>
                <TableCell className="text-sm text-slate-500">{formatFecha(v.fecha)}</TableCell>
                <TableCell className="text-sm font-medium">{v.clienteNombre}</TableCell>
                <TableCell className="font-mono text-xs">{v.clienteIdentificacion}</TableCell>
                <TableCell className="text-right text-sm">{currency(v.subtotal)}</TableCell>
                <TableCell className="text-right text-sm">{currency(v.total - v.subtotal)}</TableCell>
                <TableCell className="text-right font-semibold">{currency(v.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detalle compras */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-blue-50">
          <p className="font-semibold text-blue-800 text-sm">
            Compras / Facturas Proveedores — {comprasMes.length} facturas
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>RUC</TableHead>
              <TableHead>Número</TableHead>
              <TableHead className="text-right">Base 15%</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comprasMes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-slate-400 text-sm">
                  Sin facturas de proveedores en el período.
                </TableCell>
              </TableRow>
            ) : comprasMes.map(f => (
              <TableRow key={f.id}>
                <TableCell className="text-sm text-slate-500">{formatFecha(f.fechaEmision)}</TableCell>
                <TableCell className="text-sm font-medium">{f.proveedorNombre}</TableCell>
                <TableCell className="font-mono text-xs">{f.proveedorRuc}</TableCell>
                <TableCell className="font-mono text-xs">{f.numeroFactura}</TableCell>
                <TableCell className="text-right text-sm">{currency(f.subtotal12)}</TableCell>
                <TableCell className="text-right text-sm">{currency(f.iva)}</TableCell>
                <TableCell className="text-right font-semibold">{currency(f.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}