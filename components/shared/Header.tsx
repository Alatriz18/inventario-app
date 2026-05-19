'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, User, ChevronDown } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  admin:      'Administrador',
  vendedor:   'Vendedor',
  bodeguero:  'Bodeguero',
  contador:   'Contador',
};

const ROLE_COLORS: Record<string, string> = {
  admin:     'bg-purple-100 text-purple-700',
  vendedor:  'bg-blue-100 text-blue-700',
  bodeguero: 'bg-green-100 text-green-700',
  contador:  'bg-orange-100 text-orange-700',
};

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export default function Header() {
  const { user, signOut } = useAuth();
  const router            = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (!user) return null;

  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0">
      <div />

      <div className="flex items-center gap-3">
        {/* Role badge */}
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            ROLE_COLORS[user.rol] ?? 'bg-slate-100 text-slate-700'
          }`}
        >
          {ROLE_LABELS[user.rol] ?? user.rol}
        </span>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-slate-900 text-white text-xs">
                  {initials(user.nombre)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium max-w-[120px] truncate">
                {user.nombre}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <p className="font-medium text-sm truncate">{user.nombre}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-600 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}