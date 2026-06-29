'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Sidebar        from '@/components/shared/Sidebar';
import Header         from '@/components/shared/Header';
import GuardPermisos  from '@/components/shared/GuardPermisos';
import { Skeleton } from '@/components/ui/skeleton';

function LoadingScreen() {
  return (
    <div className="flex h-screen">
      <div className="w-64 bg-slate-900 shrink-0 hidden lg:block" />
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b bg-white" />
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router            = useRouter();
  const pathname          = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Cerrar sidebar al navegar en móvil
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading) return <LoadingScreen />;
  if (!user)   return null;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ── Overlay móvil ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0 lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* ── Contenido principal ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <GuardPermisos>{children}</GuardPermisos>
        </main>
      </div>
    </div>
  );
}