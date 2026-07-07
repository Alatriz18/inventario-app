'use client';

import { useState } from 'react';
import { Button }  from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { toast }   from 'sonner';
import PageHeader  from '@/components/shared/PageHeader';
import { Trash2, CheckCircle } from 'lucide-react';

export default function ResetVentasPage() {
  const { user } = useAuth();
  const [confirmado, setConfirmado] = useState(false);
  const [running,    setRunning]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [log,        setLog]        = useState<string[]>([]);

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
      const res = await fetch('/api/admin/reset-ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'BORRAR_VENTAS' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLog(prev => [...prev, `✗ Error: ${data.error ?? 'Error desconocido'}`]);
        toast.error('Error durante el reinicio');
        return;
      }
      setLog(data.log ?? []);
      setDone(true);
      toast.success('Datos de ventas eliminados correctamente');
    } catch (e: any) {
      setLog(prev => [...prev, `✗ ${e.message}`]);
      toast.error('Error de conexión');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <PageHeader
        title="Reiniciar módulo de ventas"
        description="Borra todas las ventas, compras y su historial para empezar de cero en producción"
      />

      <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
        <p className="font-bold text-red-700 text-sm">⚠️ ACCIÓN IRREVERSIBLE — borra TODO el historial</p>
        <div className="text-sm text-red-700 space-y-1">
          <p className="font-medium">Se eliminarán todos los documentos de:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1 text-xs">
            <li>Ventas, comprobantes (facturas / notas de venta SRI)</li>
            <li>Notas de crédito y notas de débito</li>
            <li>Cuentas por cobrar y retenciones emitidas</li>
            <li>Entradas, despachos y movimientos de inventario</li>
            <li>Asientos contables</li>
            <li>Facturas de proveedor, pagos y retenciones recibidas</li>
            <li>Documentos recibidos (log de XML de proveedores)</li>
          </ul>
          <p className="font-medium pt-1">También se reinician a 0 los secuenciales de factura, nota de venta, retención, nota de crédito, nota de débito, liquidación y guía en config_sri.</p>
        </div>
        <div className="border-t border-red-200 pt-3">
          <p className="text-xs text-green-700 font-medium">
            ✅ Se conservan: productos (con su stock actual tal cual), categorías, bodegas,
            proveedores, clientes, configuración de empresa/SRI/contable y períodos contables.
          </p>
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
            {running ? 'Eliminando...' : 'REINICIAR MÓDULO DE VENTAS'}
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
            <p className="text-green-800 font-semibold text-sm">Reinicio completado</p>
            <p className="text-green-700 text-xs">
              Ya puedes empezar a registrar ventas, compras y comprobantes reales desde cero.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
