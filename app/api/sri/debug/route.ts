import { NextRequest, NextResponse } from 'next/server';
import { firmarXML } from '@/lib/sri/firmador';
import { enviarComprobante, autorizarComprobante } from '@/lib/sri/webservice';

/**
 * Diagnóstico de firma SRI.
 *
 * POST { xml, p12Base64, password, enviar?, extraCertsB64? }
 *  - Siempre firma el XML y devuelve diagnóstico estructural.
 *  - Si `enviar === true` además lo manda al SRI (recepción + autorización)
 *    y devuelve el MOTIVO EXACTO del rechazo (identificador + mensaje +
 *    informacionAdicional). El ambiente y la claveAcceso se toman del propio XML.
 */
export async function POST(req: NextRequest) {
  try {
    const { xml, p12Base64, password, enviar, extraCertsB64 } = await req.json();
    if (!xml || !p12Base64 || !password) {
      return NextResponse.json({ error: 'Faltan: xml, p12Base64, password' }, { status: 400 });
    }

    const { xmlFirmado, error } = firmarXML(xml, p12Base64, password, extraCertsB64 ?? []);
    if (error || !xmlFirmado) {
      return NextResponse.json({ error: error ?? 'Error al firmar' }, { status: 400 });
    }

    const xf = xmlFirmado;
    const diagnostico = {
      longitud:                    xf.length,
      tieneDeclaracionXML:         xf.startsWith('<?xml'),
      tieneSignature:              xf.includes('<ds:Signature'),
      tieneSignatureValue:         xf.includes('<ds:SignatureValue'),
      tieneCertificado:            xf.includes('<ds:X509Certificate>'),
      tieneSignedProperties:       xf.includes('SignedProperties'),
      aparicionesSignedProperties: (xf.match(/SignedProperties/g) ?? []).length,
      tieneQualifyingProperties:   xf.includes('QualifyingProperties'),
    };

    // Datos tomados del XML (no del front) para enviar de forma coherente
    const ambienteXML   = xml.match(/<ambiente>(\d)<\/ambiente>/)?.[1] ?? '1';
    const claveAccesoXML = xml.match(/<claveAcceso>(\d{49})<\/claveAcceso>/)?.[1] ?? '';
    const numCerts = (xf.match(/<ds:X509Certificate>/g) ?? []).length;

    // Si no se pide enviar, solo diagnóstico local
    if (!enviar) {
      return NextResponse.json({
        xmlFirmado,
        xmlFirmadoB64: Buffer.from(xmlFirmado, 'utf8').toString('base64'),
        diagnostico,
        contexto: { ambienteXML, claveAccesoXML, certificadosEnX509Data: numCerts },
      });
    }

    // ── Enviar al SRI y capturar el motivo EXACTO ──────────────────────────
    if (!claveAccesoXML) {
      return NextResponse.json({
        xmlFirmado, diagnostico,
        error: 'No se pudo leer <claveAcceso> (49 dígitos) del XML para consultar autorización.',
      }, { status: 400 });
    }

    const amb = (ambienteXML === '2' ? '2' : '1') as '1' | '2';
    const xmlFirmadoB64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');

    const recepcion = await enviarComprobante(xmlFirmadoB64, amb);

    let autorizacion: any = null;
    if (recepcion.estado === 'RECIBIDA') {
      autorizacion = await autorizarComprobante(claveAccesoXML, amb);
      if (autorizacion.estado !== 'AUTORIZADO') {
        await new Promise(r => setTimeout(r, 4000));
        autorizacion = await autorizarComprobante(claveAccesoXML, amb);
      }
    }

    return NextResponse.json({
      xmlFirmado,
      xmlFirmadoB64,
      diagnostico,
      contexto: {
        ambienteXML,
        ambienteEnviado: amb === '2' ? 'PRODUCCIÓN (cel.sri.gob.ec)' : 'PRUEBAS (celcer.sri.gob.ec)',
        claveAccesoXML,
        certificadosEnX509Data: numCerts,
      },
      sri: {
        recepcion,
        autorizacion: autorizacion ?? { estado: 'OMITIDA', mensajes: ['Recepción no fue RECIBIDA; no se consultó autorización.'] },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}
