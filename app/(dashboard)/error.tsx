'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Pantalla de error de las páginas del sistema: en vez del mensaje genérico del navegador muestra qué falló,
 * para poder avisarlo, y permite reintentar sin perder la sesión.
 */
export default function ErrorDashboard({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Error en la pantalla:', error);
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-xl rounded-xl border bg-white p-6 text-center space-y-3">
      <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
      <h2 className="text-lg font-semibold text-slate-800">Esta pantalla tuvo un problema</h2>
      <p className="text-sm text-slate-500">
        No se perdió nada de lo guardado. Intenta de nuevo; si vuelve a pasar, envía una captura de este mensaje.
      </p>
      <p className="rounded-md bg-slate-50 p-2 text-left font-mono text-[11px] text-slate-600 break-words">
        {error.message || 'Error desconocido'}{error.digest ? ` · ${error.digest}` : ''}
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Link href="/"><Button variant="outline">Ir al inicio</Button></Link>
      </div>
    </div>
  );
}
