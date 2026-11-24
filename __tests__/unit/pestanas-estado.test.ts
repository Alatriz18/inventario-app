import { describe, it, expect } from 'vitest';
import {
  abrirPestana, cerrarPestana, alternarFijada, cerrarOtras, cerrarNoFijadas, serializar, deserializar,
  claveDeRuta, type Pestana,
} from '@/lib/pestanas/estado';

const p = (ruta: string, fijada = false): Pestana => ({ clave: ruta, ruta, titulo: ruta.slice(1) || 'Dashboard', fijada });
const claves = (l: Pestana[]) => l.map(x => x.clave);

describe('claveDeRuta', () => {
  it('la clave es la ruta; otros parámetros no abren pestañas nuevas', () => {
    expect(claveDeRuta('/facturacion/emitir', '?ventaId=abc&tipo=factura')).toBe('/facturacion/emitir');
    expect(claveDeRuta('/ventas/pos', '')).toBe('/ventas/pos');
  });
  it('?mantenimiento sí separa la pestaña (su valor solo se lee al abrir la pantalla)', () => {
    expect(claveDeRuta('/movimientos-bancarios', '?mantenimiento=1')).toBe('/movimientos-bancarios?mantenimiento=1');
  });
});

describe('abrirPestana', () => {
  it('agrega al final y no repite una pestaña que ya existe', () => {
    let l = abrirPestana([], { clave: '/a', ruta: '/a', titulo: 'A' }, '/a', 12);
    l = abrirPestana(l, { clave: '/b', ruta: '/b', titulo: 'B' }, '/b', 12);
    expect(claves(l)).toEqual(['/a', '/b']);
    expect(abrirPestana(l, { clave: '/a', ruta: '/a', titulo: 'A' }, '/a', 12)).toBe(l);
  });

  it('al pasarse del máximo cierra la más antigua que no esté fijada ni sea la activa', () => {
    const l = [p('/a'), p('/b'), p('/c')];
    const r = abrirPestana(l, { clave: '/d', ruta: '/d', titulo: 'D' }, '/d', 3);
    expect(claves(r)).toEqual(['/b', '/c', '/d']);
  });

  it('las fijadas y la activa no se cierran por el límite', () => {
    const l = [p('/a', true), p('/b'), p('/c')];
    const r = abrirPestana(l, { clave: '/d', ruta: '/d', titulo: 'D' }, '/b', 3);
    expect(claves(r)).toEqual(['/a', '/b', '/d']); // se fue /c: /a está fijada y /b es la activa
  });

  it('si todo está fijado no cierra nada aunque se pase del máximo', () => {
    const l = [p('/a', true), p('/b', true)];
    expect(claves(abrirPestana(l, { clave: '/c', ruta: '/c', titulo: 'C' }, '/c', 2))).toEqual(['/a', '/b', '/c']);
  });
});

describe('cerrarPestana', () => {
  it('al cerrar la activa pasa a la vecina que queda en su lugar', () => {
    const r = cerrarPestana([p('/a'), p('/b'), p('/c')], '/b', '/b');
    expect(claves(r.lista)).toEqual(['/a', '/c']);
    expect(r.destino?.clave).toBe('/c');
  });
  it('si era la última pasa a la anterior', () => {
    expect(cerrarPestana([p('/a'), p('/b')], '/b', '/b').destino?.clave).toBe('/a');
  });
  it('cerrar una pestaña que no es la activa no cambia de pantalla', () => {
    const r = cerrarPestana([p('/a'), p('/b')], '/a', '/b');
    expect(claves(r.lista)).toEqual(['/b']);
    expect(r.destino).toBeUndefined();
  });
  it('una fijada no se cierra', () => {
    const l = [p('/a', true), p('/b')];
    expect(cerrarPestana(l, '/a', '/b').lista).toBe(l);
  });
  it('al cerrar la única pestaña no hay destino', () => {
    const r = cerrarPestana([p('/a')], '/a', '/a');
    expect(r.lista).toEqual([]);
    expect(r.destino).toBeUndefined();
  });
});

describe('fijar, cerrar otras y cerrar todas', () => {
  it('fijar mueve la pestaña al grupo de la izquierda y soltar la devuelve', () => {
    const fijada = alternarFijada([p('/a'), p('/b'), p('/c')], '/c');
    expect(claves(fijada)).toEqual(['/c', '/a', '/b']);
    expect(fijada[0].fijada).toBe(true);
    expect(fijada.map(x => x.fijada)).toEqual([true, false, false]);
    const suelta = alternarFijada(fijada, '/c');
    expect(suelta.every(x => !x.fijada)).toBe(true);
  });

  it('cerrar otras conserva las fijadas y la elegida', () => {
    expect(claves(cerrarOtras([p('/a', true), p('/b'), p('/c'), p('/d')], '/c'))).toEqual(['/a', '/c']);
  });

  it('cerrar todas deja solo las fijadas y manda a la última fijada si la activa se cerró', () => {
    const r = cerrarNoFijadas([p('/a', true), p('/b'), p('/c')], '/c');
    expect(claves(r.lista)).toEqual(['/a']);
    expect(r.destino?.clave).toBe('/a');
    expect(cerrarNoFijadas([p('/a', true), p('/b')], '/a').destino).toBeUndefined(); // la activa es fijada: se queda
  });

  it('sin fijadas, cerrar todas deja vacío y sin destino', () => {
    const r = cerrarNoFijadas([p('/a'), p('/b')], '/b');
    expect(r.lista).toEqual([]);
    expect(r.destino).toBeUndefined();
  });
});

describe('guardado de las pestañas', () => {
  it('lo que se guarda se recupera igual', () => {
    const l = [p('/a', true), p('/b'), p('/c')];
    expect(deserializar(serializar(l))).toEqual(l);
  });

  it('un guardado dañado, vacío o con datos raros no rompe nada', () => {
    expect(deserializar(null)).toEqual([]);
    expect(deserializar('esto no es json')).toEqual([]);
    expect(deserializar('{"a":1}')).toEqual([]);
    expect(deserializar(JSON.stringify([null, 5, { clave: 1 }, { clave: '/ok', ruta: '/ok', titulo: 'Ok' }, { clave: 'x', ruta: 'sin-barra', titulo: 't' }])))
      .toEqual([{ clave: '/ok', ruta: '/ok', titulo: 'Ok', fijada: false }]);
  });

  it('descarta repetidas y deja las fijadas primero', () => {
    const json = JSON.stringify([
      { clave: '/a', ruta: '/a', titulo: 'A', fijada: false },
      { clave: '/a', ruta: '/a', titulo: 'A otra vez', fijada: false },
      { clave: '/b', ruta: '/b', titulo: 'B', fijada: true },
    ]);
    expect(claves(deserializar(json))).toEqual(['/b', '/a']);
  });
});
