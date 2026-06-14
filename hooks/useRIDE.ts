'use client';

/**
 * useRIDE
 * Hook que toma un Comprobante de Firestore y la ConfigSRI
 * y genera/descarga el RIDE PDF con un solo llamado.
 *
 * Uso:
 *   const { descargar, abrir, generando } = useRIDE();
 *   <Button onClick={() => descargar(comprobante)}>Descargar PDF</Button>
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { getConfigSRI } from '@/lib/firebase/config-sri';
import { getConfigEmail } from '@/lib/firebase/config-email';
import { Comprobante }  from '@/lib/firebase/comprobantes';
import {
  DatosRIDE, descargarRIDE, abrirRIDEenNuevaPestana, generarRIDE,
} from '@/lib/sri/ride-pdf';

/** Convierte un Uint8Array a base64 sin desbordar la pila (por bloques). */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Obtiene el XML del comprobante: autorizado si existe, si no el firmado. */
function getXmlComprobante(comp: Comprobante): string {
  if (comp.xmlAutorizado) return comp.xmlAutorizado;
  if (comp.xmlFirmadoB64) {
    try { return decodeURIComponent(escape(atob(comp.xmlFirmadoB64))); }
    catch { return atob(comp.xmlFirmadoB64); }
  }
  return '';
}

export function useRIDE() {
  const [generando, setGenerando] = useState(false);

  const buildDatos = useCallback(async (comp: Comprobante): Promise<DatosRIDE | null> => {
    const config = await getConfigSRI();
    if (!config) {
      toast.error('Configura los datos del SRI antes de generar el RIDE');
      return null;
    }

    // Parsear el XML autorizado o firmado para extraer los ítems
    // Si no hay XML disponible usamos los datos del comprobante directamente
    const items = extraerItemsDeComprobante(comp);

    const tipoDoc =
      comp.tipo === 'factura'    ? 'factura'
      : comp.tipo === 'nota_venta' ? 'nota_venta'
      : 'factura';

    const subtotal15 = tipoDoc === 'factura' ? comp.subtotal : 0;
    const subtotal0  = tipoDoc === 'nota_venta' ? comp.subtotal : 0;

    const fechaEmision = (comp.fechaEmision as any)?.toDate?.()
      ?? new Date(comp.fechaEmision as any);

    return {
      tipoDocumento:           tipoDoc,
      razonSocial:             config.razonSocial,
      nombreComercial:         config.nombreComercial,
      ruc:                     config.ruc,
      direccionMatriz:         config.direccionMatriz,
      establecimiento:         config.establecimiento,
      puntoEmision:            config.puntoEmision,
      contribuyenteEspecial:   config.contribuyenteEspecial,
      obligadoContabilidad:    config.obligadoContabilidad,
      ambiente:                config.ambiente,
      secuencial:              parseInt(comp.secuencial),
      claveAcceso:             comp.claveAcceso,
      numeroAutorizacion:      comp.numeroAutorizacion,
      fechaAutorizacion:       comp.fechaAutorizacion,
      fechaEmision,
      tipoIdComprador:         inferirTipoId(comp.clienteIdentificacion),
      identificacionComprador: comp.clienteIdentificacion,
      razonSocialComprador:    comp.clienteNombre,
      items,
      subtotal0,
      subtotal15,
      totalDescuento:          0,
      iva:                     comp.iva,
      total:                   comp.total,
      formaPago:               (comp as any).formaPago ?? 'efectivo',
    } satisfies DatosRIDE;
  }, []);

  const descargar = useCallback(async (comp: Comprobante) => {
    setGenerando(true);
    try {
      const datos = await buildDatos(comp);
      if (!datos) return;
      descargarRIDE(datos);
      toast.success('RIDE descargado correctamente');
    } catch (e: any) {
      toast.error(`Error al generar RIDE: ${e.message ?? 'desconocido'}`);
    } finally {
      setGenerando(false);
    }
  }, [buildDatos]);

  const abrir = useCallback(async (comp: Comprobante) => {
    setGenerando(true);
    try {
      const datos = await buildDatos(comp);
      if (!datos) return;
      abrirRIDEenNuevaPestana(datos);
    } catch (e: any) {
      toast.error(`Error al generar RIDE: ${e.message ?? 'desconocido'}`);
    } finally {
      setGenerando(false);
    }
  }, [buildDatos]);

  /** Descarga el XML autorizado (o firmado) del comprobante como archivo .xml */
  const descargarXML = useCallback((comp: Comprobante) => {
    const xml = getXmlComprobante(comp);
    if (!xml) { toast.error('Este comprobante aún no tiene XML disponible'); return; }
    const blob = new Blob([xml], { type: 'application/xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${comp.claveAcceso}.xml`; a.click();
    URL.revokeObjectURL(url);
    toast.success('XML descargado');
  }, []);

  /** Envía el comprobante (XML + RIDE) por correo al destinatario indicado. */
  const enviarPorCorreo = useCallback(async (comp: Comprobante, email: string) => {
    setGenerando(true);
    try {
      const smtp = await getConfigEmail();
      if (!smtp?.email || !smtp?.password) {
        toast.error('Configura tu correo en Configuración → Correo antes de enviar');
        return;
      }
      const datos = await buildDatos(comp);
      if (!datos) return;
      const pdfBase64 = uint8ToBase64(generarRIDE(datos));
      const xml       = getXmlComprobante(comp);
      const serie     = `${comp.serie}-${comp.secuencial}`;
      const tipoLabel = comp.tipo === 'factura' ? 'Factura' : 'Comprobante';

      const resp = await fetch('/api/email/comprobante', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp,
          to:          email,
          subject:     `${tipoLabel} electrónica ${serie}`,
          html: `<p>Estimado/a ${comp.clienteNombre},</p>
                 <p>Adjuntamos su ${tipoLabel.toLowerCase()} electrónica <b>${serie}</b>${
                   comp.numeroAutorizacion ? ` autorizada por el SRI (Aut. ${comp.numeroAutorizacion})` : ''
                 }.</p>
                 <p>Se incluyen el archivo XML y la representación impresa (RIDE) en PDF.</p>`,
          xmlContent:  xml,
          xmlFilename: `${comp.claveAcceso}.xml`,
          pdfBase64,
          pdfFilename: `RIDE-${serie}.pdf`,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? 'No se pudo enviar el correo');
      toast.success(`Comprobante enviado a ${email}`);
    } catch (e: any) {
      toast.error(`Error al enviar correo: ${e.message ?? 'desconocido'}`);
    } finally {
      setGenerando(false);
    }
  }, [buildDatos]);

  return { descargar, abrir, descargarXML, enviarPorCorreo, generando };
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extrae los ítems del comprobante.
 * Primero intenta parsear el XML autorizado; si no hay XML usa los
 * datos que el comprobante guarda en Firestore (campo `items` si existe).
 */
function extraerItemsDeComprobante(comp: Comprobante) {
  // Si el comprobante guardó los ítems directamente (campo items en Firestore)
  if ((comp as any).items && Array.isArray((comp as any).items)) {
    return (comp as any).items.map((it: any) => ({
      codigo:         it.sku ?? it.codigoPrincipal ?? '-',
      descripcion:    it.nombre ?? it.descripcion ?? '-',
      cantidad:       Number(it.cantidad ?? 1),
      precioUnitario: Number(it.precioUnitario ?? 0),
      descuento:      Number(it.descuento ?? 0),
      subtotal:       Number(it.subtotal ?? it.precioTotalSinImpuesto ?? 0),
      tieneIVA:       it.tieneIVA !== false,
    }));
  }

  // Fallback: un ítem genérico con los totales del comprobante
  return [{
    codigo:         'VENTA',
    descripcion:    `${comp.tipo === 'factura' ? 'Factura' : 'Nota de venta'} ${comp.serie}`,
    cantidad:       1,
    precioUnitario: comp.subtotal,
    descuento:      0,
    subtotal:       comp.subtotal,
    tieneIVA:       comp.tipo === 'factura',
  }];
}

function inferirTipoId(identificacion: string): string {
  if (!identificacion) return '07';
  if (identificacion === '9999999999999') return '07'; // consumidor final
  if (identificacion.length === 13)       return '04'; // RUC
  if (identificacion.length === 10)       return '05'; // cédula
  return '06'; // pasaporte
}
