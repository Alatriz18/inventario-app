'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { tieneAccesoRuta } from '@/lib/permisos';
import { ShieldX } from 'lucide-react';
import Link from 'next/link';

export default function GuardPermisos({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading || !user) return null;

  if (!tieneAccesoRuta(user.rol, pathname)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <ShieldX className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-700 mb-2">Acceso restringido</h2>
        <p className="text-sm text-slate-500 mb-6 max-w-md">
          Tu rol de <span className="font-semibold">{user.rol}</span> no tiene permisos
          para acceder a esta sección. Contacta al administrador si necesitas acceso.
        </p>
        <Link
          href="/"
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          Volver al Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
