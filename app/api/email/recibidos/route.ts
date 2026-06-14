import { NextRequest, NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Lee la bandeja de entrada del correo configurado (IMAP) y devuelve los XML
 * adjuntos de comprobantes electrónicos recibidos — sin necesidad de entrar al
 * portal del SRI. Por ley, los emisores envían el XML+RIDE al correo del
 * receptor, así que aquí se recolectan esos adjuntos.
 *
 * Body: { smtp: { proveedor, email, password, host?, port? }, sinceDays?: number }
 * Respuesta: { xmls: [{ filename, xml }] }
 */

const IMAP_HOSTS: Record<string, string> = {
  gmail:   'imap.gmail.com',
  outlook: 'outlook.office365.com',
};

export async function POST(req: NextRequest) {
  let client: ImapFlow | null = null;
  try {
    const { smtp, sinceDays = 30 } = await req.json();
    if (!smtp?.email || !smtp?.password) {
      return NextResponse.json({ error: 'No hay correo configurado.' }, { status: 400 });
    }

    const host = IMAP_HOSTS[smtp.proveedor as string] ?? smtp.imapHost ?? smtp.host;
    if (!host) {
      return NextResponse.json(
        { error: 'Proveedor de correo no soportado para lectura automática (usa Gmail u Outlook).' },
        { status: 400 });
    }

    client = new ImapFlow({
      host, port: 993, secure: true,
      auth: { user: smtp.email, pass: smtp.password },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const xmls: { filename: string; xml: string }[] = [];

    try {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      // Buscar mensajes recibidos desde la fecha indicada
      const uids = await client.search({ since });
      // Limitar a los 200 más recientes para no exceder el tiempo
      const recientes = (Array.isArray(uids) ? uids : []).slice(-200);

      if (recientes.length > 0) {
        for await (const msg of client.fetch(recientes, { source: true })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source as Buffer);
          for (const att of parsed.attachments ?? []) {
            const name = (att.filename ?? '').toLowerCase();
            const isXml = name.endsWith('.xml') ||
              att.contentType === 'application/xml' || att.contentType === 'text/xml';
            if (!isXml) continue;
            const content = att.content?.toString('utf8') ?? '';
            // Solo comprobantes (factura / autorización)
            if (content.includes('<factura') || content.includes('<autorizacion')) {
              xmls.push({ filename: att.filename ?? 'comprobante.xml', xml: content });
            }
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return NextResponse.json({ xmls });
  } catch (err: any) {
    try { await client?.logout(); } catch { /* ignore */ }
    return NextResponse.json(
      { error: err?.message ?? 'Error al leer el correo (verifica la contraseña de aplicación).' },
      { status: 500 });
  }
}
