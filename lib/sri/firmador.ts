import * as forge from 'node-forge';

export interface ResultadoFirma {
  xmlFirmado: string;
  error?:     string;
}

/**
 * Minimal C14N for Ecuador SRI XAdES-BES.
 * Removes XML declaration, normalizes line endings.
 * For our simple XML (no complex namespace scoping), this is sufficient.
 */
function c14n(xml: string): string {
  return xml
    .replace(/^<\?xml[^?]*\?>\s*/m, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/** SHA1 de cadena binaria (ej: DER bytes). Cada char = 1 byte. */
function sha1b64(binaryStr: string): string {
  const md = forge.md.sha1.create();
  md.update(binaryStr); // binary mode, NO 'utf8' — certDer son bytes binarios
  return forge.util.encode64(md.digest().getBytes());
}

/** SHA1 de texto (ej: XML canonicalizado). Convierte correctamente chars no-ASCII. */
function sha1b64text(text: string): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(text));
  return forge.util.encode64(md.digest().getBytes());
}

/**
 * Firma un XML con XAdES-BES según la especificación técnica del SRI Ecuador.
 *
 * Estructura de firma:
 *  - 2 References: documento (enveloped-signature + exc-c14n) y SignedProperties (c14n)
 *  - Sin reference extra a KeyInfo
 *  - SignedInfo firmado sobre string canonicalizado
 */
export function firmarXML(
  xml:       string,
  p12Base64: string,
  password:  string
): ResultadoFirma {
  try {
    // ── Leer P12 ──────────────────────────────────────────────────────────
    const p12Der  = forge.util.decode64(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

    const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

    const keyBagList  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
    const certBagList = certBags[forge.pki.oids.certBag] ?? [];

    const privateKey = keyBagList[0]?.key;

    // Buscar el cert del titular (no-CA). Si el P12 tiene CA intermediaria, evitarla.
    const cert = certBagList.find(bag => {
      const bc = bag.cert?.extensions?.find((ext: any) => ext.name === 'basicConstraints');
      return !bc?.cA;
    })?.cert ?? certBagList[0]?.cert;

    if (!privateKey || !cert) {
      return { xmlFirmado: '', error: 'Certificado inválido o contraseña incorrecta' };
    }

    // ── Datos del certificado ──────────────────────────────────────────────
    const certDer    = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const certB64    = forge.util.encode64(certDer);
    const certDigest = sha1b64(certDer);

    // Issuer name en formato X.500 (DN invertido, como lo requiere el SRI)
    const issuerName = cert.issuer.attributes
      .map((a: any) => `${a.shortName}=${a.value}`)
      .reverse()
      .join(', ');

    const serialHex = cert.serialNumber;
    const serialDec = BigInt(`0x${serialHex}`).toString();

    // Subject para X509SubjectName
    const subjectName = cert.subject.attributes
      .map((a: any) => `${a.shortName}=${a.value}`)
      .reverse()
      .join(', ');

    // ── IDs únicos ────────────────────────────────────────────────────────
    const ts       = Date.now();
    const sigId    = `Signature${ts}`;
    const spId     = `${sigId}-SignedProperties${ts}`;
    const certId   = `Certificate${ts}`;
    const refDocId = `Reference-ID-${ts}`;
    const refSpId  = `ReferencePropertiesObject${ts}`;

    // ── Signing time ──────────────────────────────────────────────────────
    const signingTime = new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');

    // ── SignedProperties ──────────────────────────────────────────────────
    // IMPORTANT: namespace order must be alphabetical by prefix (ds < xades) per C14N spec.
    // Self-closing tags must be expanded (<elem/> → <elem></elem>) per C14N spec.
    const signedPropsXML = [
      `<xades:SignedProperties xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
        ` xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"`,
        ` Id="${spId}">`,
        `<xades:SignedSignatureProperties>`,
          `<xades:SigningTime>${signingTime}</xades:SigningTime>`,
          `<xades:SigningCertificate>`,
            `<xades:Cert>`,
              `<xades:CertDigest>`,
                `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
                `<ds:DigestValue>${certDigest}</ds:DigestValue>`,
              `</xades:CertDigest>`,
              `<xades:IssuerSerial>`,
                `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>`,
                `<ds:X509SerialNumber>${serialDec}</ds:X509SerialNumber>`,
              `</xades:IssuerSerial>`,
            `</xades:Cert>`,
          `</xades:SigningCertificate>`,
        `</xades:SignedSignatureProperties>`,
      `</xades:SignedProperties>`,
    ].join('');

    // ── Digests ───────────────────────────────────────────────────────────

    // Digest del documento (texto canonical → UTF-8 bytes → SHA1)
    const xmlDigest = sha1b64text(c14n(xml));

    // Digest de SignedProperties (texto canonical → UTF-8 bytes → SHA1)
    const spDigest  = sha1b64text(c14n(signedPropsXML));

    // ── SignedInfo ────────────────────────────────────────────────────────
    // All self-closing tags expanded per C14N spec (empty elements become open+close pairs).
    const signedInfoXML = [
      `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">`,
        `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>`,
        `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod>`,
        `<ds:Reference Id="${refDocId}" URI="#comprobante">`,
          `<ds:Transforms>`,
            `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>`,
            `<ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></ds:Transform>`,
          `</ds:Transforms>`,
          `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
          `<ds:DigestValue>${xmlDigest}</ds:DigestValue>`,
        `</ds:Reference>`,
        `<ds:Reference Id="${refSpId}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#${spId}">`,
          `<ds:Transforms>`,
            `<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:Transform>`,
          `</ds:Transforms>`,
          `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
          `<ds:DigestValue>${spDigest}</ds:DigestValue>`,
        `</ds:Reference>`,
      `</ds:SignedInfo>`,
    ].join('');

    // ── Firmar SignedInfo canonicalizado ──────────────────────────────────
    const signedInfoC14N = c14n(signedInfoXML);
    const md = forge.md.sha1.create();
    md.update(forge.util.encodeUtf8(signedInfoC14N)); // texto → UTF-8 bytes → SHA1
    const sigValue = forge.util.encode64((privateKey as any).sign(md));

    // ── Bloque Signature completo ─────────────────────────────────────────
    const signature = [
      `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${sigId}">`,
        signedInfoXML,
        `<ds:SignatureValue Id="SignatureValue${ts}">${sigValue}</ds:SignatureValue>`,
        `<ds:KeyInfo Id="${certId}">`,
          `<ds:X509Data>`,
            `<ds:X509SubjectName>${subjectName}</ds:X509SubjectName>`,
            `<ds:X509Certificate>${certB64}</ds:X509Certificate>`,
          `</ds:X509Data>`,
        `</ds:KeyInfo>`,
        `<ds:Object Id="${sigId}-Object${ts}">`,
          `<xades:QualifyingProperties`,
            ` xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"`,
            ` xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
            ` Target="#${sigId}">`,
            `<xades:SignedProperties Id="${spId}">`,
              `<xades:SignedSignatureProperties>`,
                `<xades:SigningTime>${signingTime}</xades:SigningTime>`,
                `<xades:SigningCertificate>`,
                  `<xades:Cert>`,
                    `<xades:CertDigest>`,
                      `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
                      `<ds:DigestValue>${certDigest}</ds:DigestValue>`,
                    `</xades:CertDigest>`,
                    `<xades:IssuerSerial>`,
                      `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>`,
                      `<ds:X509SerialNumber>${serialDec}</ds:X509SerialNumber>`,
                    `</xades:IssuerSerial>`,
                  `</xades:Cert>`,
                `</xades:SigningCertificate>`,
              `</xades:SignedSignatureProperties>`,
            `</xades:SignedProperties>`,
          `</xades:QualifyingProperties>`,
        `</ds:Object>`,
      `</ds:Signature>`,
    ].join('');

    // ── Inyectar firma DENTRO del elemento raíz, antes del cierre ─────────
    const xmlFirmado = xml.replace(
      /(<\/(?:factura|notaVenta|comprobanteRetencion|liquidacionCompra|guiaRemision)>\s*)$/,
      `${signature}$1`
    );

    if (xmlFirmado === xml) {
      return { xmlFirmado: '', error: 'No se encontró el elemento raíz XML para inyectar la firma' };
    }

    return { xmlFirmado };
  } catch (err: any) {
    return { xmlFirmado: '', error: err.message ?? 'Error al firmar el XML' };
  }
}
