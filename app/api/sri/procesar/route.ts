import { NextRequest, NextResponse } from 'next/server';
import { firmarXML }                 from '@/lib/sri/firmador';
import { enviarComprobante, autorizarComprobante } from '@/lib/sri/webservice';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { xml, p12Base64, password, claveAcceso, ambiente } = body;

    // ── Validar parámetros con mensajes específicos ───────────────────────
    if (!xml) {
      return NextResponse.json({ etapa: 'validacion', error: 'Falta el XML del comprobante' }, { status: 400 });
    }
    if (!p12Base64) {
      return NextResponse.json({ etapa: 'validacion', error: 'Falta el certificado digital (.p12). Configúralo en Ajustes → Configuración SRI.' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ etapa: 'validacion', error: 'Falta la contraseña del certificado .p12' }, { status: 400 });
    }
    if (!claveAcceso) {
      return NextResponse.json({ etapa: 'validacion', error: 'Falta la clave de acceso del comprobante' }, { status: 400 });
    }
    if (claveAcceso.length !== 49) {
      return NextResponse.json({
        etapa: 'validacion',
        error: `Clave de acceso inválida: tiene ${claveAcceso.length} dígitos (deben ser exactamente 49)`,
        claveAcceso,
      }, { status: 400 });
    }

    // ── 1. Firmar XML ─────────────────────────────────────────────────────
    const { xmlFirmado, error: errorFirma } = firmarXML(xml, p12Base64, password);
    if (errorFirma || !xmlFirmado) {
      return NextResponse.json({
        etapa: 'firma',
        error: errorFirma ?? 'Error al firmar el XML',
      }, { status: 400 });
    }

    // ── 2. Convertir a base64 ─────────────────────────────────────────────
    const xmlFirmadoB64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');

    // ── 3. Enviar al SRI ──────────────────────────────────────────────────
    const amb = ambiente ?? '1';
    const recepcion = await enviarComprobante(xmlFirmadoB64, amb);

    if (recepcion.estado === 'DEVUELTA' || recepcion.estado === 'ERROR') {
      return NextResponse.json({
        etapa:        'recepcion',
        estado:       recepcion.estado,
        mensajes:     recepcion.mensajes,
        xmlFirmadoB64,   // devolver para diagnóstico
        xmlFirmado,      // texto plano para poder leerlo
      }, { status: 200 });
    }

    // ── 4. Consultar autorización ─────────────────────────────────────────
    // El SRI es asíncrono: esperar hasta 5s antes de reintentar
    let autorizacion = await autorizarComprobante(claveAcceso, amb);

    if (autorizacion.estado !== 'AUTORIZADO') {
      await new Promise(r => setTimeout(r, 4000));
      autorizacion = await autorizarComprobante(claveAcceso, amb);
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
    console.error('[SRI] Error interno:', err);
    return NextResponse.json({
      etapa: 'interno',
      error: err.message ?? 'Error interno del servidor',
    }, { status: 500 });
  }
}
