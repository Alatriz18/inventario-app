const ENDPOINTS = {
  pruebas: {
    recepcion:    'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    autorizacion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
  },
  produccion: {
    recepcion:    'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    autorizacion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
  },
};

export interface RespuestaRecepcion {
  estado:   'RECIBIDA' | 'DEVUELTA' | 'ERROR';
  mensajes: string[];
}

export interface RespuestaAutorizacion {
  estado:              'AUTORIZADO' | 'NO AUTORIZADO' | 'ERROR';
  numeroAutorizacion?: string;
  fechaAutorizacion?:  string;
  mensajes:            string[];
  xmlAutorizado?:      string;
}

export async function enviarComprobante(
  xmlFirmadoBase64: string,
  ambiente: '1' | '2'
): Promise<RespuestaRecepcion> {
  const endpoint = ambiente === '2'
    ? ENDPOINTS.produccion.recepcion
    : ENDPOINTS.pruebas.recepcion;

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${xmlFirmadoBase64}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction':   '',
      },
      body:    soapBody,
      signal:  AbortSignal.timeout(30000),
    });

    const text   = await res.text();
    const estado = text.includes('RECIBIDA') ? 'RECIBIDA'
      : text.includes('DEVUELTA') ? 'DEVUELTA'
      : 'ERROR';

    // Extraer mensajes del XML de respuesta
    const mensajes: string[] = [];
    const msgMatches = text.matchAll(/<mensaje>([\s\S]*?)<\/mensaje>/g);
    for (const m of msgMatches) mensajes.push(m[1].trim());

    return { estado, mensajes };
  } catch (err: any) {
    return { estado: 'ERROR', mensajes: [err.message ?? 'Error de conexión con el SRI'] };
  }
}

export async function autorizarComprobante(
  claveAcceso: string,
  ambiente: '1' | '2'
): Promise<RespuestaAutorizacion> {
  const endpoint = ambiente === '2'
    ? ENDPOINTS.produccion.autorizacion
    : ENDPOINTS.pruebas.autorizacion;

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    const res  = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction':   '',
      },
      body:    soapBody,
      signal:  AbortSignal.timeout(30000),
    });

    const text = await res.text();

    const estado = text.includes('>AUTORIZADO<') ? 'AUTORIZADO'
      : text.includes('>NO AUTORIZADO<') ? 'NO AUTORIZADO'
      : 'ERROR';

    // Extraer datos de autorización
    const numAut  = text.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/)?.[1];
    const fechaAut = text.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/)?.[1];

    const mensajes: string[] = [];
    const msgMatches = text.matchAll(/<mensaje>([\s\S]*?)<\/mensaje>/g);
    for (const m of msgMatches) mensajes.push(m[1].trim());

    // XML autorizado completo
    const xmlMatch = text.match(/<comprobante><!\[CDATA\[([\s\S]*?)\]\]><\/comprobante>/);
    const xmlAutorizado = xmlMatch?.[1];

    return {
      estado: estado as any,
      numeroAutorizacion: numAut,
      fechaAutorizacion:  fechaAut,
      mensajes,
      xmlAutorizado,
    };
  } catch (err: any) {
    return { estado: 'ERROR', mensajes: [err.message ?? 'Error de conexión con el SRI'] };
  }
}