'use client';

import { useState } from 'react';
import { collection, getDocs, deleteDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Button }     from '@/components/ui/button';
import { useAuth }    from '@/context/AuthContext';
import { toast }      from 'sonner';
import PageHeader     from '@/components/shared/PageHeader';
import { Trash2, CheckCircle } from 'lucide-react';

const COLECCIONES: string[] = [
  'ventas',
  'asientos',
  'comprobantes',
  'movimientos',
  'entradas',
  'despachos',
  'facturas_proveedor',
  'pagos_proveedor',
];

async function vaciarColeccion(nombre: string, onLog: (msg: string) => void): Promise<number> {
  const snap = await getDocs(collection(db, nombre));
  if (snap.empty) { onLog(`${nombre}: sin registros`); return 0; }
  let count = 0;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
    count += Math.min(400, docs.length - i);
  }
  onLog(`✓ ${nombre}: ${count} registros eliminados`);
  return count;
}

async function resetearStock(onLog: (msg: string) => void): Promise<void> {
  const snap = await getDocs(collection(db, 'productos'));
  if (snap.empty) { onLog('productos: sin registros'); return; }
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach(d => batch.update(d.ref, { stockActual: 0 }));
    await batch.commit();
  }
  onLog(`✓ productos: stock reseteado a 0 en ${snap.docs.length} productos`);
}

export default function LimpiarDatosPage() {
  const { user }         = useAuth();
  const [confirmado,  setConfirmado]  = useState(false);
  const [running,     setRunning]     = useState(false);
  const [done,        setDone]        = useState(false);
  const [log,         setLog]         = useState<string[]>([]);

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
    setLog(['Iniciando limpieza...']);
    let total = 0;
    try {
      for (const col of COLECCIONES) {
        try {
          total += await vaciarColeccion(col, addLog);
        } catch (e: any) {
          addLog(`✗ ERROR en ${col}: ${e.message}`);
        }
      }
      await resetearStock(addLog);
      addLog(`─────────────────────────────`);
      addLog(`✅ Limpieza completada. ${total} registros eliminados.`);
      setDone(true);
      toast.success('Datos de prueba eliminados');
    } catch (e: any) {
      addLog(`Error general: ${e.message}`);
      toast.error('Error durante la limpieza');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <PageHeader
        title="Limpieza de datos de prueba"
        description="Elimina todos los registros transaccionales antes de usar el sistema en producción"
      />

      {/* Advertencia */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
        <p className="font-bold text-red-700 text-sm">⚠️ ACCIÓN IRREVERSIBLE — no hay deshacer</p>
        <div className="text-sm text-red-700 space-y-1">
          <p className="font-medium">Se eliminarán completamente:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            {COLECCIONES.map(c => <li key={c}><code className="text-xs bg-red-100 px-1 rounded">{c}</code></li>)}
          </ul>
          <p className="font-medium mt-2">El stock de todos los productos quedará en <code className="bg-red-100 px-1 rounded text-xs">0</code> (deberás ingresar entradas reales).</p>
        </div>
        <div className="border-t border-red-200 pt-3">
          <p className="text-sm text-green-700 font-medium">✅ Se conservan intactos:</p>
          <p className="text-xs text-green-700 mt-0.5">productos, categorías, bodegas, clientes, proveedores, plan de cuentas, configuración SRI/empresa/contable</p>
        </div>
      </div>

      {/* Confirmación y botón */}
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
            {running ? 'Eliminando datos...' : 'ELIMINAR DATOS DE PRUEBA'}
          </Button>
        </div>
      )}

      {/* Log de progreso */}
      {log.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4 space-y-1 max-h-64 overflow-y-auto">
          {log.map((l, i) => (
            <p key={i} className={`text-xs font-mono ${l.startsWith('✗') ? 'text-red-400' : l.startsWith('✅') ? 'text-yellow-300 font-bold' : 'text-green-400'}`}>
              {l}
            </p>
          ))}
        </div>
      )}

      {/* Mensaje final */}
      {done && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-green-800 font-semibold text-sm">Sistema listo para datos reales</p>
            <p className="text-green-700 text-xs">
              Ahora puedes ingresar entradas de inventario para establecer el stock inicial real
              y empezar a registrar ventas de producción.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
