'use client';

import { useState } from 'react';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Button }  from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { toast }   from 'sonner';
import PageHeader  from '@/components/shared/PageHeader';
import { Trash2, CheckCircle } from 'lucide-react';

const CONSUMIDOR_FINAL_ID = '9999999999999';
const PRODUCTO_FILTRO     = 'doge';

function esDoge(str?: string) {
  return str?.toLowerCase().includes(PRODUCTO_FILTRO) ?? false;
}

async function borrarEnBatch(docs: { ref: any }[], onLog: (m: string) => void, label: string) {
  if (docs.length === 0) { onLog(`${label}: sin registros`); return 0; }
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  onLog(`✓ ${label}: ${docs.length} eliminados`);
  return docs.length;
}

export default function LimpiarDatosPage() {
  const { user } = useAuth();
  const [confirmado, setConfirmado] = useState(false);
  const [running,    setRunning]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [log,        setLog]        = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [...prev, msg]);

  if (!user || user.rol !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <Trash2 className="h-12 w-12 text-slate-200 mb-4" />
        <p className="text-slate-500 text-sm">Solo el administrador puede acceder a esta página.</p>
      </div>
    );
  }

  const ejecutar = async () => {
    if (!confirmado) return;
    setRunning(true);
    setLog(['Analizando base de datos...']);
    let total = 0;

    try {
      // ── 1. Encontrar ventas de CONSUMIDOR FINAL o con ítems DOGE ──────────
      const ventasSnap = await getDocs(collection(db, 'ventas'));
      const ventasEliminar = ventasSnap.docs.filter(d => {
        const v = d.data();
        const esConsumidorFinal = v.clienteIdentificacion === CONSUMIDOR_FINAL_ID;
        const tieneDoge = (v.items ?? []).some((i: any) => esDoge(i.nombre) || esDoge(i.sku));
        return esConsumidorFinal || tieneDoge;
      });
      const ventaIds = new Set(ventasEliminar.map(d => d.id));
      addLog(`Ventas a eliminar: ${ventasEliminar.length}`);

      // ── 2. Asientos relacionados a esas ventas ────────────────────────────
      const asientosSnap = await getDocs(collection(db, 'asientos'));
      const asientosEliminar = asientosSnap.docs.filter(d => {
        const a = d.data();
        return ventaIds.has(a.referenciaId) ||
               esDoge(a.concepto);
      });

      // ── 3. Comprobantes relacionados a esas ventas ─────────────────────────
      const compSnap = await getDocs(collection(db, 'comprobantes'));
      const compEliminar = compSnap.docs.filter(d => ventaIds.has(d.data().ventaId));

      // ── 4. Movimientos de DOGE o de esas ventas ────────────────────────────
      const movSnap = await getDocs(collection(db, 'movimientos'));
      const movEliminar = movSnap.docs.filter(d => {
        const m = d.data();
        return ventaIds.has(m.referenciaId) ||
               esDoge(m.productoNombre) ||
               esDoge(m.sku);
      });

      // ── 5. Entradas con ítems DOGE ─────────────────────────────────────────
      const entradasSnap = await getDocs(collection(db, 'entradas'));
      const entradasEliminar = entradasSnap.docs.filter(d => {
        const e = d.data();
        return (e.items ?? []).some((i: any) => esDoge(i.nombre) || esDoge(i.sku));
      });

      // ── 6. Despachos con ítems DOGE ────────────────────────────────────────
      const despachosSnap = await getDocs(collection(db, 'despachos'));
      const despachosEliminar = despachosSnap.docs.filter(d => {
        const e = d.data();
        return (e.items ?? []).some((i: any) => esDoge(i.nombre) || esDoge(i.sku));
      });

      addLog('─────────────────────────────');

      // ── Borrar todo ────────────────────────────────────────────────────────
      total += await borrarEnBatch(ventasEliminar,    addLog, 'ventas');
      total += await borrarEnBatch(asientosEliminar,  addLog, 'asientos');
      total += await borrarEnBatch(compEliminar,      addLog, 'comprobantes');
      total += await borrarEnBatch(movEliminar,       addLog, 'movimientos');
      total += await borrarEnBatch(entradasEliminar,  addLog, 'entradas');
      total += await borrarEnBatch(despachosEliminar, addLog, 'despachos');

      // ── 7. Resetear stock del producto DOGE a 0 ────────────────────────────
      const prodSnap = await getDocs(collection(db, 'productos'));
      const dogeProds = prodSnap.docs.filter(d => esDoge(d.data().nombre) || esDoge(d.data().sku));
      if (dogeProds.length > 0) {
        const batch = writeBatch(db);
        dogeProds.forEach(d => batch.update(d.ref, { stockActual: 0 }));
        await batch.commit();
        addLog(`✓ producto DOGE: stock reseteado a 0`);
      } else {
        addLog('producto DOGE: no encontrado');
      }

      addLog('─────────────────────────────');
      addLog(`✅ Limpieza completada. ${total} registros eliminados.`);
      setDone(true);
      toast.success('Datos eliminados correctamente');
    } catch (e: any) {
      addLog(`✗ Error: ${e.message}`);
      toast.error('Error durante la limpieza');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <PageHeader
        title="Limpieza de datos de prueba"
        description="Elimina registros del producto DOGE y ventas a Consumidor Final"
      />

      <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
        <p className="font-bold text-red-700 text-sm">⚠️ ACCIÓN IRREVERSIBLE</p>
        <div className="text-sm text-red-700 space-y-1">
          <p className="font-medium">Se eliminarán:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1 text-xs">
            <li>Ventas a <strong>CONSUMIDOR FINAL</strong></li>
            <li>Ventas que contengan el producto <strong>DOGE</strong></li>
            <li>Asientos contables de esas ventas</li>
            <li>Comprobantes SRI de esas ventas</li>
            <li>Movimientos de inventario de DOGE</li>
            <li>Entradas y despachos de DOGE</li>
            <li>Stock del producto DOGE → reseteado a <strong>0</strong></li>
          </ul>
        </div>
        <div className="border-t border-red-200 pt-3">
          <p className="text-xs text-green-700 font-medium">✅ Todo lo demás se conserva intacto</p>
        </div>
      </div>

      {!done && (
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={e => setConfirmado(e.target.checked)}
              className="h-4 w-4 accent-red-600"
              disabled={running}
            />
            <span className="text-sm font-medium text-slate-700">
              Entiendo que esta acción es permanente e irreversible
            </span>
          </label>
          <Button
            variant="destructive"
            className="w-full h-12 text-base font-bold"
            disabled={!confirmado || running}
            onClick={ejecutar}
          >
            {running ? 'Eliminando...' : 'ELIMINAR DATOS DE PRUEBA'}
          </Button>
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4 space-y-1 max-h-72 overflow-y-auto">
          {log.map((l, i) => (
            <p key={i} className={`text-xs font-mono ${
              l.startsWith('✗') ? 'text-red-400' :
              l.startsWith('✅') ? 'text-yellow-300 font-bold' :
              l.startsWith('─') ? 'text-slate-600' :
              'text-green-400'
            }`}>{l}</p>
          ))}
        </div>
      )}

      {done && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-green-800 font-semibold text-sm">Limpieza completada</p>
            <p className="text-green-700 text-xs">
              Si quieres usar el producto DOGE en producción, entra a Inventario → Entradas
              para registrar el stock inicial real.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
