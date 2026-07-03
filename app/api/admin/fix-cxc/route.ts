import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST() {
  try {
    const db   = getAdminDb();
    const logs: string[] = [];

    // 1. Buscar todas las ventas anuladas que eran crédito
    const ventasSnap = await db.collection('ventas')
      .where('estado', '==', 'anulada')
      .where('esCxC',  '==', true)
      .get();

    logs.push(`Ventas anuladas con CxC: ${ventasSnap.size}`);

    if (ventasSnap.empty) {
      return NextResponse.json({ ok: true, logs, total: 0 });
    }

    const batch = db.batch();
    let total   = 0;

    for (const ventaDoc of ventasSnap.docs) {
      const venta = ventaDoc.data();

      // Buscar la CxC vinculada por ventaId
      const cxcSnap = await db.collection('cuentas_cobrar')
        .where('ventaId', '==', ventaDoc.id)
        .get();

      for (const cxcDoc of cxcSnap.docs) {
        const cxc = cxcDoc.data();
        if (cxc.estado !== 'pagada' && cxc.estado !== 'anulada') {
          batch.update(cxcDoc.ref, {
            estado:    'anulada',
            anuladaAt: new Date(),
          });
          logs.push(`CxC ${cxcDoc.id} (cliente: ${cxc.clienteNombre}) → anulada`);
          total++;
        }
      }
    }

    if (total > 0) await batch.commit();

    logs.push(`\nTotal CxC corregidas: ${total}`);
    return NextResponse.json({ ok: true, logs, total });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
