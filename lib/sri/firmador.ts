import * as forge from 'node-forge';

export interface ResultadoFirma {
  xmlFirmado: string;
  error?:     string;
}

export function firmarXML(
  xml:       string,
  p12Base64: string,
  password:  string
): ResultadoFirma {
  try {
    // ── Leer P12 ──
    const p12Der  = forge.util.decode64(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

    const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

    const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
    const cert       = certBags[forge.pki.oids.certBag]?.[0]?.cert;

    if (!privateKey || !cert) {
      return { xmlFirmado: '', error: 'Certificado inválido o contraseña incorrecta' };
    }

    // ── Datos del certificado ──
    const certDer    = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const certB64    = forge.util.encode64(certDer);
    const certDigest = forge.util.encode64(
      forge.md.sha1.create().update(certDer).digest().getBytes()
    );

    const issuerName = cert.issuer.attributes
      .map((a: any) => `${a.shortName}=${a.value}`)
      .reverse()
      .join(', ');
    const serialHex  = cert.serialNumber;
    const serialDec  = BigInt(`0x${serialHex}`).toString();

    const signingTime   = new Date().toISOString().slice(0, 19);
    const signedPropsId = `SignedPropertiesID${Date.now()}`;
    const certId        = `CertID${Date.now()}`;
    const sigId         = `Signature${Date.now()}`;

    // ── SignedProperties ──
    const signedPropsContent = [
      `<xades:SignedSignatureProperties>`,
        `<xades:SigningTime>${signingTime}</xades:SigningTime>`,
        `<xades:SigningCertificate>`,
          `<xades:Cert>`,
            `<xades:CertDigest>`,
              `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>`,
              `<ds:DigestValue>${certDigest}</ds:DigestValue>`,
            `</xades:CertDigest>`,
            `<xades:IssuerSerial>`,
              `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>`,
              `<ds:X509SerialNumber>${serialDec}</ds:X509SerialNumber>`,
            `</xades:IssuerSerial>`,
          `</xades:Cert>`,
        `</xades:SigningCertificate>`,
      `</xades:SignedSignatureProperties>`,
    ].join('');

    const signedPropsXML = [
      `<xades:SignedProperties`,
        ` xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"`,
        ` xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
        ` Id="${signedPropsId}">`,
      signedPropsContent,
      `</xades:SignedProperties>`,
    ].join('');

    // ── Digest del XML original ──
    const xmlDigest = forge.util.encode64(
      forge.md.sha1.create().update(forge.util.encodeUtf8(xml)).digest().getBytes()
    );

    // ── Digest de SignedProperties ──
    const spDigest = forge.util.encode64(
      forge.md.sha1.create().update(signedPropsXML).digest().getBytes()
    );

    // ── SignedInfo ──
    const signedInfo = [
      `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">`,
        `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>`,
        `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>`,
        `<ds:Reference URI="#comprobante">`,
          `<ds:Transforms>`,
            `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>`,
          `</ds:Transforms>`,
          `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>`,
          `<ds:DigestValue>${xmlDigest}</ds:DigestValue>`,
        `</ds:Reference>`,
        `<ds:Reference URI="#${certId}">`,
          `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>`,
          `<ds:DigestValue>${certDigest}</ds:DigestValue>`,
        `</ds:Reference>`,
        `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropsId}">`,
          `<ds:Transforms>`,
            `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>`,
          `</ds:Transforms>`,
          `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>`,
          `<ds:DigestValue>${spDigest}</ds:DigestValue>`,
        `</ds:Reference>`,
      `</ds:SignedInfo>`,
    ].join('');

    // ── Firmar SignedInfo ──
    const md = forge.md.sha1.create();
    md.update(signedInfo);
    const sigValue = forge.util.encode64((privateKey as any).sign(md));

    // ── Signature completo ──
    const signature = [
      `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${sigId}">`,
        signedInfo,
        `<ds:SignatureValue Id="SignatureValue${Date.now()}">${sigValue}</ds:SignatureValue>`,
        `<ds:KeyInfo Id="${certId}">`,
          `<ds:X509Data>`,
            `<ds:X509Certificate>${certB64}</ds:X509Certificate>`,
          `</ds:X509Data>`,
        `</ds:KeyInfo>`,
        `<ds:Object>`,
          `<xades:QualifyingProperties`,
            ` xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"`,
            ` xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
            ` Target="#${sigId}">`,
            `<xades:SignedProperties Id="${signedPropsId}">`,
              signedPropsContent,
            `</xades:SignedProperties>`,
          `</xades:QualifyingProperties>`,
        `</ds:Object>`,
      `</ds:Signature>`,
    ].join('');

    // ── Inyectar firma antes del cierre de la raíz ──
    const xmlFirmado = xml.replace(/(<\/(?:factura|notaVenta|comprobanteRetencion|guiaRemision)>)\s*$/, `${signature}$1`);

    return { xmlFirmado };
  } catch (err: any) {
    return { xmlFirmado: '', error: err.message ?? 'Error al firmar el XML' };
  }
}