/**
 * POST /api/sri/debug
 *
 * Endpoint de diagnóstico — NO envía al SRI.
 * Devuelve el XML firmado como texto para que puedas inspeccionarlo.
 *
 * Body: { xml, p12Base64, password }
 * Response: { xmlFirmado, xmlFirmadoB64, longitud, tieneSignature, tieneCertificado }
 *
 * Úsalo en Postman / curl para verificar que la firma se genera correctamente
 * ANTES de enviar al SRI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { firmarXML } from '@/lib/sri/firmador';

export async function POST(req: NextRequest) {
  try {
    const { xml, p12Base64, password } = await req.json();

    if (!xml || !p12Base64 || !password) {
      return NextResponse.json({ error: 'Faltan: xml, p12Base64, password' }, { status: 400 });
    }

    const { xmlFirmado, error } = firmarXML(xml, p12Base64, password);

    if (error || !xmlFirmado) {
      return NextResponse.json({ error: error ?? 'Error al firmar' }, { status: 400 });
    }

    const xmlFirmadoB64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');

    // Diagnósticos rápidos
    const tieneSignature    = xmlFirmado.includes('<ds:Signature');
    const tieneCertificado  = xmlFirmado.includes('<ds:X509Certificate>');
    const tieneSignedProps  = xmlFirmado.includes('SignedProperties');
    const cantSignedProps   = (xmlFirmado.match(/SignedProperties/g) ?? []).length;
    const tieneDeclaracion  = xmlFirmado.startsWith('<?xml');
    const tieneSignatureVal = xmlFirmado.includes('<ds:SignatureValue');
    const tieneQualProp     = xmlFirmado.includes('QualifyingProperties');

    return NextResponse.json({
      // XML completo como texto (para inspección)
      xmlFirmado,
      // XML en base64 (listo para enviar al SRI directamente)
      xmlFirmadoB64,
      // Diagnósticos
      diagnostico: {
        longitud:            xmlFirmado.length,
        tieneDeclaracionXML: tieneDeclaracion,
        tieneSignature,
        tieneSignatureValue: tieneSignatureVal,
        tieneCertificado,
        tieneSignedProperties:     tieneSignedProps,
        aparicionesSignedProperties: cantSignedProps, // debe ser 2 (Id= y referencia)
        tieneQualifyingProperties: tieneQualProp,
      },
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}
