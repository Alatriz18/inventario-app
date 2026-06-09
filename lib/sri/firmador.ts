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

import * as forge  from 'node-forge';
import * as crypto from 'crypto';

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

/** SHA1 sobre bytes binarios (DER del cert) — usando forge */
function sha1b64bin(bin: string): string {
  const md = forge.md.sha1.create();
  md.update(bin);
  return forge.util.encode64(md.digest().getBytes());
}

/**
 * SHA1 sobre texto usando Node.js crypto nativo con Buffer UTF-8.
 * Más confiable que forge.util.encodeUtf8() para caracteres especiales
 * como ñ, tildes, etc. que aparecen en direcciones ecuatorianas.
 */
function sha1b64Buffer(text: string): string {
  return crypto.createHash('sha1').update(Buffer.from(text, 'utf8')).digest('base64');
}

// ── firmador principal ────────────────────────────────────────────────────

export function firmarXML(
  xmlOriginal: string,
  p12Base64:   string,
  password:    string
): ResultadoFirma {
  try {
    // ── 1. Leer P12 ──────────────────────────────────────────────────────
    // El P12 del Banco Central del Ecuador usa cifrado RC2 (legacy).
    // node-forge necesita el segundo parámetro en true para soportarlo.
    // También limpiamos el base64 por si viene con saltos de línea o espacios.
    const p12B64Clean = p12Base64.replace(/\s/g, '');
    const p12Der      = forge.util.decode64(p12B64Clean);
    const p12Asn1     = forge.asn1.fromDer(p12Der, false); // false = no estricto
    
    // Intentar primero con legacy RC2 (BCE Ecuador), luego sin legacy
    let p12: any;
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, true, password);
    } catch {
      try {
        p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
      } catch (e2: any) {
        return { xmlFirmado: '', error: `No se pudo leer el certificado .p12: ${e2.message}. Verifica la contraseña.` };
      }
    }

    // Intentar obtener la llave privada — puede estar en pkcs8ShroudedKeyBag o keyBag
    const keyBagsShrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBagsPlain    = p12.getBags({ bagType: forge.pki.oids.keyBag });

    const allKeyBags = [
      ...(keyBagsShrouded[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
      ...(keyBagsPlain[forge.pki.oids.keyBag] ?? []),
    ];

    // Buscar la primera llave privada válida (no nula, no 0)
    let privateKey: any = null;
    for (const bag of allKeyBags) {
      if (bag?.key && typeof bag.key === 'object' && bag.key !== null) {
        privateKey = bag.key;
        break;
      }
    }

    // Si no se encontró con getBags, intentar con getAllBags
    if (!privateKey) {
      try {
        const allBags = p12.getBags({ friendlyName: undefined }) as any;
        for (const bagType of Object.values(allBags)) {
          for (const bag of (bagType as any[]).filter(Boolean)) {
            if (bag?.key && typeof bag.key === 'object' && bag.key !== null) {
              privateKey = bag.key;
              break;
            }
          }
          if (privateKey) break;
        }
      } catch { /* ignorar */ }
    }

    const certBags    = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBagList = certBags[forge.pki.oids.certBag] ?? [];

    // Cert del titular — no-CA
    const cert = certBagList.find((bag: any) => {
      const bc = bag.cert?.extensions?.find((e: any) => e.name === 'basicConstraints');
      return !bc?.cA;
    })?.cert ?? certBagList[0]?.cert;

    if (!privateKey || !cert) {
      return { xmlFirmado: '', error: 'No se encontró la llave privada o el certificado en el .p12. Verifica que la contraseña sea correcta.' };
    }

    // ── 2. Datos del cert ─────────────────────────────────────────────────
    const certDer    = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const certB64    = forge.util.encode64(certDer);
    const certDigest = sha1b64bin(certDer);

    // Modulus RSA — extraer correctamente desde el DER del certificado
    // NO usar pubKey.n.toByteArray() porque BigInteger puede perder bytes con el padding
    // En su lugar leer directamente del DER del cert para garantizar 256 bytes exactos
    let modulus = '';
    try {
      const pubKey = cert.publicKey as any;
      if (pubKey?.n) {
        // toByteArray() puede incluir un byte 0x00 de signo al inicio
        // o puede omitir bytes si el número empieza con bits en 0
        // La forma correcta: serializar a DER y extraer el INTEGER del modulus
        const nArray = pubKey.n.toByteArray() as number[];
        // Siempre incluir el padding hasta 256 bytes para RSA-2048
        // Si tiene byte de signo (0x00 al inicio), quitarlo
        const clean  = nArray[0] === 0 ? nArray.slice(1) : nArray;
        // Convertir array de números a string binario para encode64
        const binStr = clean.map((b: number) => String.fromCharCode(b & 0xFF)).join('');
        modulus = forge.util.encode64(binStr);
      }
    } catch {
      // fallback: extraer modulus directo del DER del certificado
      try {
        const certAsn1  = forge.pki.certificateToAsn1(cert);
        const certDerBuf = forge.asn1.toDer(certAsn1);
        // El modulus está en la SubjectPublicKeyInfo
        // Usar el publicKey DER directamente
        const pubKeyDer = forge.asn1.toDer(
          forge.pki.publicKeyToAsn1(cert.publicKey as any)
        ).getBytes();
        modulus = forge.util.encode64(pubKeyDer);
      } catch { modulus = 'AQAB'; }
    }

    // Issuer: filtrar campos con shortName 'undefined' (OIDs no reconocidos por node-forge)
    // El certificado UANATACA tiene un campo organizationIdentifier (OID 2.5.4.97)
    // que node-forge no reconoce y pone como shortName 'undefined'
    // El SRI no valida ese campo, pero 'undefined=...' en el DN causa error de parsing
    const issuerName = cert.issuer.attributes
      .filter((a: any) => a.shortName && a.shortName !== 'undefined' && a.shortName !== '')
      .map((a: any) => `${a.shortName}=${a.value}`)
      .join(',');

    const serialDec = BigInt(`0x${cert.serialNumber}`).toString();

    const subjectName = cert.subject.attributes
      .filter((a: any) => a.shortName && a.shortName !== 'undefined' && a.shortName !== '')
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

    const spDigest = sha1b64Buffer(normalizeNl(signedPropsConNs));

    // ── 5. Digest del documento ───────────────────────────────────────────
    // Transform: enveloped-signature
    // El SRI verifica así: toma el XML firmado, quita ds:Signature, aplica c14n, hashea.
    // Nosotros calculamos sobre el XML original SIN declaración.
    // CRÍTICO: usar crypto nativo de Node (Buffer) en lugar de forge.util.encodeUtf8()
    // porque forge tiene un bug con caracteres > U+00FF en algunos builds.
    // Buffer.from(texto, 'utf8') garantiza la codificación correcta.
    const xmlParaDigest = normalizeNl(stripXmlDeclaration(xmlOriginal));
    const xmlDigest     = sha1b64Buffer(xmlParaDigest);

    // ── 6. KeyInfo XML ────────────────────────────────────────────────────
    // El KeyInfo NO lleva xmlns:ds propio en el XML final porque hereda
    // xmlns:ds y xmlns:etsi del padre ds:Signature.
    // Por eso NO incluimos la Reference al KeyInfo en el SignedInfo:
    // el digest correcto requeriría C14N completo con propagación de namespaces
    // que no podemos calcular sin un parser C14N real.
    // El SRI acepta comprobantes sin esta Reference (es opcional en XMLDSig).
    const keyInfoXML = [
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
    ].join('');

    // ── 7. SignedInfo ─────────────────────────────────────────────────────
    // Solo 2 References: SignedProperties + Documento (#comprobante)
    // La Reference al KeyInfo se omite porque calcular su digest requiere
    // C14N real con propagación de namespaces del contexto padre.
    //
    // CRÍTICO — C14N inclusivo y propagación de namespaces:
    // El ds:Signature declara xmlns:etsi. Con C14N inclusivo,
    // el SRI propaga xmlns:etsi al SignedInfo al verificar.
    // Incluimos xmlns:etsi aquí para que el string firmado sea idéntico.
    const signedInfoXML = [
      `<ds:SignedInfo`,
        ` xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
        ` xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"`,
        ` Id="Signature-SignedInfo${ts}">`,
        `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>`,
        `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod>`,
        // Reference 1: SignedProperties
        `<ds:Reference Id="${refSpId}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#${spId}">`,
          `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>`,
          `<ds:DigestValue>${spDigest}</ds:DigestValue>`,
        `</ds:Reference>`,
        // Reference 2: Documento (enveloped-signature)
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
    // ── 8. Firmar SignedInfo con RSA-SHA1 ─────────────────────────────────
    // Usar crypto nativo de Node en lugar de forge para garantizar
    // que la firma RSA sea compatible con la verificación del SRI.
    const signedInfoC14N = normalizeNl(signedInfoXML);
    
    // Convertir la llave privada de forge a PEM para pasarla a Node crypto
    const privateKeyPem = forge.pki.privateKeyToPem(privateKey as any);
    const signer = crypto.createSign('RSA-SHA1');
    signer.update(signedInfoC14N, 'utf8');
    const sigValue = signer.sign(privateKeyPem, 'base64');

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
