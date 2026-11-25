'use client';

import { Gauge, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Props {
  preparado:      boolean;
  estadoConocido: boolean;
  puedePreparar:  boolean;
  preparando:     boolean;
  progreso:       { leidos: number; actualizados: number };
  preparar:       () => Promise<{ leidos: number; actualizados: number }>;
}

/**
 * Aviso mientras los asientos no estén preparados para consultarse por cuenta: esta pantalla lee
 * todos los asientos cada vez que se abre. Prepararlos se hace una sola vez.
 */
export default function AvisoPrepararAsientos({ preparado, estadoConocido, puedePreparar, preparando, progreso, preparar }: Props) {
  if (!estadoConocido || preparado) return null;

  const ejecutar = async () => {
    try {
      const r = await preparar();
      toast.success(`Listo: ${r.leidos} asientos revisados (${r.actualizados} actualizados). Desde ahora esta pantalla lee solo los asientos del banco.`);
    } catch (e) {
      toast.error(`No se pudo terminar: ${(e as Error).message}. Se puede volver a intentar; continúa donde quedó.`);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Gauge className="h-5 w-5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Esta pantalla está leyendo todos los asientos del sistema cada vez que se abre.</p>
        <p className="text-amber-800/90">
          Eso gasta miles de lecturas de Firebase. Preparar los asientos (una sola vez) hace que desde entonces
          se lean solo los que tocan la cuenta del banco.
          {preparando && ` Revisados ${progreso.leidos} asientos…`}
        </p>
        {!puedePreparar && <p className="mt-1 text-amber-800/90">Pídele a un administrador o contador que lo haga.</p>}
      </div>
      {puedePreparar && (
        <Button size="sm" onClick={ejecutar} disabled={preparando} className="shrink-0">
          {preparando ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Preparando…</> : 'Preparar asientos'}
        </Button>
      )}
    </div>
  );
}
