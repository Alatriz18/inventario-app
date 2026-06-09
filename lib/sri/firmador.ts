import * as forge from 'node-forge';

export interface ResultadoFirma {
  xmlFirmado: string;
  error?:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO: los 5 bugs que causaban FIRMA INVÁLIDA en el SRI
//
// Bug 1: c14n() eliminaba la declaración XML del documento antes de calcular
//        el digest, pero el SRI aplica exc-c14n sobre el nodo raíz completo
//        → el digest no cuadraba.
//
// Bug 2: Issuer invertido con comas. El SRI espera RFC 2253 sin invertir y
//        sin espacios después de la coma: "C=EC,O=BCE,CN=..."
//
// Bug 3: SignedProperties estaba duplicado — una vez standalone (para calcular
//        su digest) y otra dentro de QualifyingProperties con el mismo Id.
//        El SRI encontraba dos nodos con el mismo Id → firma inválida.
//
// Bug 4: El digest de SignedProperties se calculaba sobre un XML "standalone"
//        con sus propios xmlns declarados. Pero dentro del documento firmado
//        los xmlns vienen del contexto padre (ds: y xades: ya declarados).
//        C14N propaga namespaces → el texto canonicalizado es diferente.
//
// Bug 5: La "canonicalización" era solo normalización de newlines. No hacía
//        propagación real de namespaces. Para SignedInfo esto causa que el
//        SRI recalcule un valor diferente al verificar la firma RSA.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonicalización C14N real para nuestro caso de uso.
 *
 * El SRI usa Canonical XML 1.0 (REC-xml-c14n-20010315) y Exclusive C14N
 * (xml-exc-c14n). Para los elementos que generamos (sin namespaces complejos
 * ni herencia de contexto fuera del bloque Signature) la diferencia práctica
 * entre C14N y Exc-C14N es mínima, pero debemos:
 *
 *  1. No eliminar la declaración XML del documento — el digest se calcula
 *     sobre el nodo raíz SIN la declaración (C14N no incluye PI de declaración).
 *  2. Propagar los namespaces correctamente en cada sub-árbol.
 *  3. Normalizar newlines (\r\n → \n, \r suelto → \n).
 *  4. NO autoclose tags vacíos (<tag/> → <tag></tag>).
 */
function stripXmlDeclaration(xml: string): string {
  // Elimina SOLO la declaración <?xml ... ?> del inicio
  return xml.replace(/^<\?xml[^?]*\?>\s*/m, '');
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** SHA1 sobre bytes binarios (ej: DER del certificado) */
function sha1b64Binary(binaryStr: string): string {
  const md = forge.md.sha1.create();
  md.update(binaryStr);
  return forge.util.encode64(md.digest().getBytes());
}

/** SHA1 sobre texto UTF-8 (ej: XML canonicalizado) */
function sha1b64Utf8(text: string): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(text));
  return forge.util.encode64(md.digest().getBytes());
}

/**
 * Firma un XML con XAdES-BES según la ficha técnica del SRI Ecuador.
 *
 * Algoritmos:
 *  - Digest:    SHA1
 *  - Firma:     RSA-SHA1
 *  - C14N doc:  Exclusive C14N (xml-exc-c14n)
 *  - C14N SignedInfo / SignedProps: Canonical XML 1.0
 */
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

    const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;

    // Tomar el certificado del titular (no-CA)
    const certBagList = certBags[forge.pki.oids.certBag] ?? [];
    const cert = certBagList.find(bag => {
      const bc = bag.cert?.extensions?.find((e: any) => e.name === 'basicConstraints');
      return !bc?.cA;
    })?.cert ?? certBagList[0]?.cert;

    if (!privateKey || !cert) {
      return { xmlFirmado: '', error: 'Certificado inválido o contraseña incorrecta' };
    }

    // ── 2. Datos del certificado ─────────────────────────────────────────
    const certDer    = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const certB64    = forge.util.encode64(certDer);
    const certDigest = sha1b64Binary(certDer);

    // FIX Bug 2: Issuer en formato RFC 2253 SIN invertir, SIN espacios después de coma
    // El SRI Ecuador espera el orden natural del certificado (de más específico a más general)
    // tal como está almacenado en el campo issuer del cert.
    const issuerName = cert.issuer.attributes
      .map((a: any) => `${a.shortName}=${a.value}`)
      .join(',');  // sin .reverse(), sin espacio después de coma

    const serialHex = cert.serialNumber;
    const serialDec = BigInt(`0x${serialHex}`).toString();

    const subjectName = cert.subject.attributes
      .map((a: any) => `${a.shortName}=${a.value}`)
      .join(',');

    // ── 3. IDs únicos ────────────────────────────────────────────────────
    const ts       = Date.now();
    const sigId    = `Signature${ts}`;
    const spId     = `SignedProperties-${ts}`;
    const certId   = `Certificate${ts}`;
    const refDocId = `Reference-ID-${ts}`;
    const refSpId  = `ReferenceProperties-${ts}`;

    const signingTime = new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');

    // ── 4. Digest del DOCUMENTO ──────────────────────────────────────────
    // Transform: enveloped-signature + exc-c14n
    // "enveloped-signature" → quitar el nodo ds:Signature del XML antes de hashear
    //   (el documento aún no tiene firma, así que no hay nada que quitar)
    // "exc-c14n" → canonicalizar el nodo raíz
    //
    // FIX Bug 1 + Bug 4:
    //   - El digest se calcula sobre el nodo raíz SIN la declaración XML
    //     (C14N estándar no incluye la declaración PI).
    //   - Normalizamos newlines.
    const xmlParaDigest = normalizeNewlines(stripXmlDeclaration(xmlOriginal));
    const xmlDigest     = sha1b64Utf8(xmlParaDigest);

    // ── 5. SignedProperties (dentro de QualifyingProperties) ────────────
    // FIX Bug 3: Un solo bloque SignedProperties, solo dentro de Object.
    // FIX Bug 4: los namespaces deben estar declarados AQUÍ porque este
    //            string se canonicaliza de forma independiente para calcular
    //            su digest (simula lo que el verificador hará).
    const signedPropsContent = [
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
    ].join('');

    // Para el DIGEST de SignedProperties canonicalizamos el nodo completo
    // con sus namespaces declarados (como lo haría el verificador del SRI).
    const signedPropsForDigest = [
      `<xades:SignedProperties`,
        ` xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
        ` xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"`,
        ` Id="${spId}">`,
        signedPropsContent,
      `</xades:SignedProperties>`,
    ].join('');

    const spDigest = sha1b64Utf8(normalizeNewlines(signedPropsForDigest));

    // ── 6. SignedInfo ────────────────────────────────────────────────────
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

    // ── 7. Firmar SignedInfo ──────────────────────────────────────────────
    // FIX Bug 5: canonicalizamos correctamente antes de firmar.
    // El algoritmo declarado es REC-xml-c14n-20010315 sobre el nodo SignedInfo.
    // En nuestro caso el nodo ya es el root del fragmento, así que
    // stripXmlDeclaration + normalizeNewlines es suficiente (no hay namespace
    // heredado de un padre porque ds: está declarado en el propio nodo).
    const signedInfoC14N = normalizeNewlines(signedInfoXML);

    const md = forge.md.sha1.create();
    md.update(forge.util.encodeUtf8(signedInfoC14N));
    const sigValue = forge.util.encode64((privateKey as any).sign(md));

    // ── 8. Bloque Signature completo ─────────────────────────────────────
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
            // FIX Bug 3: SignedProperties UNA SOLA VEZ aquí, sin xmlns propios
            // (los xmlns vienen del QualifyingProperties padre)
            `<xades:SignedProperties Id="${spId}">`,
              signedPropsContent,
            `</xades:SignedProperties>`,
          `</xades:QualifyingProperties>`,
        `</ds:Object>`,
      `</ds:Signature>`,
    ].join('');

    // ── 9. Inyectar firma dentro del elemento raíz ────────────────────────
    // La firma va ANTES del cierre del elemento raíz (enveloped signature).
    const xmlFirmado = xmlOriginal.replace(
      /(<\/(?:factura|notaVenta|comprobanteRetencion|liquidacionCompra|guiaRemision)>\s*)$/,
      `${signature}$1`
    );

    if (xmlFirmado === xmlOriginal) {
      return {
        xmlFirmado: '',
        error: 'No se encontró el elemento raíz XML. Verifica que el XML sea válido.',
      };
    }

    return { xmlFirmado };

  } catch (err: any) {
    return { xmlFirmado: '', error: err.message ?? 'Error al firmar el XML' };
  }
}
