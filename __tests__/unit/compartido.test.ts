import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Firestore simulado: cada onSnapshot "real" queda registrado para poder emitir y contar aperturas
interface Escucha { id: string; next: (s: unknown) => void; error?: (e: unknown) => void; cerrada: boolean }
const escuchas: Escucha[] = [];

vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn((ref: { id: string }, next: (s: unknown) => void, error?: (e: unknown) => void) => {
    const e: Escucha = { id: ref.id, next, error, cerrada: false };
    escuchas.push(e);
    return () => { e.cerrada = true; };
  }),
  queryEqual: (a: { id: string }, b: { id: string }) => a.id === b.id,
}));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn() }));
vi.mock('@/lib/firebase/config', () => ({ auth: {} }));
vi.mock('../../lib/firebase/config', () => ({ auth: {} }));

import {
  onSnapshot, cerrarSuscripcionesCompartidas, suscripcionesCompartidasAbiertas,
} from '@/lib/firebase/compartido';

const consulta = (id: string) => ({ type: 'query', id }) as never;

beforeEach(() => { escuchas.length = 0; vi.useFakeTimers(); });
afterEach(() => { cerrarSuscripcionesCompartidas(); vi.useRealTimers(); });

describe('onSnapshot compartido', () => {
  it('abre un solo listener para la misma consulta y entrega la última foto al que llega después', () => {
    const a = vi.fn(), b = vi.fn();
    onSnapshot(consulta('productos'), a);
    escuchas[0].next({ n: 1 });
    onSnapshot(consulta('productos'), b);

    expect(escuchas).toHaveLength(1);
    expect(b).toHaveBeenCalledWith({ n: 1 });          // sin leer nada de nuevo
    escuchas[0].next({ n: 2 });
    expect(a).toHaveBeenLastCalledWith({ n: 2 });
    expect(b).toHaveBeenLastCalledWith({ n: 2 });
  });

  it('mantiene el listener abierto al salir de la pantalla y lo reutiliza si vuelven pronto', () => {
    const baja = onSnapshot(consulta('clientes'), vi.fn());
    escuchas[0].next({ n: 1 });
    baja();
    vi.advanceTimersByTime(60_000);
    expect(escuchas[0].cerrada).toBe(false);

    const volver = vi.fn();
    onSnapshot(consulta('clientes'), volver);
    expect(escuchas).toHaveLength(1);                   // no se abrió otro: cero lecturas nuevas
    expect(volver).toHaveBeenCalledWith({ n: 1 });
  });

  it('cierra el listener cuando pasa el tiempo sin nadie que lo use', () => {
    const baja = onSnapshot(consulta('bodegas'), vi.fn());
    baja();
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    expect(escuchas[0].cerrada).toBe(true);
    expect(suscripcionesCompartidasAbiertas()).toBe(0);

    onSnapshot(consulta('bodegas'), vi.fn());
    expect(escuchas).toHaveLength(2);                   // ahora sí se abre uno nuevo
  });

  it('consultas distintas no se mezclan', () => {
    onSnapshot(consulta('a'), vi.fn());
    onSnapshot(consulta('b'), vi.fn());
    expect(escuchas).toHaveLength(2);
  });

  it('si el listener falla avisa a todos y el siguiente abre uno nuevo', () => {
    const errA = vi.fn(), errB = vi.fn();
    onSnapshot(consulta('x'), vi.fn(), errA);
    onSnapshot(consulta('x'), vi.fn(), errB);
    escuchas[0].error?.(new Error('quota'));
    expect(errA).toHaveBeenCalled();
    expect(errB).toHaveBeenCalled();
    expect(suscripcionesCompartidasAbiertas()).toBe(0);

    onSnapshot(consulta('x'), vi.fn());
    expect(escuchas).toHaveLength(2);
  });

  it('una pantalla que se va no corta el listener de otra que sigue abierta', () => {
    const baja1 = onSnapshot(consulta('p'), vi.fn());
    const dos = vi.fn();
    onSnapshot(consulta('p'), dos);
    baja1();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(escuchas[0].cerrada).toBe(false);
    escuchas[0].next({ n: 9 });
    expect(dos).toHaveBeenCalledWith({ n: 9 });
  });
});
