'use client';

import { BarChart3, Construction } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

export default function EstadoResultadosPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Estado de Resultados"
        description="Pérdidas y ganancias del período contable"
      />
      <div className="mt-8 flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-xl border border-dashed">
        <Construction className="h-12 w-12 mb-4 opacity-40" />
        <p className="font-medium text-slate-500">En construcción</p>
        <p className="text-sm mt-1">Este reporte estará disponible próximamente.</p>
      </div>
    </div>
  );
}
