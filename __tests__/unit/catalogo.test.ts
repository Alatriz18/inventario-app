// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firestore simulado: registra cada consulta escuchada (completa o de cambios) y la caché local
interface Escucha { tipo: 'completa' | 'cambios'; next: (s: unknown) => void; cerrada: boolean }

const { TS, escuchas, estadoCache, snapDoc } = vi.hoisted(() => {
  class TS { constructor(public ms: number) {} toMillis() { return this.ms; } static fromMillis(ms: number) { return new TS(ms); } }
  return {
    TS,
    escuchas: [] as Escucha[],
    estadoCache: { docs: [] as Array<{ id: string; data: Record<string, unknown> }> },
    snapDoc: (d: { id: string; data: Record<string, unknown> }) => ({ id: d.id, data: () => d.data }),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, nombre: string) => ({ nombre }),
  query: (col: { nombre: string }, ...partes: Array<{ tipo: string }>) =>
    ({ col: col.nombre, tipo: partes.some(p => p?.tipo === 'where') ? 'cambios' : 'completa' }),
  where: () => ({ tipo: 'where' }),
  orderBy: () => ({ tipo: 'orderBy' }),
  limit: () => ({ tipo: 'limit' }),
  Timestamp: TS,
  getDocsFromCache: vi.fn(async () => ({ size: estadoCache.docs.length, docs: estadoCache.docs.map(snapDoc) })),
  onSnapshot: vi.fn((q: { tipo: 'completa' | 'cambios' }, next: (s: unknown) => void) => {
    const e: Escucha = { tipo: q.tipo, next, cerrada: false };
    escuchas.push(e);
    return () => { e.cerrada = true; };
  }),
}));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn() }));
vi.mock('@/lib/firebase/config', () => ({ auth: {}, db: {} }));
vi.mock('../../lib/firebase/config', () => ({ auth: {}, db: {} }));

import { suscribirCatalogo } from '@/lib/firebase/catalogo';
import { diaLocal } from '@/lib/firebase/catalogo-marca';

const fuente = (coleccion: string) => ({ coleccion, ordenarPor: 'nombre', limite: 3000 });
const esperar = () => new Promise(r => setTimeout(r, 0));
const claveMarca = (c: string) => `catalogo:${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ''}:${c}`;

beforeEach(() => {
  escuchas.length = 0;
  estadoCache.docs = [];
  localStorage.clear();
});

describe('catálogo con caché y cambios', () => {
  it('la primera vez del día carga todo y guarda la marca', async () => {
    const recibido = vi.fn();
    suscribirCatalogo(fuente('prod_a'), recibido);
    await esperar();
    expect(escuchas.map(e => e.tipo)).toEqual(['completa']);

    escuchas[0].next({
      metadata: { fromCache: false },
      size: 2,
      docs: [snapDoc({ id: '2', data: { nombre: 'B', updatedAt: new TS(500) } }), snapDoc({ id: '1', data: { nombre: 'A', updatedAt: new TS(900) } })],
    });
    expect(recibido).toHaveBeenLastCalledWith([{ id: '1', nombre: 'A', updatedAt: new TS(900) }, { id: '2', nombre: 'B', updatedAt: new TS(500) }]);
    expect(JSON.parse(localStorage.getItem(claveMarca('prod_a'))!)).toEqual({ v: 1, dia: diaLocal(), hasta: 900, n: 2 });
  });

  it('con marca de hoy y caché completa NO abre la consulta completa: solo los cambios', async () => {
    localStorage.setItem(claveMarca('prod_b'), JSON.stringify({ v: 1, dia: diaLocal(), hasta: 900, n: 2 }));
    estadoCache.docs = [{ id: '1', data: { nombre: 'A', stockActual: 5 } }, { id: '2', data: { nombre: 'B', stockActual: 3 } }];
    const recibido = vi.fn();
    suscribirCatalogo(fuente('prod_b'), recibido);
    await esperar();

    expect(escuchas.map(e => e.tipo)).toEqual(['cambios']);            // cero lecturas del catálogo completo
    expect(recibido).toHaveBeenCalledWith([{ id: '1', nombre: 'A', stockActual: 5 }, { id: '2', nombre: 'B', stockActual: 3 }]);

    // Llega un cambio de stock y un producto nuevo
    escuchas[0].next({ docChanges: () => [
      { type: 'modified', doc: snapDoc({ id: '1', data: { nombre: 'A', stockActual: 4, updatedAt: new TS(1500) } }) },
      { type: 'added',    doc: snapDoc({ id: '3', data: { nombre: 'C', stockActual: 9, updatedAt: new TS(1600) } }) },
    ] });
    const ultimo = recibido.mock.lastCall![0] as Array<{ id: string; stockActual: number }>;
    expect(ultimo.map(p => [p.id, p.stockActual])).toEqual([['1', 4], ['2', 3], ['3', 9]]);
    expect(JSON.parse(localStorage.getItem(claveMarca('prod_b'))!)).toMatchObject({ hasta: 1600, n: 3 });
  });

  it('si la caché está incompleta o la marca es de otro día, carga todo', async () => {
    localStorage.setItem(claveMarca('prod_c'), JSON.stringify({ v: 1, dia: diaLocal(), hasta: 900, n: 50 }));
    estadoCache.docs = [{ id: '1', data: { nombre: 'A' } }];
    suscribirCatalogo(fuente('prod_c'), vi.fn());
    await esperar();
    expect(escuchas.map(e => e.tipo)).toEqual(['completa']);

    escuchas.length = 0;
    localStorage.setItem(claveMarca('prod_d'), JSON.stringify({ v: 1, dia: '2000-01-01', hasta: 900, n: 1 }));
    suscribirCatalogo(fuente('prod_d'), vi.fn());
    await esperar();
    expect(escuchas.map(e => e.tipo)).toEqual(['completa']);
  });

  it('varias pantallas comparten una sola escucha y quien llega después recibe los datos al instante', async () => {
    const a = vi.fn(), b = vi.fn();
    suscribirCatalogo(fuente('prod_e'), a);
    await esperar();
    escuchas[0].next({ metadata: { fromCache: false }, size: 1, docs: [snapDoc({ id: '1', data: { nombre: 'A' } })] });
    suscribirCatalogo(fuente('prod_e'), b);
    expect(escuchas).toHaveLength(1);
    expect(b).toHaveBeenCalledWith([{ id: '1', nombre: 'A' }]);
  });
});
