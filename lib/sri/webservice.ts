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

    // Extraer mensajes del SRI correctamente
    // La respuesta tiene: <mensaje><identificador>43</identificador><mensaje>FIRMA NO VÁLIDA</mensaje><informacionAdicional>...</informacionAdicional><tipo>ERROR</tipo></mensaje>
    const mensajes: string[] = [];
    const bloques = text.matchAll(/<mensaje>[\s\S]*?<identificador>([\s\S]*?)<\/identificador>[\s\S]*?<mensaje>([\s\S]*?)<\/mensaje>(?:[\s\S]*?<informacionAdicional>([\s\S]*?)<\/informacionAdicional>)?/g);
    for (const m of bloques) {
      const id   = m[1]?.trim() ?? '?';
      const msg  = m[2]?.trim() ?? '';
      const info = m[3]?.trim() ?? '';
      mensajes.push(`[${id}] ${msg}${info ? ' — ' + info : ''}`);
    }
    // Fallback si no hay mensajes estructurados
    if (mensajes.length === 0) {
      const raw = text.matchAll(/<mensaje>([\s\S]*?)<\/mensaje>/g);
      for (const m of raw) {
        const clean = m[1].trim().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean) mensajes.push(clean);
      }
    }

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
    // Capturar identificador + mensaje + informacionAdicional (el motivo REAL del 39 está aquí)
    const bloques = text.matchAll(/<mensaje>[\s\S]*?<identificador>([\s\S]*?)<\/identificador>[\s\S]*?<mensaje>([\s\S]*?)<\/mensaje>(?:[\s\S]*?<informacionAdicional>([\s\S]*?)<\/informacionAdicional>)?/g);
    for (const m of bloques) {
      const id   = m[1]?.trim() ?? '?';
      const msg  = m[2]?.trim() ?? '';
      const info = m[3]?.trim() ?? '';
      mensajes.push(`[${id}] ${msg}${info ? ' — ' + info : ''}`);
    }
    // Fallback si la respuesta no trae mensajes estructurados
    if (mensajes.length === 0) {
      const raw = text.matchAll(/<mensaje>([\s\S]*?)<\/mensaje>/g);
      for (const m of raw) {
        const clean = m[1].trim().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean) mensajes.push(clean);
      }
    }

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