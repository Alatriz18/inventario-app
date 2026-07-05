'use client';

import { useEffect, useState, Suspense } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, CheckCircle, XCircle, Bug, Download, Printer } from 'lucide-react';
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
import { abrirTicketEnNuevaPestana, descargarTicket, DatosTicket } from '@/lib/pdf/ticket-venta';
import { getConfigSRI, incrementarSecuencial } from '@/lib/firebase/config-sri';
import { subscribeToConfigEmpresa } from '@/lib/firebase/config-empresa';
import { ComprobantesHabilitados } from '@/types';
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
  const [procesando,   setProcesando]   = useState(false);
  const [resultado,    setResultado]    = useState<any>(null);
  const [diagnostico,  setDiagnostico]  = useState<any>(null);
  const [diagLoading,  setDiagLoading]  = useState(false);
  const [xmlPreview,   setXmlPreview]   = useState<string | null>(null);
  const [habilitados,  setHabilitados]  = useState<ComprobantesHabilitados | null>(null);
  const [ticketData, setTicketData] = useState<DatosTicket | null>(null);

  // Solo ventas completadas sin comprobante
  const ventasSinComp = ventas.filter(
    v => v.estado === 'completada' && !v.comprobanteId
  );

  // Tipos de comprobante permitidos según el régimen tributario de la empresa.
  // Si aún no carga la config, se muestran ambos para no bloquear.
  const tiposPermitidos = {
    factura:    habilitados ? habilitados.factura   : true,
    nota_venta: habilitados ? habilitados.notaVenta : true,
  };

  useEffect(() => {
    const ventaIdParam = searchParams.get('ventaId');
    const tipoParam    = searchParams.get('tipo');
    if (ventaIdParam) setVentaId(ventaIdParam);
    if (tipoParam === 'factura' || tipoParam === 'nota_venta') setTipo(tipoParam);
  }, [searchParams]);

  useEffect(() => {
    return subscribeToVentas((data) => { setVentas(data); setLoading(false); });
  }, []);

  // Cargar comprobantes habilitados según el régimen y ajustar el tipo activo
  useEffect(() => {
    return subscribeToConfigEmpresa((cfg) => {
      const hab = cfg?.comprobantesHabilitados ?? null;
      setHabilitados(hab);
      if (hab) {
        // Si el tipo seleccionado no está habilitado, cambiar al primero disponible
        setTipo(prev => {
          if (prev === 'factura' && !hab.factura && hab.notaVenta)   return 'nota_venta';
          if (prev === 'nota_venta' && !hab.notaVenta && hab.factura) return 'factura';
          return prev;
        });
      }
    });
  }, []);

  const ventaSeleccionada = ventas.find(v => v.id === ventaId);

  const emitirComprobante = async () => {
    if (!ventaSeleccionada || !user) return;

    // Validar que el tipo de comprobante esté habilitado para el régimen
    if (!tiposPermitidos[tipo]) {
      toast.error(`Tu régimen tributario no permite emitir ${tipo === 'factura' ? 'facturas' : 'notas de venta'}.`);
      return;
    }

    setProcesando(true);
    setResultado(null);
    setTicketData(null);

    try {
      // 1. Obtener configuración SRI
      const config = await getConfigSRI();
      if (!config) throw new Error('Configura el SRI antes de emitir comprobantes');
      if (!config.certificadoP12) throw new Error('No hay certificado digital configurado');

      // 2. Obtener secuencial e incrementar
      const secuencial = tipo === 'factura'
        ? await incrementarSecuencial('secuencialFactura')
        : await incrementarSecuencial('secuencialNotaVenta');

      // 3. Usar la fecha de la venta (para facturas de fechas anteriores)
      const fechaComprobante = (ventaSeleccionada.fecha as any)?.toDate?.()
        ?? new Date(ventaSeleccionada.fecha);

      const claveAcceso = generarClaveAcceso({
        fecha:           fechaComprobante,
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
      // El total del XML debe incluir el IVA (el POS guarda precios sin IVA)
      const total     = tipo === 'factura' ? base + iva : ventaSeleccionada.total;

      // 6. Generar XML
      let xml: string;
      if (tipo === 'factura') {
        xml = generarXMLFactura({
          claveAcceso,
          secuencial,
          fechaEmision:        fechaComprobante,
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
          fechaEmision:          fechaComprobante,
          ambiente:              config.ambiente,
          ruc:                   config.ruc,
          razonSocial:           config.razonSocial,
          nombreComercial:       config.nombreComercial,
          establecimiento:       config.establecimiento,
          puntoEmision:          config.puntoEmision,
          direccionMatriz:       config.direccionMatriz,
          obligadoContabilidad:  config.obligadoContabilidad,
          contribuyenteEspecial: config.contribuyenteEspecial || undefined,
          tipoIdComprador:       tipoId,
          identificacion:        ventaSeleccionada.clienteIdentificacion,
          razonSocialComprador:  ventaSeleccionada.clienteNombre,
          items,
          totalSinImpuestos:     base,
          totalDescuento:        descuento,
          importeTotal:          total,
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
        fechaEmision:         fechaComprobante,
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

      // Si hay error HTTP (400/500), mostrar el mensaje exacto
      if (!response.ok) {
        const etapa  = result.etapa  ?? 'desconocida';
        const detalle = result.error ?? `Error HTTP ${response.status}`;
        const msgCompleto = `[${etapa.toUpperCase()}] ${detalle}`;
        toast.error(msgCompleto, { duration: 8000 });
        setResultado({
          error:    msgCompleto,
          etapa,
          xmlFirmado: result.xmlFirmado,   // puede estar disponible para diagnóstico
        });
        await updateComprobante(compId, {
          estado:      'rechazado',
          mensajesSRI: [msgCompleto],
        });
        return;
      }

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
      } else if (result.estado === 'DEVUELTA' || result.estado === 'ERROR') {
        // El SRI devolvió el comprobante con errores — mostrar mensajes exactos
        const mensajesSRI: string[] = (result.mensajes ?? []).map((m: any) =>
          typeof m === 'string' ? m : `[${m.identificador ?? '?'}] ${m.mensaje ?? ''} ${m.informacionAdicional ?? ''}`
        );
        await updateComprobante(compId, {
          estado:        'rechazado',
          xmlFirmadoB64: result.xmlFirmadoB64,
          mensajesSRI,
        });
        setResultado({ ...result, compId, claveAcceso, mensajesSRI });
        toast.error(`SRI devolvió el comprobante: ${mensajesSRI[0] ?? 'ver detalle'}`);
      } else {
        await updateComprobante(compId, {
          estado:      'rechazado',
          mensajesSRI: result.mensajes ?? [result.error ?? 'Error desconocido'],
        });
        toast.error(result.error ?? 'Error al procesar con el SRI');
      }

      setResultado({ ...result, compId, claveAcceso });

      // Para nota de venta: abrir recibo (ticket simple) en nueva pestaña
      if (tipo === 'nota_venta' && ventaSeleccionada) {
        const datos: DatosTicket = {
          nombreNegocio: config.nombreComercial || config.razonSocial,
          ruc:           config.ruc,
          direccion:     config.direccionMatriz,
          venta:         ventaSeleccionada,
          numeracion:    `NV-${serie}-${String(secuencial).padStart(9, '0')}`,
        };
        setTicketData(datos);
        try { abrirTicketEnNuevaPestana(datos); } catch { /* popup bloqueado */ }
      }

    } catch (err: any) {
      toast.error(err.message ?? 'Error al emitir comprobante');
      setResultado({ error: err.message });
    } finally {
      setProcesando(false);
    }
  };

  const descargarXML = async () => {
    if (!ventaSeleccionada) return;
    try {
      const config = await getConfigSRI();
      if (!config) { toast.error('Configura el SRI primero'); return; }
      const sec = tipo === 'factura' ? (config.secuencialFactura ?? 1) : (config.secuencialNotaVenta ?? 1);
      const { generarClaveAcceso: gca } = await import('@/lib/sri/clave-acceso');
      const claveAcceso = gca({
        fecha: new Date(), tipoComprobante: tipo === 'factura' ? '01' : '18',
        ruc: config.ruc, ambiente: config.ambiente,
        establecimiento: config.establecimiento, puntoEmision: config.puntoEmision, secuencial: sec,
      });
      const tipoId = ventaSeleccionada.clienteIdentificacion === '9999999999999' ? '07'
        : ventaSeleccionada.clienteIdentificacion.length === 13 ? '04' : '05';
      const items = ventaSeleccionada.items.map(i => ({
        codigoPrincipal: i.sku, descripcion: i.nombre, cantidad: i.cantidad,
        precioUnitario: i.precioUnitario, descuento: 0,
        precioTotalSinImpuesto: i.subtotal, tieneIVA: tipo === 'factura', precioTotal: i.subtotal,
      }));
      const base = ventaSeleccionada.subtotal;
      const iva  = tipo === 'factura' ? base * 0.15 : 0;
      const total = tipo === 'factura' ? base + iva : ventaSeleccionada.total;
      const { generarXMLFactura: gxf } = await import('@/lib/sri/generador-factura');
      const { generarXMLNotaVenta: gxn } = await import('@/lib/sri/generador-nota-venta');
      const xml = tipo === 'factura'
        ? gxf({ claveAcceso, secuencial: sec, fechaEmision: new Date(), ambiente: config.ambiente,
            ruc: config.ruc, razonSocial: config.razonSocial, nombreComercial: config.nombreComercial,
            establecimiento: config.establecimiento, puntoEmision: config.puntoEmision,
            direccionMatriz: config.direccionMatriz, contribuyenteEspecial: config.contribuyenteEspecial,
            obligadoContabilidad: config.obligadoContabilidad, tipoIdComprador: tipoId,
            identificacion: ventaSeleccionada.clienteIdentificacion,
            razonSocialComprador: ventaSeleccionada.clienteNombre,
            items, subtotal15: base, subtotal0: 0, totalDescuento: 0, iva, total, formaPago: '01' })
        : gxn({ claveAcceso, secuencial: sec, fechaEmision: new Date(), ambiente: config.ambiente,
            ruc: config.ruc, razonSocial: config.razonSocial, nombreComercial: config.nombreComercial,
            establecimiento: config.establecimiento, puntoEmision: config.puntoEmision,
            direccionMatriz: config.direccionMatriz,
            obligadoContabilidad: config.obligadoContabilidad,
            contribuyenteEspecial: config.contribuyenteEspecial ?? false,
            tipoIdComprador: tipoId,
            identificacion: ventaSeleccionada.clienteIdentificacion,
            razonSocialComprador: ventaSeleccionada.clienteNombre,
            items, totalSinImpuestos: base, totalDescuento: 0, importeTotal: ventaSeleccionada.total, formaPago: '01' });
      setXmlPreview(xml);
      // Descarga como archivo
      const blob = new Blob([xml], { type: 'application/xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${tipo}_${claveAcceso}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('XML descargado');
    } catch (e: any) {
      toast.error('Error al generar XML: ' + e.message);
    }
  };

  const diagnosticarFirma = async () => {
    if (!ventaSeleccionada || !user) return;
    setDiagLoading(true);
    setDiagnostico(null);
    try {
      const config = await getConfigSRI();
      if (!config?.certificadoP12) { toast.error('No hay certificado configurado'); return; }

      const secuencial = tipo === 'factura'
        ? (config.secuencialFactura ?? 1)
        : (config.secuencialNotaVenta ?? 1);

      const { generarClaveAcceso } = await import('@/lib/sri/clave-acceso');
      const { generarXMLFactura }  = await import('@/lib/sri/generador-factura');
      const claveAcceso = generarClaveAcceso({
        fecha: new Date(), tipoComprobante: tipo === 'factura' ? '01' : '18',
        ruc: config.ruc, ambiente: config.ambiente,
        establecimiento: config.establecimiento, puntoEmision: config.puntoEmision, secuencial,
      });
      const tipoId = ventaSeleccionada.clienteIdentificacion === '9999999999999' ? '07'
        : ventaSeleccionada.clienteIdentificacion.length === 13 ? '04' : '05';
      const items = ventaSeleccionada.items.map(i => ({
        codigoPrincipal: i.sku, descripcion: i.nombre, cantidad: i.cantidad,
        precioUnitario: i.precioUnitario, descuento: 0,
        precioTotalSinImpuesto: i.subtotal, tieneIVA: true, precioTotal: i.subtotal,
      }));
      const base = ventaSeleccionada.subtotal;
      const iva  = base * 0.15;
      const xml  = generarXMLFactura({
        claveAcceso, secuencial, fechaEmision: new Date(), ambiente: config.ambiente,
        ruc: config.ruc, razonSocial: config.razonSocial, nombreComercial: config.nombreComercial,
        establecimiento: config.establecimiento, puntoEmision: config.puntoEmision,
        direccionMatriz: config.direccionMatriz, contribuyenteEspecial: config.contribuyenteEspecial,
        obligadoContabilidad: config.obligadoContabilidad,
        tipoIdComprador: tipoId, identificacion: ventaSeleccionada.clienteIdentificacion,
        razonSocialComprador: ventaSeleccionada.clienteNombre,
        items, subtotal15: base, subtotal0: 0, totalDescuento: 0,
        iva, total: base + iva, formaPago: '01',
      });

      const res  = await fetch('/api/sri/debug-xml', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml, p12Base64: config.certificadoP12, password: config.certificadoPassword }),
      });
      setDiagnostico(await res.json());
    } catch (e: any) {
      toast.error('Error diagnóstico: ' + e.message);
    } finally {
      setDiagLoading(false);
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

          {/* Tipo de comprobante (solo los habilitados según el régimen) */}
          <div className="space-y-1.5">
            <Label>Tipo de comprobante *</Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'factura',    label: 'Factura Electrónica',  desc: 'Con desglose de IVA — para empresas y personas con RUC/cédula' },
                { value: 'nota_venta', label: 'Nota de Venta',        desc: 'Sin IVA separado — RIMPE Negocio Popular / Emprendedor' },
              ] as const)
                .filter(({ value }) => tiposPermitidos[value])
                .map(({ value, label, desc }) => (
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
            {habilitados && !tiposPermitidos.factura && !tiposPermitidos.nota_venta && (
              <p className="text-xs text-amber-600">
                El régimen tributario configurado no permite emitir facturas ni notas de venta.
                Revísalo en Configuración → Empresa.
              </p>
            )}
            {habilitados && (tiposPermitidos.factura !== tiposPermitidos.nota_venta) && (
              <p className="text-xs text-slate-400">
                Tu régimen tributario solo habilita {tiposPermitidos.factura ? 'facturas' : 'notas de venta'}.
              </p>
            )}
          </div>
        </div>

        {/* Resumen de la venta seleccionada */}
        {ventaSeleccionada && (
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="font-semibold text-slate-700">Resumen</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                 resultado.error ? `Error en etapa: ${resultado.etapa ?? 'desconocida'}` :
                 'Comprobante Devuelto / Rechazado'}
              </h3>
            </div>

            {/* Error del servidor (400/500) */}
            {resultado.error && (
              <div className="bg-red-100 rounded-lg p-3">
                <p className="text-xs font-bold text-red-700 mb-1">Detalle del error:</p>
                <p className="text-xs text-red-800 break-words font-mono">{resultado.error}</p>
              </div>
            )}

            {/* Número de autorización */}
            {resultado.numeroAutorizacion && (
              <div>
                <p className="text-xs text-green-600 font-medium">Número de autorización:</p>
                <p className="font-mono text-sm text-green-800 break-all">{resultado.numeroAutorizacion}</p>
              </div>
            )}

            {/* Mensajes del SRI (DEVUELTA/RECHAZADO) */}
            {(resultado.mensajesSRI ?? resultado.mensajes)?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">Mensajes del SRI:</p>
                {(resultado.mensajesSRI ?? resultado.mensajes).map((m: any, i: number) => (
                  <p key={i} className="text-xs text-slate-700 font-mono bg-white rounded px-2 py-1 mb-1 break-words">
                    • {typeof m === 'string' ? m : `[${m.identificador}] ${m.mensaje} ${m.informacionAdicional ?? ''}`}
                  </p>
                ))}
              </div>
            )}

            {/* Botón para ver XML firmado si hay error de firma */}
            {resultado.xmlFirmado && (
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-medium">
                  Ver XML firmado (diagnóstico)
                </summary>
                <textarea
                  readOnly
                  className="w-full mt-2 h-40 text-xs font-mono bg-slate-900 text-green-400 p-2 rounded"
                  value={resultado.xmlFirmado}
                />
              </details>
            )}
          </div>
        )}

        {/* Botones recibo — solo para nota de venta */}
        {ticketData && (
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => abrirTicketEnNuevaPestana(ticketData)}
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Recibo
            </Button>
            <Button
              variant="outline"
              onClick={() => descargarTicket(ticketData)}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Botones diagnóstico + XML */}
        {ventaId && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={diagnosticarFirma} disabled={diagLoading}>
              {diagLoading
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analizando...</>
                : <><Bug className="mr-2 h-4 w-4" />Diagnosticar Firma</>}
            </Button>
            <Button variant="outline" className="flex-1" onClick={descargarXML}>
              <Download className="mr-2 h-4 w-4" />
              Descargar XML
            </Button>
          </div>
        )}

        {/* Panel de diagnóstico */}
        {diagnostico && (
          <div className="rounded-xl border p-4 space-y-3 bg-slate-50 text-xs font-mono">
            <p className="font-bold text-sm font-sans">
              {diagnostico.problemas?.length === 0 ? '✅ Sin problemas detectados' : `❌ ${diagnostico.problemas?.length} problema(s)`}
            </p>
            {diagnostico.problemas?.map((p: string, i: number) => (
              <p key={i} className="text-red-600 break-words">• {p}</p>
            ))}
            <div className="border-t pt-2 space-y-1 text-slate-600">
              <p><strong>Cert CN:</strong> {diagnostico.certificado?.cn}</p>
              <p><strong>Cert OU:</strong> {diagnostico.certificado?.ou || '(vacío)'}</p>
              <p><strong>Cert serialNumber:</strong> {diagnostico.certificado?.serialNumber || '(vacío)'}</p>
              <p><strong>RUC en cert:</strong> {diagnostico.certificado?.rucEnCert}</p>
              <p><strong>RUC en XML:</strong> {diagnostico.xml?.rucEnXML}</p>
              <p><strong>Razón social:</strong> {diagnostico.xml?.razonSocialEnXML}</p>
              <p><strong>Cert vence:</strong> {diagnostico.certificado?.vence?.slice(0,10)}</p>
              <p><strong>id="comprobante":</strong> {diagnostico.xml?.tieneIdComprobante ? '✅ Sí' : '❌ No'}</p>
              <p><strong>Firma generada:</strong> {diagnostico.firma?.exito ? '✅ Sí' : `❌ ${diagnostico.firma?.error}`}</p>
              <p><strong>ds:Signature presente:</strong> {diagnostico.firma?.tieneDsSignature ? '✅' : '❌'}</p>
            </div>
            {diagnostico.certificado?.todosCamposSujeto?.length > 0 && (
              <div className="border-t pt-2">
                <p className="font-sans font-semibold text-slate-700 mb-1">Todos los campos del certificado:</p>
                {diagnostico.certificado.todosCamposSujeto.map((f: string, i: number) => (
                  <p key={i} className="text-slate-500 break-words">{f}</p>
                ))}
              </div>
            )}
            <p className="text-slate-500 italic font-sans">{diagnostico.diagnostico}</p>
          </div>
        )}

        {/* Vista previa XML */}
        {xmlPreview && (
          <div className="rounded-xl border p-4 bg-slate-50">
            <div className="flex justify-between items-center mb-2">
              <p className="font-semibold text-sm">XML generado ({xmlPreview.length} chars)</p>
              <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setXmlPreview(null)}>✕ Cerrar</button>
            </div>
            <pre className="text-xs text-slate-600 overflow-auto max-h-64 bg-white border rounded p-3 whitespace-pre-wrap break-words">
              {xmlPreview}
            </pre>
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