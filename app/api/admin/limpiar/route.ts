import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

const CONSUMIDOR_FINAL_ID = '9999999999999';
const PRODUCTO_FILTRO     = 'doge';

function esDoge(str?: string) {
  return str?.toLowerCase().includes(PRODUCTO_FILTRO) ?? false;
}

async function borrarDocs(refs: FirebaseFirestore.DocumentReference[]): Promise<number> {
  if (refs.length === 0) return 0;
  const db = getAdminDb();
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach(r => batch.delete(r));
    await batch.commit();
  }
  return refs.length;
}

export async function POST(req: NextRequest) {
  try {
    const db  = getAdminDb();
    const log: string[] = [];
    let total = 0;

    // ── 1. Ventas de Consumidor Final o con ítems DOGE ──────────────────────
    const ventasSnap = await db.collection('ventas').get();
    const ventasEliminar = ventasSnap.docs.filter(d => {
      const v = d.data();
      return v.clienteIdentificacion === CONSUMIDOR_FINAL_ID ||
        (v.items ?? []).some((i: any) => esDoge(i.nombre) || esDoge(i.sku));
    });
    const ventaIds = new Set(ventasEliminar.map(d => d.id));
    log.push(`Ventas encontradas: ${ventasEliminar.length}`);

    // ── 2. Asientos de esas ventas ────────────────────────────────────────────
    const asientosSnap = await db.collection('asientos').get();
    const asientosEliminar = asientosSnap.docs.filter(d => {
      const a = d.data();
      return ventaIds.has(a.referenciaId) || esDoge(a.concepto);
    });

    // ── 3. Comprobantes de esas ventas ────────────────────────────────────────
    const compSnap = await db.collection('comprobantes').get();
    const compEliminar = compSnap.docs.filter(d => ventaIds.has(d.data().ventaId));

    // ── 4. Movimientos de DOGE o de esas ventas ───────────────────────────────
    const movSnap = await db.collection('movimientos').get();
    const movEliminar = movSnap.docs.filter(d => {
      const m = d.data();
      return ventaIds.has(m.referenciaId) || esDoge(m.productoNombre) || esDoge(m.sku);
    });

    // ── 5. Entradas con ítems DOGE ────────────────────────────────────────────
    const entradasSnap = await db.collection('entradas').get();
    const entradasEliminar = entradasSnap.docs.filter(d =>
      (d.data().items ?? []).some((i: any) => esDoge(i.nombre) || esDoge(i.sku))
    );

    // ── 6. Despachos con ítems DOGE ───────────────────────────────────────────
    const despachosSnap = await db.collection('despachos').get();
    const despachosEliminar = despachosSnap.docs.filter(d =>
      (d.data().items ?? []).some((i: any) => esDoge(i.nombre) || esDoge(i.sku))
    );

    // ── Borrar todo ───────────────────────────────────────────────────────────
    const n1 = await borrarDocs(ventasEliminar.map(d => d.ref));
    log.push(`✓ ventas: ${n1} eliminadas`); total += n1;

    const n2 = await borrarDocs(asientosEliminar.map(d => d.ref));
    log.push(`✓ asientos: ${n2} eliminados`); total += n2;

    const n3 = await borrarDocs(compEliminar.map(d => d.ref));
    log.push(`✓ comprobantes: ${n3} eliminados`); total += n3;

    const n4 = await borrarDocs(movEliminar.map(d => d.ref));
    log.push(`✓ movimientos: ${n4} eliminados`); total += n4;

    const n5 = await borrarDocs(entradasEliminar.map(d => d.ref));
    log.push(`✓ entradas: ${n5} eliminadas`); total += n5;

    const n6 = await borrarDocs(despachosEliminar.map(d => d.ref));
    log.push(`✓ despachos: ${n6} eliminados`); total += n6;

    // ── 7. Resetear stock del producto DOGE ───────────────────────────────────
    const prodSnap = await db.collection('productos').get();
    const dogeProds = prodSnap.docs.filter(d => esDoge(d.data().nombre) || esDoge(d.data().sku));
    if (dogeProds.length > 0) {
      const batch = db.batch();
      dogeProds.forEach(d => batch.update(d.ref, { stockActual: 0 }));
      await batch.commit();
      log.push(`✓ producto DOGE: stock reseteado a 0`);
    } else {
      log.push('producto DOGE: no encontrado');
    }

    log.push(`✅ Limpieza completada. ${total} registros eliminados.`);
    return NextResponse.json({ ok: true, log, total });

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
