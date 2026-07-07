import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

// Colecciones transaccionales de ventas/compras/inventario/contabilidad que se
// vacían por completo. NO toca productos, categorias, bodegas, proveedores,
// clientes, config_* ni periodos_contables.
const COLECCIONES_A_BORRAR = [
  'ventas',
  'comprobantes',
  'notas_credito',
  'notas_debito',
  'cuentas_cobrar',
  'retenciones_emitidas',
  'despachos',
  'entradas',
  'movimientos',
  'asientos',
  'facturas_proveedor',
  'retenciones_recibidas',
  'documentos_recibidos',
];

async function borrarColeccion(
  db: FirebaseFirestore.Firestore,
  nombre: string
): Promise<number> {
  const snap = await db.collection(nombre).get();
  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  return refs.length;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== 'BORRAR_VENTAS') {
      return NextResponse.json(
        { ok: false, error: 'Falta confirmación. Envía { "confirm": "BORRAR_VENTAS" } en el body.' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const log: string[] = [];
    let total = 0;

    for (const nombre of COLECCIONES_A_BORRAR) {
      const n = await borrarColeccion(db, nombre);
      total += n;
      log.push(`✓ ${nombre}: ${n} documentos eliminados`);
    }

    // Reiniciar secuenciales de comprobantes SRI
    const configSriRef = db.collection('config_sri').doc('config');
    const configSriSnap = await configSriRef.get();
    if (configSriSnap.exists) {
      await configSriRef.update({
        secuencialFactura: 0,
        secuencialNotaVenta: 0,
        secuencialRetencion: 0,
        secuencialNotaCredito: 0,
        secuencialNotaDebito: 0,
        secuencialLiquidacion: 0,
        secuencialGuia: 0,
      });
      log.push('✓ config_sri: secuenciales reiniciados a 0');
    } else {
      log.push('config_sri: documento "config" no encontrado, se omite');
    }

    log.push(`✅ Reinicio completado. ${total} documentos eliminados en total.`);
    return NextResponse.json({ ok: true, log, total });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
