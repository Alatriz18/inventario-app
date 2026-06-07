'use client';

import { useEffect, useState } from 'react';
import { useSearchParams }      from 'next/navigation';
import { toast }                from 'sonner';
import { FileText, Download, Eye, Printer } from 'lucide-react';

import PageHeader   from '@/components/shared/PageHeader';
import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { subscribeToVentas } from '@/lib/firebase/ventas';
import { getConfigSRI }      from '@/lib/firebase/config-sri';
import { Venta }             from '@/types';
import { descargarRIDE, abrirRIDEenNuevaPestana, DatosRIDE } from '@/lib/sri/ride-pdf';

function currency(v: number) { return `$${v.toFixed(2)}`; }

function buildReciboDesdeVenta(venta: Venta, config: any): DatosRIDE {
  const fecha = (venta.fecha as any)?.toDate?.() ?? new Date(venta.fecha as any);
  return {
    tipoDocumento:           'recibo_interno',
    razonSocial:             config.razonSocial,
    nombreComercial:         config.nombreComercial,
    ruc:                     config.ruc,
    direccionMatriz:         config.direccionMatriz,
    establecimiento:         config.establecimiento,
    puntoEmision:            config.puntoEmision,
    obligadoContabilidad:    config.obligadoContabilidad ?? 'NO',
    ambiente:                config.ambiente ?? '1',
    secuencial:              0, // recibos internos no tienen secuencial SRI
    fechaEmision:            fecha,
    tipoIdComprador:         inferirTipoId(venta.clienteIdentificacion),
    identificacionComprador: venta.clienteIdentificacion,
    razonSocialComprador:    venta.clienteNombre,
    items: venta.items.map(it => ({
      codigo:         it.sku ?? '-',
      descripcion:    it.nombre,
      cantidad:       it.cantidad,
      precioUnitario: it.precioUnitario,
      descuento:      it.precioUnitario * it.cantidad * ((it.descuento ?? 0) / 100),
      subtotal:       it.subtotal,
      tieneIVA:       false,
    })),
    subtotal0:      venta.subtotal,
    subtotal15:     0,
    totalDescuento: venta.subtotal * ((venta.descuentoGlobal ?? 0) / 100),
    iva:            0,
    total:          venta.total,
    formaPago:      venta.metodoPago ?? 'efectivo',
    mensajeAdicional: 'Documento sin validez tributaria — solo control interno',
  };
}

function inferirTipoId(id: string): string {
  if (!id || id === '9999999999999') return '07';
  if (id.length === 13) return '04';
  if (id.length === 10) return '05';
  return '06';
}

export default function ReciboInternoPage() {
  const searchParams = useSearchParams();
  const [ventas,   setVentas]   = useState<Venta[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [config,   setConfig]   = useState<any>(null);
  const [generando, setGenerando] = useState<string | null>(null);

  useEffect(() => {
    const u = subscribeToVentas(d => { setVentas(d); setLoading(false); });
    getConfigSRI().then(setConfig);
    return u;
  }, []);

  // Si viene ventaId por query param, genera el recibo automáticamente
  useEffect(() => {
    const ventaId = searchParams.get('ventaId');
    if (!ventaId || !config) return;
    const venta = ventas.find(v => v.id === ventaId);
    if (venta) handleDescargar(venta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, config, ventas]);

  const handleDescargar = async (venta: Venta) => {
    if (!config) { toast.error('Configura el SRI primero'); return; }
    setGenerando(venta.id!);
    try {
      const datos = buildReciboDesdeVenta(venta, config);
      descargarRIDE(datos, `Recibo-${venta.id?.slice(-6)}.pdf`);
      toast.success('Recibo descargado');
    } catch { toast.error('Error al generar recibo'); }
    finally { setGenerando(null); }
  };

  const handleVer = async (venta: Venta) => {
    if (!config) { toast.error('Configura el SRI primero'); return; }
    setGenerando(venta.id!);
    try {
      const datos = buildReciboDesdeVenta(venta, config);
      abrirRIDEenNuevaPestana(datos);
    } catch { toast.error('Error al generar recibo'); }
    finally { setGenerando(null); }
  };

  // Solo ventas completadas sin comprobante electrónico
  const ventasSinComp = ventas.filter(
    v => v.estado === 'completada' && !v.comprobanteId
  );

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;

  return (
    <div>
      <PageHeader
        title="Recibos Internos"
        description="Genera recibos de control interno para ventas sin comprobante electrónico SRI"
      />

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 text-sm text-amber-800">
        <strong>Nota:</strong> Los recibos internos <strong>no tienen validez tributaria</strong>.
        No reemplazan a una factura ni a una nota de venta. Úsalos solo como comprobante interno
        para el cliente que no requiere documento electrónico.
      </div>

      {ventasSinComp.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p>No hay ventas sin comprobante electrónico</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Identificación</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventasSinComp.map(v => {
                const fecha = (v.fecha as any)?.toDate?.() ?? new Date(v.fecha as any);
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm">
                      {fecha.toLocaleDateString('es-EC')}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{v.clienteNombre}</TableCell>
                    <TableCell className="text-sm text-slate-500 font-mono">
                      {v.clienteIdentificacion}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-sm">
                      {currency(v.total)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {v.metodoPago ?? 'efectivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 justify-center">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => handleVer(v)}
                          disabled={generando === v.id}
                          className="h-7 gap-1 text-xs"
                        >
                          <Eye className="h-3 w-3" />
                          Ver
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => handleDescargar(v)}
                          disabled={generando === v.id}
                          className="h-7 gap-1 text-xs"
                        >
                          <Download className="h-3 w-3" />
                          {generando === v.id ? 'Generando...' : 'PDF'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
