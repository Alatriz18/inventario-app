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

    // Extraer todos los campos del Subject
    const allSubjectFields = cert?.subject.attributes.map((a: any) =>
      `${a.shortName || a.name}=${a.value}`
    ) ?? [];

    // Buscar RUC (13 dígitos) en TODOS los campos del certificado
    const allSubjectStr = allSubjectFields.join(' ');
    const rucMatchAny   = allSubjectStr.match(/\b(\d{13})\b/);
    // También intentar en OU específicamente (BCE pone "ruc:XXXXXXXXX001" a veces)
    const subjectOU  = cert?.subject.getField('OU')?.value ?? '';
    const subjectSerial = cert?.subject.getField('serialNumber')?.value ?? '';
    const rucMatchOU    = subjectOU.match(/(\d{13})/);
    const rucMatchSer   = subjectSerial.match(/(\d{13})/);

    const rucEnCert = rucMatchSer?.[1] ?? rucMatchOU?.[1] ?? rucMatchAny?.[1] ?? 'No encontrado en ningún campo';

    // Extraer RUC del XML (campo <ruc>)
    const rucEnXML = xml.match(/<ruc>(\d+)<\/ruc>/)?.[1] ?? 'No encontrado en XML';

    // ── Cadena de certificados en el P12 ──
    const certBagsFull = p12.getBags({ bagType: forge.pki.oids.certBag });
    const allCertBags  = certBagsFull[forge.pki.oids.certBag] ?? [];
    const certChainInfo = allCertBags.map((bag: any, i: number) => {
      const c = bag?.cert;
      if (!c) return { index: i, error: 'sin cert' };
      const bc = c.extensions?.find((e: any) => e.name === 'basicConstraints');
      return {
        index:   i,
        cn:      c.subject.getField('CN')?.value ?? '(sin CN)',
        isCA:    bc?.cA === true,
        emisor:  c.issuer.getField('CN')?.value ?? '(sin CN emisor)',
        serial:  c.serialNumber,
      };
    });

    // ── Firmar el XML ──
    const { xmlFirmado, error: errorFirma } = firmarXML(xml, p12Base64, password);

    // ── Diagnóstico ──
    const problemas: string[] = [];
    const rucEnCertFound = !rucEnCert.startsWith('No encontrado');
    if (rucEnCertFound && rucEnXML !== rucEnCert) {
      problemas.push(`RUC en XML (${rucEnXML}) no coincide con RUC en certificado (${rucEnCert})`);
    }
    if (!rucEnCertFound) {
      problemas.push(
        `RUC no encontrado en ningún campo del certificado. ` +
        `Campos sujeto: ${allSubjectFields.join(' | ')}. ` +
        `El certificado puede ser personal (cédula), no de empresa.`
      );
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
      cadenaCertificados: {
        totalEnP12:    certChainInfo.length,
        certificados:  certChainInfo,
        tieneCadena:   certChainInfo.some((c: any) => c.isCA),
        advertencia:   certChainInfo.length === 1
          ? 'El P12 solo tiene 1 certificado (sin CA intermedio). Si el SRI no reconoce la CA emisora, la firma será rechazada.'
          : null,
      },
      certificado: {
        cn:       subjectCN,
        org:      subjectO,
        ou:       subjectOU,
        serialNumber: subjectSerial,
        emisor:   issuerCN,
        vence:    notAfter,
        serial:   serialHex,
        rucEnCert,
        todosCamposSujeto: allSubjectFields,
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
