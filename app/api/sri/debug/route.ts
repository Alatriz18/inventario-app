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

    // Diagnósticos
    const xf = xmlFirmado;
    return NextResponse.json({
      xmlFirmado,
      xmlFirmadoB64: Buffer.from(xmlFirmado, 'utf8').toString('base64'),
      diagnostico: {
        longitud:                    xf.length,
        tieneDeclaracionXML:         xf.startsWith('<?xml'),
        tieneSignature:              xf.includes('<ds:Signature'),
        tieneSignatureValue:         xf.includes('<ds:SignatureValue'),
        tieneCertificado:            xf.includes('<ds:X509Certificate>'),
        tieneSignedProperties:       xf.includes('SignedProperties'),
        aparicionesSignedProperties: (xf.match(/SignedProperties/g) ?? []).length,
        tieneQualifyingProperties:   xf.includes('QualifyingProperties'),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}
