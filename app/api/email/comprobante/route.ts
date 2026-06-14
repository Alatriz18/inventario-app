import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

/**
 * Envía un comprobante electrónico por correo (XML autorizado + RIDE PDF) usando
 * el SMTP que el usuario configuró en Configuración → Correo (Gmail / Outlook /
 * otro). Las credenciales viajan en el body desde el cliente (mismo origen).
 *
 * IMPORTANTE: para Gmail y Outlook debe usarse una CONTRASEÑA DE APLICACIÓN
 * (no la contraseña normal de la cuenta), generada con la verificación en dos
 * pasos activada.
 *
 * Body:
 *  {
 *    smtp: { proveedor, email, password, fromName?, host?, port? },
 *    to, subject, html?,
 *    xmlContent?, xmlFilename?, pdfBase64?, pdfFilename?
 *  }
 */

const PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail:   { host: 'smtp.gmail.com',     port: 465, secure: true  },
  outlook: { host: 'smtp.office365.com', port: 587, secure: false },
};

export async function POST(req: NextRequest) {
  try {
    const {
      smtp,
      to, subject, html,
      xmlContent, xmlFilename = 'comprobante.xml',
      pdfBase64,  pdfFilename = 'RIDE.pdf',
    } = await req.json();

    if (!smtp?.email || !smtp?.password) {
      return NextResponse.json(
        { error: 'No hay un correo configurado. Ve a Configuración → Correo y agrega tu cuenta SMTP.' },
        { status: 400 });
    }
    if (!to || !/.+@.+\..+/.test(to)) {
      return NextResponse.json({ error: 'Correo del destinatario inválido.' }, { status: 400 });
    }

    // Determinar host/puerto según el proveedor
    let server = PRESETS[smtp.proveedor as string];
    if (!server) {
      if (!smtp.host || !smtp.port) {
        return NextResponse.json(
          { error: 'Para un proveedor personalizado debes indicar host y puerto SMTP.' },
          { status: 400 });
      }
      server = { host: smtp.host, port: Number(smtp.port), secure: Number(smtp.port) === 465 };
    }

    const transporter = nodemailer.createTransport({
      host:   server.host,
      port:   server.port,
      secure: server.secure,
      auth:   { user: smtp.email, pass: smtp.password },
    });

    const attachments: { filename: string; content: Buffer | string }[] = [];
    if (xmlContent) attachments.push({ filename: xmlFilename, content: Buffer.from(xmlContent, 'utf8') });
    if (pdfBase64)  attachments.push({ filename: pdfFilename, content: Buffer.from(pdfBase64, 'base64') });

    await transporter.sendMail({
      from:    smtp.fromName ? `"${smtp.fromName}" <${smtp.email}>` : smtp.email,
      to,
      subject: subject ?? 'Comprobante electrónico',
      html:    html ?? '<p>Adjuntamos su comprobante electrónico autorizado por el SRI.</p>',
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Mensajes típicos de SMTP (auth fallida, etc.)
    const msg = err?.response ?? err?.message ?? 'Error al enviar el correo';
    return NextResponse.json({ error: String(msg) }, { status: 500 });
  }
}
