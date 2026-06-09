/**
 * Firmador XAdES-BES para el SRI Ecuador
 *
 * Implementado EXACTAMENTE según el Anexo 14 de la Ficha Técnica de
 * Comprobantes Electrónicos v2.32 del SRI Ecuador.
 *
 * Correcciones respecto a versiones anteriores:
 *  1. Prefijo de namespace: etsi: (no xades:) — el SRI usa etsi:
 *  2. Orden de References en SignedInfo:
 *       1) etsi:SignedProperties
 *       2) ds:KeyInfo / Certificate (digest del cert X509)
 *       3) Documento (#comprobante)
 *  3. Reference extra al KeyInfo/Certificate con su digest
 *  4. etsi:SignedDataObjectProperties > etsi:DataObjectFormat obligatorio
 *  5. Issuer en orden natural del certificado (no invertido)
 *  6. xmlns:etsi en QualifyingProperties (no xmlns:xades)
 */

import * as forge from 'node-forge';

export interface ResultadoFirma {
  xmlFirmado: string;
  error?:     string;
}

// ── helpers ───────────────────────────────────────────────────────────────

function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^<\?xml[^?]*\?>\s*/m, '');
}

function normalizeNl(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** SHA1 sobre bytes binarios (DER del cert) */
function sha1b64bin(bin: string): string {
  const md = forge.md.sha1.create();
  md.update(bin);
  return forge.util.encode64(md.digest().getBytes());
}

/** SHA1 sobre texto (lo convierte a UTF-8 bytes antes de hashear) */
function sha1b64utf8(text: string): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(text));
  return forge.util.encode64(md.digest().getBytes());
}

// ── firmador principal ────────────────────────────────────────────────────

export function firmarXML(
  xmlOriginal: string,
  p12Base64:   string,
  password:    string
): ResultadoFirma {
  try {
    // ── 1. Leer P12 ──────────────────────────────────────────────────────
    const p12Der  = forge.util.decode64(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

    const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

    const privateKey  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
    const certBagList = certBags[forge.pki.oids.certBag] ?? [];

    // Cert del titular — no-CA
    const cert = certBagList.find(bag => {
      const bc = bag.cert?.extensions?.find((e: any) => e.name === 'basicConstraints');
      return !bc?.cA;
    })?.cert ?? certBagList[0]?.cert;

    if (!privateKey || !cert) {
      return { xmlFirmado: '', error: 'Certificado inválido o contraseña incorrecta' };
    }

    // ── 2. Datos del cert ─────────────────────────────────────────────────
    const certDer    = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const certB64    = forge.util.encode64(certDer);
    const certDigest = sha1b64bin(certDer);   // para Reference al KeyInfo

    // Modulus y exponent RSA para ds:RSAKeyValue
    const pubKey    = cert.publicKey as any;
    const modulus   = forge.util.encode64(
      forge.asn1.toDer(forge.asn1.create(
        forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false,
        pubKey.n.toByteArray()
      )).getBytes()
    );

    // Issuer: orden NATURAL del certificado (como está almacenado), separado por coma sin espacios
    // Ejemplo oficial SRI: "CN=AC BANCO CENTRAL DEL ECUADOR,L=QUITO,OU=...,O=...,C=EC"
    const issuerName = cert.issuer.attributes
      .map((a: any) => `${a.shortName}=${a.value}`)
      .join(',');

    const serialDec = BigInt(`0x${cert.serialNumber}`).toString();

    const subjectName = cert.subject.attributes
      .map((a: any) => `${a.shortName}=${a.value}`)
      .join(',');

    // ── 3. IDs ────────────────────────────────────────────────────────────
    const ts    = Date.now();
    const sigId = `Signature${ts}`;
    const spId  = `${sigId}SignedProperties${ts}`;
    const certId= `Certificate${ts}`;
    const refDocId = `Reference-ID-${ts}`;
    const refSpId  = `SignedPropertiesID${ts}`;

    const signingTime = new Date().toISOString().replace(/\.\d{3}Z$/, '-05:00');

    // ── 4. etsi:SignedProperties ──────────────────────────────────────────
    // Este string se usa para:
    //   a) Calcular su digest (con sus xmlns declarados)
    //   b) Insertarlo dentro de QualifyingProperties (SIN sus propios xmlns,
    //      porque etsi: y ds: ya están declarados en el padre)
    //
    // Para el DIGEST necesitamos el string con xmlns declarados:
    const signedPropsConNs = [
      `<etsi:SignedProperties xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
        ` xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"`,
        ` Id="${spId}">`,
        `<etsi:SignedSignatureProperties>`,
          `<etsi:SigningTime>${signingTime}</etsi:SigningTime>`,
          `<etsi:SigningCertificate>`,
            `<etsi:Cert>`,
              `<etsi:CertDigest>`,
                `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
                `<ds:DigestValue>${certDigest}</ds:DigestValue>`,
              `</etsi:CertDigest>`,
              `<etsi:IssuerSerial>`,
                `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>`,
                `<ds:X509SerialNumber>${serialDec}</ds:X509SerialNumber>`,
              `</etsi:IssuerSerial>`,
            `</etsi:Cert>`,
          `</etsi:SigningCertificate>`,
        `</etsi:SignedSignatureProperties>`,
        // DataObjectFormat — obligatorio según Anexo 14
        `<etsi:SignedDataObjectProperties>`,
          `<etsi:DataObjectFormat ObjectReference="#${refDocId}">`,
            `<etsi:Description>contenido comprobante</etsi:Description>`,
            `<etsi:MimeType>text/xml</etsi:MimeType>`,
          `</etsi:DataObjectFormat>`,
        `</etsi:SignedDataObjectProperties>`,
      `</etsi:SignedProperties>`,
    ].join('');

    const spDigest = sha1b64utf8(normalizeNl(signedPropsConNs));

    // ── 5. Digest del documento ───────────────────────────────────────────
    // Transform: enveloped-signature (el doc aún no tiene firma, no hay nada que quitar)
    // El digest se calcula sobre el nodo raíz SIN declaración XML
    const xmlParaDigest = normalizeNl(stripXmlDeclaration(xmlOriginal));
    const xmlDigest     = sha1b64utf8(xmlParaDigest);

    // ── 6. Digest del KeyInfo (Reference al certificado) ──────────────────
    // El SRI requiere una Reference al elemento ds:KeyInfo con su digest.
    // Construimos el KeyInfo primero para poder calcular su digest.
    const keyInfoXML = [
      `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${certId}">`,
        `<ds:X509Data>`,
          `<ds:X509Certificate>${certB64}</ds:X509Certificate>`,
        `</ds:X509Data>`,
        `<ds:KeyValue>`,
          `<ds:RSAKeyValue>`,
            `<ds:Modulus>${modulus}</ds:Modulus>`,
            `<ds:Exponent>AQAB</ds:Exponent>`,
          `</ds:RSAKeyValue>`,
        `</ds:KeyValue>`,
      `</ds:KeyInfo>`,
    ].join('');

    const certRefDigest = sha1b64utf8(normalizeNl(keyInfoXML));

    // ── 7. SignedInfo ─────────────────────────────────────────────────────
    // Orden EXACTO del Anexo 14:
    //   Reference 1: etsi:SignedProperties
    //   Reference 2: ds:KeyInfo / Certificate
    //   Reference 3: Documento (#comprobante)
    const signedInfoXML = [
      `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
        ` Id="Signature-SignedInfo${ts}">`,
        `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>`,
        `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod>`,
        // Reference 1: SignedProperties
        `<ds:Reference Id="${refSpId}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#${spId}">`,
          `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
          `<ds:DigestValue>${spDigest}</ds:DigestValue>`,
        `</ds:Reference>`,
        // Reference 2: KeyInfo (certificado X509)
        `<ds:Reference URI="#${certId}">`,
          `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
          `<ds:DigestValue>${certRefDigest}</ds:DigestValue>`,
        `</ds:Reference>`,
        // Reference 3: Documento
        `<ds:Reference Id="${refDocId}" URI="#comprobante">`,
          `<ds:Transforms>`,
            `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>`,
          `</ds:Transforms>`,
          `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
          `<ds:DigestValue>${xmlDigest}</ds:DigestValue>`,
        `</ds:Reference>`,
      `</ds:SignedInfo>`,
    ].join('');

    // ── 8. Firmar SignedInfo ───────────────────────────────────────────────
    const signedInfoC14N = normalizeNl(signedInfoXML);
    const md = forge.md.sha1.create();
    md.update(forge.util.encodeUtf8(signedInfoC14N));
    const sigValue = forge.util.encode64((privateKey as any).sign(md));

    // ── 9. Bloque Signature completo (estructura del Anexo 14) ─────────────
    // IMPORTANTE: el ds:Signature lleva xmlns:etsi (no xmlns:xades)
    const signature = [
      `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
        ` xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"`,
        ` Id="${sigId}">`,
        signedInfoXML,
        `<ds:SignatureValue Id="SignatureValue${ts}">${sigValue}</ds:SignatureValue>`,
        // KeyInfo exactamente como se usó para calcular certRefDigest
        `<ds:KeyInfo Id="${certId}">`,
          `<ds:X509Data>`,
            `<ds:X509Certificate>${certB64}</ds:X509Certificate>`,
          `</ds:X509Data>`,
          `<ds:KeyValue>`,
            `<ds:RSAKeyValue>`,
              `<ds:Modulus>${modulus}</ds:Modulus>`,
              `<ds:Exponent>AQAB</ds:Exponent>`,
            `</ds:RSAKeyValue>`,
          `</ds:KeyValue>`,
        `</ds:KeyInfo>`,
        `<ds:Object Id="${sigId}-Object${ts}">`,
          `<etsi:QualifyingProperties Target="#${sigId}">`,
            // SignedProperties SIN sus propios xmlns (etsi: y ds: ya declarados arriba)
            `<etsi:SignedProperties Id="${spId}">`,
              `<etsi:SignedSignatureProperties>`,
                `<etsi:SigningTime>${signingTime}</etsi:SigningTime>`,
                `<etsi:SigningCertificate>`,
                  `<etsi:Cert>`,
                    `<etsi:CertDigest>`,
                      `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
                      `<ds:DigestValue>${certDigest}</ds:DigestValue>`,
                    `</etsi:CertDigest>`,
                    `<etsi:IssuerSerial>`,
                      `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>`,
                      `<ds:X509SerialNumber>${serialDec}</ds:X509SerialNumber>`,
                    `</etsi:IssuerSerial>`,
                  `</etsi:Cert>`,
                `</etsi:SigningCertificate>`,
              `</etsi:SignedSignatureProperties>`,
              `<etsi:SignedDataObjectProperties>`,
                `<etsi:DataObjectFormat ObjectReference="#${refDocId}">`,
                  `<etsi:Description>contenido comprobante</etsi:Description>`,
                  `<etsi:MimeType>text/xml</etsi:MimeType>`,
                `</etsi:DataObjectFormat>`,
              `</etsi:SignedDataObjectProperties>`,
            `</etsi:SignedProperties>`,
          `</etsi:QualifyingProperties>`,
        `</ds:Object>`,
      `</ds:Signature>`,
    ].join('');

    // ── 10. Inyectar firma antes del cierre del elemento raíz ──────────────
    const xmlFirmado = xmlOriginal.replace(
      /(<\/(?:factura|notaVenta|comprobanteRetencion|liquidacionCompra|guiaRemision)>\s*)$/,
      `${signature}$1`
    );

    if (xmlFirmado === xmlOriginal) {
      return {
        xmlFirmado: '',
        error: 'No se encontró el elemento raíz del XML. Verifica que el comprobante sea válido.',
      };
    }

    return { xmlFirmado };

  } catch (err: any) {
    return {
      xmlFirmado: '',
      error: `Error al firmar: ${err.message ?? String(err)}`,
    };
  }
}
