'use client';

import { useEffect, useState, Suspense } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Label }   from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { subscribeToVentas } from '@/lib/firebase/ventas';
import { createComprobante, updateComprobante } from '@/lib/firebase/comprobantes';
import { getConfigSRI, incrementarSecuencial } from '@/lib/firebase/config-sri';
import { generarXMLFactura }   from '@/lib/sri/generador-factura';
import { generarXMLNotaVenta } from '@/lib/sri/generador-nota-venta';
import { generarClaveAcceso }  from '@/lib/sri/clave-acceso';
import { Venta } from '@/types';
import { useAuth } from '@/context/AuthContext';

const FORMA_PAGO_MAP: Record<string, string> = {
  efectivo:      '01',
  tarjeta:       '16',
  transferencia: '19',
};

const TIPO_ID_MAP: Record<string, string> = {
  ruc:                    '04',
  cedula:                 '05',
  pasaporte:              '06',
  consumidor_final:       '07',
  identificacion_exterior:'08',
};

function EmitirComprobanteInner() {
  const { user }      = useAuth();
  const searchParams  = useSearchParams();
  const [ventas,   setVentas]   = useState<Venta[]>([]);
  const [ventaId,  setVentaId]  = useState('');
  const [tipo,     setTipo]     = useState<'factura' | 'nota_venta'>('factura');
  const [loading,  setLoading]  = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [resultado,  setResultado]  = useState<any>(null);

  // Solo ventas completadas sin comprobante
  const ventasSinComp = ventas.filter(
    v => v.estado === 'completada' && !v.comprobanteId
  );

  useEffect(() => {
    const ventaIdParam = searchParams.get('ventaId');
    const tipoParam    = searchParams.get('tipo');
    if (ventaIdParam) setVentaId(ventaIdParam);
    if (tipoParam === 'factura' || tipoParam === 'nota_venta') setTipo(tipoParam);
  }, [searchParams]);

  useEffect(() => {
    return subscribeToVentas((data) => { setVentas(data); setLoading(false); });
  }, []);

  const ventaSeleccionada = ventas.find(v => v.id === ventaId);

  const emitirComprobante = async () => {
    if (!ventaSeleccionada || !user) return;

    setProcesando(true);
    setResultado(null);

    try {
      // 1. Obtener configuración SRI
      const config = await getConfigSRI();
      if (!config) throw new Error('Configura el SRI antes de emitir comprobantes');
      if (!config.certificadoP12) throw new Error('No hay certificado digital configurado');

      // 2. Obtener secuencial e incrementar
      const secuencial = tipo === 'factura'
        ? await incrementarSecuencial('secuencialFactura')
        : await incrementarSecuencial('secuencialNotaVenta');

      // 3. Generar clave de acceso
      const claveAcceso = generarClaveAcceso({
        fecha:           new Date(),
        tipoComprobante: tipo === 'factura' ? '01' : '18',
        ruc:             config.ruc,
        ambiente:        config.ambiente,
        establecimiento: config.establecimiento,
        puntoEmision:    config.puntoEmision,
        secuencial,
      });

      // 4. Mapear tipo de identificación del cliente
      const cliente = ventaSeleccionada;
      // Necesitamos el tipo de identificación — lo inferimos del formato
      const tipoId  = cliente.clienteIdentificacion === '9999999999999'
        ? '07'  // consumidor final
        : cliente.clienteIdentificacion.length === 13 ? '04' : '05';

      // 5. Preparar ítems
      const items = ventaSeleccionada.items.map(i => ({
        codigoPrincipal:        i.sku,
        descripcion:            i.nombre,
        cantidad:               i.cantidad,
        precioUnitario:         i.precioUnitario,
        descuento:              i.precioUnitario * i.cantidad * (i.descuento / 100),
        precioTotalSinImpuesto: i.subtotal,
        tieneIVA:               tipo === 'factura',
        precioTotal:            i.subtotal,
      }));

      const subtotal = ventaSeleccionada.subtotal;
      const descuento = subtotal * (ventaSeleccionada.descuentoGlobal / 100);
      const base      = subtotal - descuento;
      const iva       = tipo === 'factura' ? base * 0.15 : 0;
      const total     = ventaSeleccionada.total;

      // 6. Generar XML
      let xml: string;
      if (tipo === 'factura') {
        xml = generarXMLFactura({
          claveAcceso,
          secuencial,
          fechaEmision:        new Date(),
          ambiente:            config.ambiente,
          ruc:                 config.ruc,
          razonSocial:         config.razonSocial,
          nombreComercial:     config.nombreComercial,
          establecimiento:     config.establecimiento,
          puntoEmision:        config.puntoEmision,
          direccionMatriz:     config.direccionMatriz,
          contribuyenteEspecial: config.contribuyenteEspecial,
          obligadoContabilidad:  config.obligadoContabilidad,
          tipoIdComprador:     tipoId,
          identificacion:      ventaSeleccionada.clienteIdentificacion,
          razonSocialComprador:ventaSeleccionada.clienteNombre,
          items,
          subtotal15:          tipo === 'factura' ? base : 0,
          subtotal0:           0,
          totalDescuento:      descuento,
          iva,
          total,
          formaPago: FORMA_PAGO_MAP[ventaSeleccionada.metodoPago] ?? '01',
        });
      } else {
        xml = generarXMLNotaVenta({
          claveAcceso,
          secuencial,
          fechaEmision:        new Date(),
          ambiente:            config.ambiente,
          ruc:                 config.ruc,
          razonSocial:         config.razonSocial,
          nombreComercial:     config.nombreComercial,
          establecimiento:     config.establecimiento,
          puntoEmision:        config.puntoEmision,
          direccionMatriz:     config.direccionMatriz,
          tipoIdComprador:     tipoId,
          identificacion:      ventaSeleccionada.clienteIdentificacion,
          razonSocialComprador:ventaSeleccionada.clienteNombre,
          items,
          totalSinImpuestos:   base,
          totalDescuento:      descuento,
          importeTotal:        total,
          formaPago: FORMA_PAGO_MAP[ventaSeleccionada.metodoPago] ?? '01',
        });
      }

      // 7. Crear registro en Firestore (estado: pendiente)
      const serie      = `${config.establecimiento.padStart(3,'0')}-${config.puntoEmision.padStart(3,'0')}`;
      const compId     = await createComprobante({
        tipo,
        ventaId:              ventaSeleccionada.id,
        claveAcceso,
        secuencial:           String(secuencial).padStart(9, '0'),
        serie,
        fechaEmision:         new Date(),
        clienteNombre:        ventaSeleccionada.clienteNombre,
        clienteIdentificacion:ventaSeleccionada.clienteIdentificacion,
        subtotal:             base,
        iva,
        total,
        estado:               'pendiente',
        emailEnviado:         false,
        mensajesSRI:          [],
        usuarioId:            user.uid,
        usuarioNombre:        user.nombre,
        createdAt:            new Date(),
      });

      // 8. Enviar a API route para firma y envío SRI
      const response = await fetch('/api/sri/procesar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          xml,
          p12Base64:   config.certificadoP12,
          password:    config.certificadoPassword,
          claveAcceso,
          ambiente:    config.ambiente,
        }),
      });

      const result = await response.json();

      // 9. Actualizar comprobante con resultado
      if (result.estado === 'AUTORIZADO') {
        await updateComprobante(compId, {
          estado:             'autorizado',
          numeroAutorizacion: result.numeroAutorizacion,
          fechaAutorizacion:  result.fechaAutorizacion,
          xmlFirmadoB64:      result.xmlFirmadoB64,
          xmlAutorizado:      result.xmlAutorizado,
          mensajesSRI:        result.mensajes ?? [],
        });
        toast.success('¡Comprobante autorizado por el SRI!');
      } else if (result.estado === 'DEVUELTA') {
        await updateComprobante(compId, {
          estado:        'rechazado',
          xmlFirmadoB64: result.xmlFirmadoB64,
          mensajesSRI:   result.mensajes ?? [],
        });
        toast.error('Comprobante devuelto por el SRI');
      } else {
        await updateComprobante(compId, {
          estado:      'rechazado',
          mensajesSRI: result.mensajes ?? [result.error ?? 'Error desconocido'],
        });
        toast.error(result.error ?? 'Error al procesar con el SRI');
      }

      setResultado({ ...result, compId, claveAcceso });

    } catch (err: any) {
      toast.error(err.message ?? 'Error al emitir comprobante');
      setResultado({ error: err.message });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Emitir Comprobante"
        description="Genera y autoriza facturas y notas de venta electrónicas con el SRI"
      />

      <div className="max-w-2xl space-y-5">

        {/* Seleccionar venta */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h3 className="font-semibold text-slate-700">Venta a facturar</h3>
          <div className="space-y-1.5">
            <Label>Selecciona la venta *</Label>
            <Select onValueChange={setVentaId}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? 'Cargando...' : 'Selecciona una venta'} />
              </SelectTrigger>
              <SelectContent>
                {ventasSinComp.map(v => {
                  const fecha = (v.fecha as any)?.toDate?.() ?? new Date(v.fecha);
                  return (
                    <SelectItem key={v.id} value={v.id}>
                      {format(fecha, 'dd/MM/yyyy')} — {v.clienteNombre} — ${v.total.toFixed(2)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {ventasSinComp.length === 0 && !loading && (
              <p className="text-xs text-slate-400">No hay ventas pendientes de comprobante.</p>
            )}
          </div>

          {/* Tipo de comprobante */}
          <div className="space-y-1.5">
            <Label>Tipo de comprobante *</Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'factura',    label: 'Factura Electrónica',  desc: 'Con desglose de IVA — para empresas y personas con RUC/cédula' },
                { value: 'nota_venta', label: 'Nota de Venta',        desc: 'Sin IVA separado — para consumidores finales (RISE)' },
              ] as const).map(({ value, label, desc }) => (
                <button key={value}
                  onClick={() => setTipo(value)}
                  className={`text-left p-3 rounded-lg border-2 transition-colors ${
                    tipo === value ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resumen de la venta seleccionada */}
        {ventaSeleccionada && (
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="font-semibold text-slate-700">Resumen</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-slate-400 text-xs">Cliente</p><p className="font-medium">{ventaSeleccionada.clienteNombre}</p></div>
              <div><p className="text-slate-400 text-xs">Identificación</p><p className="font-medium">{ventaSeleccionada.clienteIdentificacion}</p></div>
              <div><p className="text-slate-400 text-xs">Ítems</p><p className="font-medium">{ventaSeleccionada.items.length} producto(s)</p></div>
              <div><p className="text-slate-400 text-xs">Total</p><p className="font-bold text-lg">${ventaSeleccionada.total.toFixed(2)}</p></div>
            </div>
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div className={`rounded-xl border p-5 space-y-3 ${
            resultado.estado === 'AUTORIZADO' ? 'bg-green-50 border-green-200' :
            resultado.error  ? 'bg-red-50 border-red-200' :
            'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-2">
              {resultado.estado === 'AUTORIZADO'
                ? <CheckCircle className="h-5 w-5 text-green-600" />
                : <XCircle className="h-5 w-5 text-red-600" />}
              <h3 className={`font-semibold ${
                resultado.estado === 'AUTORIZADO' ? 'text-green-700' : 'text-red-700'
              }`}>
                {resultado.estado === 'AUTORIZADO' ? 'Comprobante Autorizado' :
                 resultado.error ? 'Error' : 'Comprobante Devuelto / Rechazado'}
              </h3>
            </div>
            {resultado.numeroAutorizacion && (
              <div>
                <p className="text-xs text-green-600 font-medium">Número de autorización:</p>
                <p className="font-mono text-sm text-green-800 break-all">{resultado.numeroAutorizacion}</p>
              </div>
            )}
            {resultado.mensajes?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">Mensajes del SRI:</p>
                {resultado.mensajes.map((m: string, i: number) => (
                  <p key={i} className="text-xs text-slate-600">• {m}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <Button
          className="w-full h-12 text-base"
          onClick={emitirComprobante}
          disabled={!ventaId || procesando}
        >
          {procesando ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Procesando con el SRI...
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Emitir {tipo === 'factura' ? 'Factura' : 'Nota de Venta'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function EmitirComprobantePage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Cargando...</div>}>
      <EmitirComprobanteInner />
    </Suspense>
  );
}