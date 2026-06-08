import { NextRequest, NextResponse } from 'next/server';
import * as forge from 'node-forge';

export async function POST(req: NextRequest) {
  try {
    const { p12Base64, password } = await req.json();

    if (!p12Base64 || !password) {
      return NextResponse.json(
        { valido: false, error: 'Se requieren p12Base64 y password' },
        { status: 400 }
      );
    }

    // Cargar el .p12 — si la contraseña es incorrecta esto lanza excepción
    const p12Der  = forge.util.decode64(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

    const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert;
    const key  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;

    if (!cert || !key) {
      return NextResponse.json(
        { valido: false, error: 'El archivo no contiene un certificado y clave privada válidos' },
        { status: 400 }
      );
    }

    // Verificar que la clave privada puede firmar (el .p12 es funcional)
    const privKey = key as forge.pki.rsa.PrivateKey;
    const md = forge.md.sha256.create();
    md.update('test-sri-ecuador', 'utf8');
    privKey.sign(md); // lanza si la clave está corrupta

    // Extraer metadatos del certificado
    const subjectCN = cert.subject.getField('CN')?.value  ?? '';
    const subjectO  = cert.subject.getField('O')?.value   ?? '';
    const issuerCN  = cert.issuer.getField('CN')?.value   ?? '';
    const notBefore = (cert.validity.notBefore as unknown as Date).toISOString();
    const notAfter  = (cert.validity.notAfter  as unknown as Date).toISOString();

    const ahora = new Date();
    const vence = new Date(cert.validity.notAfter as unknown as Date);
    const diasRestantes = Math.floor((vence.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24));

    return NextResponse.json({
      valido:        true,
      titular:       subjectCN || subjectO,
      organizacion:  subjectO,
      emisor:        issuerCN,
      validoDesde:   notBefore,
      validoHasta:   notAfter,
      diasRestantes,
      vencido:       diasRestantes < 0,
      expiraPronto:  diasRestantes >= 0 && diasRestantes <= 30,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al leer el certificado';
    const error = msg.toLowerCase().includes('invalid password') || msg.toLowerCase().includes('mac verify')
      ? 'Contraseña incorrecta para este certificado'
      : msg;
    return NextResponse.json({ valido: false, error }, { status: 400 });
  }
}
