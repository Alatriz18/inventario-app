import { NextRequest, NextResponse } from 'next/server';
import * as forge from 'node-forge';
import { firmarXML } from '@/lib/sri/firmador';

/**
 * Diagnóstico de firma SRI — solo para pruebas, NO envía nada al SRI.
 * POST { xml, p12Base64, password }
 * Retorna: info del cert + XML firmado (primeros 3000 chars) + posibles problemas detectados
 */
export async function POST(req: NextRequest) {
  try {
    const { xml, p12Base64, password } = await req.json();
    if (!xml || !p12Base64 || !password) {
      return NextResponse.json({ error: 'Se requieren xml, p12Base64 y password' }, { status: 400 });
    }

    // ── Info del certificado ──
    const p12Der  = forge.util.decode64(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const cert     = certBags[forge.pki.oids.certBag]?.[0]?.cert;

    const subjectCN  = cert?.subject.getField('CN')?.value  ?? '';
    const subjectO   = cert?.subject.getField('O')?.value   ?? '';
    const issuerCN   = cert?.issuer.getField('CN')?.value   ?? '';
    const notAfter   = cert?.validity.notAfter  ? new Date(cert.validity.notAfter  as any).toISOString() : '';
    const serialHex  = cert?.serialNumber ?? '';

    // Extraer RUC del CN (últimos 13 dígitos numéricos del CN)
    const rucMatch = subjectCN.match(/(\d{13})$/);
    const rucEnCert = rucMatch ? rucMatch[1] : 'No encontrado en CN';

    // Extraer RUC del XML (campo <ruc>)
    const rucEnXML = xml.match(/<ruc>(\d+)<\/ruc>/)?.[1] ?? 'No encontrado en XML';

    // ── Firmar el XML ──
    const { xmlFirmado, error: errorFirma } = firmarXML(xml, p12Base64, password);

    // ── Diagnóstico ──
    const problemas: string[] = [];
    if (rucEnCert !== 'No encontrado en CN' && rucEnXML !== rucEnCert) {
      problemas.push(`RUC en XML (${rucEnXML}) no coincide con RUC en certificado (${rucEnCert})`);
    }
    if (!xml.includes('id="comprobante"') && !xml.includes('Id="comprobante"')) {
      problemas.push('El XML no tiene el atributo id="comprobante" en el elemento raíz');
    }
    if (errorFirma) {
      problemas.push(`Error al firmar: ${errorFirma}`);
    }
    const vence = new Date(notAfter);
    if (vence < new Date()) {
      problemas.push('El certificado está VENCIDO');
    }

    return NextResponse.json({
      certificado: {
        cn:       subjectCN,
        org:      subjectO,
        emisor:   issuerCN,
        vence:    notAfter,
        serial:   serialHex,
        rucEnCert,
      },
      xml: {
        rucEnXML,
        razonSocialEnXML: xml.match(/<razonSocial>([^<]+)<\/razonSocial>/)?.[1] ?? '',
        longitudXML:      xml.length,
        inicioXML:        xml.slice(0, 500),
        tieneIdComprobante: xml.includes('id="comprobante"') || xml.includes('Id="comprobante"'),
      },
      firma: {
        exito:          !errorFirma,
        error:          errorFirma ?? null,
        longitudFirmado: xmlFirmado?.length ?? 0,
        inicioFirmado:   xmlFirmado?.slice(0, 200) ?? '',
        tieneDsSignature: xmlFirmado?.includes('<ds:Signature') ?? false,
      },
      problemas,
      diagnostico: problemas.length === 0
        ? '✅ Sin problemas detectados — si el SRI sigue rechazando, el certificado puede no estar habilitado para facturación electrónica en sri.gob.ec'
        : `❌ Se encontraron ${problemas.length} problema(s) que pueden causar el error 39`,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error de diagnóstico' }, { status: 500 });
  }
}
