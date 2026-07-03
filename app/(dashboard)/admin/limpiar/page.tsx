'use client';

import { useState } from 'react';
import { Button }  from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { toast }   from 'sonner';
import PageHeader  from '@/components/shared/PageHeader';
import { Trash2, CheckCircle } from 'lucide-react';

export default function LimpiarDatosPage() {
  const { user } = useAuth();
  const [confirmado,    setConfirmado]    = useState(false);
  const [running,       setRunning]       = useState(false);
  const [done,          setDone]          = useState(false);
  const [log,           setLog]           = useState<string[]>([]);
  const [fixingCxC,     setFixingCxC]     = useState(false);
  const [fixCxCResult,  setFixCxCResult]  = useState<string | null>(null);

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
    setLog(['Enviando solicitud al servidor...']);
    try {
      const res  = await fetch('/api/admin/limpiar', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLog(prev => [...prev, `✗ Error: ${data.error ?? 'Error desconocido'}`]);
        toast.error('Error durante la limpieza');
        return;
      }
      setLog(data.log ?? []);
      setDone(true);
      toast.success('Datos eliminados correctamente');
    } catch (e: any) {
      setLog(prev => [...prev, `✗ ${e.message}`]);
      toast.error('Error de conexión');
    } finally {
      setRunning(false);
    }
  };

  const fixCxC = async () => {
    setFixingCxC(true);
    setFixCxCResult(null);
    try {
      const res  = await fetch('/api/admin/fix-cxc', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Error');
      setFixCxCResult(`✅ ${data.total} CxC corregidas`);
      toast.success(`${data.total} cuentas por cobrar corregidas`);
    } catch (e: any) {
      setFixCxCResult(`✗ Error: ${e.message}`);
      toast.error(e.message);
    } finally {
      setFixingCxC(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <PageHeader
        title="Limpieza de datos de prueba"
        description="Elimina registros del producto DOGE y ventas a Consumidor Final"
      />

      {/* Fix CxC huérfanas */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
        <p className="font-bold text-blue-800 text-sm">🔧 Sincronizar CxC con ventas anuladas</p>
        <p className="text-xs text-blue-700">
          Corrige cuentas por cobrar que quedaron pendientes por ventas a crédito que ya fueron anuladas.
        </p>
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700"
          disabled={fixingCxC}
          onClick={fixCxC}
        >
          {fixingCxC ? 'Procesando...' : 'Corregir CxC pendientes'}
        </Button>
        {fixCxCResult && (
          <p className={`text-xs font-mono ${fixCxCResult.startsWith('✅') ? 'text-blue-700' : 'text-red-600'}`}>
            {fixCxCResult}
          </p>
        )}
      </div>

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
