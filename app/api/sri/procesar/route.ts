import { NextRequest, NextResponse } from 'next/server';
import { firmarXML }           from '@/lib/sri/firmador';
import { enviarComprobante, autorizarComprobante } from '@/lib/sri/webservice';
import * as forge from 'node-forge';

export async function POST(req: NextRequest) {
  try {
    const { xml, p12Base64, password, claveAcceso, ambiente } = await req.json();

    if (!xml || !p12Base64 || !password || !claveAcceso) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
    }

    // 1. Firmar XML
    const { xmlFirmado, error: errorFirma } = firmarXML(xml, p12Base64, password);
    if (errorFirma || !xmlFirmado) {
      return NextResponse.json({ error: errorFirma ?? 'Error al firmar' }, { status: 400 });
    }

    // 2. Convertir a base64 para enviar al SRI
    const xmlFirmadoB64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');

    // 3. Enviar al SRI
    const recepcion = await enviarComprobante(xmlFirmadoB64, ambiente ?? '1');
    if (recepcion.estado === 'ERROR') {
      return NextResponse.json({
        etapa:    'recepcion',
        estado:   'ERROR',
        mensajes: recepcion.mensajes,
      }, { status: 200 });
    }

    if (recepcion.estado === 'DEVUELTA') {
      return NextResponse.json({
        etapa:       'recepcion',
        estado:      'DEVUELTA',
        mensajes:    recepcion.mensajes,
        xmlFirmadoB64,
      }, { status: 200 });
    }

    // 4. Consultar autorización (con reintentos)
    let autorizacion = await autorizarComprobante(claveAcceso, ambiente ?? '1');

    // Reintento tras 3 segundos si no está listo
    if (autorizacion.estado === 'ERROR') {
      await new Promise(r => setTimeout(r, 3000));
      autorizacion = await autorizarComprobante(claveAcceso, ambiente ?? '1');
    }

    return NextResponse.json({
      etapa:              'autorizacion',
      estado:             autorizacion.estado,
      numeroAutorizacion: autorizacion.numeroAutorizacion,
      fechaAutorizacion:  autorizacion.fechaAutorizacion,
      mensajes:           autorizacion.mensajes,
      xmlFirmadoB64,
      xmlAutorizado:      autorizacion.xmlAutorizado,
    }, { status: 200 });

  } catch (err: any) {
    console.error('Error SRI:', err);
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}