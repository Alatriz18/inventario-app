'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BookMarked, Download, Play, Search, AlertTriangle } from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Badge }   from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { useAuth } from '@/context/AuthContext';
import CuentaCombobox from '@/components/shared/CuentaCombobox';
import { PLAN_CUENTAS_SUPERCIAS } from '@/lib/data/plan-cuentas-supercias';
import {
  analizarMigracion, generarRespaldo, aplicarMigracion,
  AnalisisMigracion, ResultadoMigracion,
} from '@/lib/contabilidad/migrar-plan';

export default function MigrarPlanPage() {
  const { hasRole } = useAuth();
  const [analisis,   setAnalisis]   = useState<AnalisisMigracion | null>(null);
  const [manuales,   setManuales]   = useState<Record<string, string>>({});
  const [analizando, setAnalizando] = useState(false);
  const [respaldado, setRespaldado] = useState(false);
  const [aplicando,  setAplicando]  = useState(false);
  const [progreso,   setProgreso]   = useState('');
  const [resultado,  setResultado]  = useState<ResultadoMigracion | null>(null);

  // Solo cuentas de detalle (aceptan movimientos) como destino
  const destinos = useMemo(
    () => PLAN_CUENTAS_SUPERCIAS.filter(c => c.aceptaMovimientos),
    []
  );
  const nombreDestino = (codigo: string) => PLAN_CUENTAS_SUPERCIAS.find(c => c.codigo === codigo)?.nombre ?? '';

  if (!hasRole(['admin'])) {
    return <p className="p-6 text-sm text-slate-500">Solo un administrador puede migrar el plan de cuentas.</p>;
  }

  const destinoDe = (codigo: string, sugerido: string | null) => manuales[codigo] ?? sugerido ?? '';
  const sinDestino = analisis?.usos.filter(u => !destinoDe(u.codigo, u.destino)) ?? [];

  const handleAnalizar = async () => {
    setAnalizando(true);
    setResultado(null);
    setRespaldado(false);
    try {
      setAnalisis(await analizarMigracion());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo analizar el plan actual');
    } finally {
      setAnalizando(false);
    }
  };

  const handleRespaldo = async () => {
    try {
      const json = await generarRespaldo();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `respaldo-contable-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setRespaldado(true);
      toast.success('Respaldo descargado. Guárdalo antes de aplicar la migración.');
    } catch {
      toast.error('No se pudo generar el respaldo');
    }
  };

  const handleAplicar = async () => {
    if (!analisis) return;
    if (!window.confirm(
      'Se reescribirán las cuentas de TODOS los asientos (incluidos períodos cerrados), la configuración contable ' +
      'y los vínculos de bancos, activos, proveedores y clientes. ¿Continuar?'
    )) return;
    const mapa: Record<string, string> = {};
    analisis.usos.forEach(u => { mapa[u.codigo] = destinoDe(u.codigo, u.destino); });
    setAplicando(true);
    try {
      setResultado(await aplicarMigracion(mapa, setProgreso));
      toast.success('Migración terminada');
      setAnalisis(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al migrar. Puedes volver a ejecutarla: lo ya migrado no se repite.');
    } finally {
      setAplicando(false);
      setProgreso('');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Migrar al plan de la Supercias"
        description="Pasa el plan de cuentas y todos los asientos al plan oficial de la Superintendencia de Compañías"
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
        <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Antes de empezar</p>
        <p>
          Esta operación modifica los asientos ya registrados (solo cambia la cuenta, no los montos). Descarga el
          respaldo y ejecútala fuera del horario de trabajo, sin otros usuarios registrando operaciones.
        </p>
      </div>

      <Button onClick={handleAnalizar} disabled={analizando || aplicando}>
        <Search className="mr-2 h-4 w-4" /> {analizando ? 'Analizando…' : 'Analizar plan actual'}
      </Button>

      {resultado && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900 space-y-1">
          <p className="font-medium">Migración completada</p>
          <p>{resultado.cuentasCreadas} cuentas creadas · {resultado.asientosActualizados} asientos actualizados ·
            {' '}{resultado.otrosActualizados} vínculos actualizados · {resultado.cuentasDesactivadas} cuentas anteriores desactivadas.</p>
          <p>Revisa Balance de Comprobación y Balance General para confirmar que todo cuadra.</p>
        </div>
      )}

      {analisis && (
        <div className="space-y-4">
          {analisis.yaMigrado ? (
            <p className="text-sm font-medium text-green-700">
              El sistema ya usa el plan de la Supercias. No hay nada que migrar.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                {analisis.asientosAfectados} de {analisis.totalAsientos} asientos usan cuentas del plan anterior
                {analisis.asientosCerrados > 0 && ` (${analisis.asientosCerrados} están en períodos cerrados)`}.
                Revisa la equivalencia de cada cuenta; las marcadas en rojo necesitan que elijas el destino.
              </p>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta anterior</TableHead>
                    <TableHead className="text-right">Usos</TableHead>
                    <TableHead>Cuenta Supercias</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analisis.usos.map(u => {
                    const dest = destinoDe(u.codigo, u.destino);
                    return (
                      <TableRow key={u.codigo}>
                        <TableCell>
                          <span className="font-mono text-xs">{u.codigo}</span>{' '}
                          <span className="text-sm">{u.nombre}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs text-slate-500">
                          {u.lineas} líneas · {u.otros} vínculos
                        </TableCell>
                        <TableCell className="min-w-[320px]">
                          <CuentaCombobox value={dest} placeholder="Elegir cuenta destino…"
                            onChange={v => setManuales(m => ({ ...m, [u.codigo]: v }))}
                            opciones={destinos.map(c => ({ value: c.codigo, label: `${c.codigo} – ${c.nombre}` }))} />
                          {dest && !manuales[u.codigo] && (
                            <p className="mt-1 text-[11px] text-slate-400">{nombreDestino(dest)}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {sinDestino.length > 0 && (
                <Badge variant="destructive">{sinDestino.length} cuenta(s) sin destino</Badge>
              )}

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleRespaldo} disabled={aplicando}>
                  <Download className="mr-2 h-4 w-4" /> 1. Descargar respaldo
                </Button>
                <Button onClick={handleAplicar} disabled={!respaldado || sinDestino.length > 0 || aplicando}>
                  <Play className="mr-2 h-4 w-4" /> {aplicando ? 'Migrando…' : '2. Aplicar migración'}
                </Button>
              </div>
              {aplicando && <p className="text-sm text-slate-500">{progreso}</p>}
              {!respaldado && <p className="text-xs text-slate-400">Descarga el respaldo para habilitar la migración.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
