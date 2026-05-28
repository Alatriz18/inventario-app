'use client';

import { Scale, Construction } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

export default function LibroMayorPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Libro Mayor"
        description="Movimientos agrupados por cuenta contable"
      />
      <div className="mt-8 flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-xl border border-dashed">
        <Construction className="h-12 w-12 mb-4 opacity-40" />
        <p className="font-medium text-slate-500">En construcción</p>
        <p className="text-sm mt-1">Este reporte estará disponible próximamente.</p>
      </div>
    </div>
  );
}
