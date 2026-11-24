'use client';

/**
 * Pestañas del sistema: cada pantalla visitada queda viva (con sus datos y lo que el usuario estaba haciendo)
 * mientras su pestaña esté abierta, así que volver a ella no repite consultas a Firebase.
 * La barra de pestañas solo se muestra en computador (lg+); en celular se conservan pocas pantallas vivas.
 */
import {
  Activity, Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ErrorInfo, type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Pin, PinOff, X, ChevronsLeftRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { tieneAccesoRuta } from '@/lib/permisos';
import { cn } from '@/lib/utils';
import { REGISTRO_PAGINAS } from '@/lib/pestanas/registro';
import {
  abrirPestana, alternarFijada, cerrarNoFijadas, cerrarOtras, cerrarPestana, claveDeRuta, deserializar, serializar,
  MAX_PESTANAS_ESCRITORIO, MAX_PESTANAS_MOVIL, type Pestana,
} from '@/lib/pestanas/estado';
import { NAV, type NavItem } from '@/components/shared/Sidebar';
import { SinAcceso } from '@/components/shared/GuardPermisos';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Pantallas cuyo contenido depende de parámetros de la URL (?ventaId=…): se recrean si los parámetros cambian. */
const PANTALLAS_CON_PARAMETROS = new Set(['/facturacion/emitir', '/ventas/recibo']);

function aplanar(items: NavItem[], salida: Map<string, NavItem> = new Map()): Map<string, NavItem> {
  for (const it of items) {
    if (it.href) salida.set(it.href, it);
    if (it.children) aplanar(it.children, salida);
  }
  return salida;
}
const ITEMS_POR_RUTA = aplanar(NAV);
const tituloDeRuta = (ruta: string) => ITEMS_POR_RUTA.get(ruta)?.label
  ?? (ruta.split('/').filter(Boolean).pop() ?? 'Dashboard').replace(/-/g, ' ');

/** Si una pantalla falla, solo cae su pestaña: las demás siguen funcionando. */
class LimiteError extends Component<{ children: ReactNode; alReintentar: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Error en pestaña:', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4 gap-3">
        <h2 className="text-lg font-bold text-slate-700">Esta pantalla tuvo un problema</h2>
        <p className="text-sm text-slate-500 max-w-md">{this.state.error.message}</p>
        <button
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
          onClick={() => { this.setState({ error: null }); this.props.alReintentar(); }}
        >
          Reintentar
        </button>
      </div>
    );
  }
}

function Cargando() {
  return (
    <div className="flex items-center justify-center h-[40vh] text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

function leerGuardado(uid: string): Pestana[] {
  try { return deserializar(window.localStorage.getItem(`pestanas:${uid}`)); } catch { return []; }
}

function useEsEscritorio(): boolean {
  const [esc, setEsc] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const alCambiar = () => setEsc(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return esc;
}

/** Contenedor de una pantalla: conserva su posición de scroll aunque la pestaña quede oculta. */
function Panel({ activa, children }: { activa: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = useRef(0);
  useLayoutEffect(() => {
    if (activa && ref.current) ref.current.scrollTop = scroll.current;
  }, [activa]);
  return (
    <div
      ref={ref}
      onScroll={e => { if (activa) scroll.current = e.currentTarget.scrollTop; }}
      className="h-full overflow-y-auto p-4 md:p-6"
    >
      {children}
    </div>
  );
}

export default function PestanasHost({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const escritorio = useEsEscritorio();
  const uid = user?.uid ?? '';
  const max = escritorio ? MAX_PESTANAS_ESCRITORIO : MAX_PESTANAS_MOVIL;

  const enRegistro = pathname in REGISTRO_PAGINAS;
  const clave = claveDeRuta(pathname, search ? `?${search}` : '');

  const [tabs, setTabs] = useState<Pestana[]>(() => leerGuardado(uid));
  const [montadas, setMontadas] = useState<string[]>([]);   // pestañas visitadas en esta sesión (solo esas cargan datos)
  const [versiones, setVersiones] = useState<Record<string, string>>({});
  const [ultima, setUltima] = useState('');
  const [reintentos, setReintentos] = useState<Record<string, number>>({});

  // Al navegar (menú lateral, enlaces, botón atrás): abre la pestaña si no existe. Se resuelve durante el render
  // para que la pantalla no parpadee ni se monte dos veces.
  if (enRegistro && ultima !== clave) {
    setUltima(clave);
    setTabs(l => abrirPestana(l, { clave, ruta: clave, titulo: tituloDeRuta(pathname) }, clave, max));
    setMontadas(m => (m.includes(clave) ? m : [...m, clave]));
  }
  if (enRegistro && PANTALLAS_CON_PARAMETROS.has(pathname) && versiones[clave] !== search) {
    setVersiones(v => ({ ...v, [clave]: search }));
  }

  // Guarda las pestañas para conservarlas al recargar.
  useEffect(() => {
    if (!uid) return;
    try { window.localStorage.setItem(`pestanas:${uid}`, serializar(tabs)); } catch { /* sin almacenamiento: se sigue igual */ }
  }, [tabs, uid]);

  // Las pestañas que se cerraron por el límite dejan de estar montadas.
  const clavesAbiertas = useMemo(() => new Set(tabs.map(t => t.clave)), [tabs]);
  const aMostrar = montadas.filter(k => clavesAbiertas.has(k));

  const ir = useCallback((t: Pestana) => router.push(t.ruta), [router]);

  const cerrar = (c: string) => {
    const r = cerrarPestana(tabs, c, clave);
    setTabs(r.lista);
    setMontadas(m => m.filter(k => k !== c));
    if (c === clave) router.push(r.destino?.ruta ?? '/');
  };
  const cerrarLasOtras = (c: string) => {
    const lista = cerrarOtras(tabs, c);
    setTabs(lista);
    setMontadas(m => m.filter(k => lista.some(t => t.clave === k)));
    if (!lista.some(t => t.clave === clave)) { const t = lista.find(x => x.clave === c); if (t) ir(t); }
  };
  const cerrarTodas = () => {
    const r = cerrarNoFijadas(tabs, clave);
    setTabs(r.lista);
    setMontadas(m => m.filter(k => r.lista.some(t => t.clave === k)));
    if (r.destino) ir(r.destino);
    else if (!r.lista.some(t => t.clave === clave)) router.push('/');
  };

  // Sin pestaña (ruta que no está en el registro: p. ej. página no encontrada): se muestra tal cual.
  if (!enRegistro) {
    return <div className="h-full overflow-y-auto p-4 md:p-6">{children}</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Barra de pestañas: solo computador */}
      <div className="hidden lg:flex items-end gap-0.5 px-3 pt-2 bg-slate-100 border-b border-slate-200 shrink-0" role="tablist">
        <div className="flex items-end gap-0.5 min-w-0 flex-1 overflow-x-auto">
          {tabs.map(t => {
            const activa = t.clave === clave;
            const Icono = ITEMS_POR_RUTA.get(t.ruta.split('?')[0])?.icon;
            return (
              <div
                key={t.clave}
                role="tab"
                aria-selected={activa}
                title={t.titulo}
                onAuxClick={e => { if (e.button === 1) { e.preventDefault(); cerrar(t.clave); } }}
                className={cn(
                  'group flex items-center gap-1.5 h-8 pl-2.5 pr-1 rounded-t-lg text-xs font-medium border border-b-0 shrink-0 select-none cursor-pointer transition-colors',
                  t.fijada ? 'max-w-[9rem]' : 'max-w-[13rem]',
                  activa ? 'bg-white text-slate-900 border-slate-200' : 'bg-slate-200/60 text-slate-500 border-transparent hover:bg-slate-200',
                )}
                onClick={() => { if (!activa) ir(t); }}
              >
                {Icono && <Icono className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{t.titulo}</span>
                <button
                  type="button"
                  aria-label={t.fijada ? 'Soltar pestaña' : 'Fijar pestaña'}
                  title={t.fijada ? 'Soltar pestaña' : 'Fijar pestaña'}
                  onClick={e => { e.stopPropagation(); setTabs(l => alternarFijada(l, t.clave)); }}
                  className={cn(
                    'p-0.5 rounded hover:bg-slate-300/70 shrink-0',
                    t.fijada ? 'text-blue-600' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                  )}
                >
                  {t.fijada ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                </button>
                {!t.fijada && (
                  <button
                    type="button"
                    aria-label="Cerrar pestaña"
                    title="Cerrar pestaña"
                    onClick={e => { e.stopPropagation(); cerrar(t.clave); }}
                    className="p-0.5 rounded hover:bg-slate-300/70 shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" title="Opciones de pestañas" className="mb-1 p-1.5 rounded hover:bg-slate-200 text-slate-500 shrink-0">
              <ChevronsLeftRight className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => cerrarLasOtras(clave)}>Cerrar las demás pestañas</DropdownMenuItem>
            <DropdownMenuItem onClick={cerrarTodas}>Cerrar todas las no fijadas</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pantallas vivas: solo la activa es visible; las demás conservan su estado y sus datos */}
      <div className="flex-1 min-h-0 relative">
        {aMostrar.map(k => {
          const t = tabs.find(x => x.clave === k);
          if (!t) return null;
          const ruta = t.ruta.split('?')[0];
          const Pantalla = REGISTRO_PAGINAS[ruta];
          if (!Pantalla || !user) return null;
          const activa = k === clave;
          return (
            <Activity key={k} mode={activa ? 'visible' : 'hidden'}>
              <div className="absolute inset-0" style={activa ? undefined : { display: 'none' }}>
                <Panel activa={activa}>
                  {tieneAccesoRuta(user.rol, ruta) ? (
                    <LimiteError alReintentar={() => setReintentos(r => ({ ...r, [k]: (r[k] ?? 0) + 1 }))}>
                      <Suspense fallback={<Cargando />}>
                        <Pantalla key={`${versiones[k] ?? ''}|${reintentos[k] ?? 0}`} />
                      </Suspense>
                    </LimiteError>
                  ) : <SinAcceso rol={user.rol} />}
                </Panel>
              </div>
            </Activity>
          );
        })}
      </div>
    </div>
  );
}
