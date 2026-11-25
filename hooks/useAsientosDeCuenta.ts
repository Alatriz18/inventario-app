'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AsientoContable } from '@/types';
import {
  subscribeToAsientos, subscribeToAsientosDeCuentas, subscribeToAsientosRecientes, subscribeEstadoIndiceAsientos,
  getAsientosPorIds, prepararAsientosPorCuenta, revisarAsientosRecientes, type EstadoIndiceAsientos,
} from '@/lib/firebase/asientos';
import { tocaCuentas, unirAsientos } from '@/lib/contabilidad/cuentas-codigos';

interface Opciones {
  /** Cuentas cuyos asientos se necesitan (p. ej. la del banco). */
  codigos:   string[];
  /** Asientos puntuales que también se necesitan aunque no toquen esas cuentas (p. ej. los enlazados a movimientos). */
  idsExtra?: string[];
  /** Si quien mira puede editar asientos: revisa lo reciente y deja la consulta pequeña. */
  puedeEditar?: boolean;
}

/**
 * Asientos de unas cuentas, leyendo solo esos (no toda la colección) cuando los asientos ya están
 * preparados. Mientras no lo estén, lee como antes (hasta 10 000) para no mostrar datos incompletos.
 */
export function useAsientosDeCuenta({ codigos, idsExtra = [], puedeEditar = false }: Opciones) {
  const [estado, setEstado] = useState<EstadoIndiceAsientos | null>(null);
  const [porCuenta, setPorCuenta] = useState<AsientoContable[]>([]);
  const [recientes, setRecientes] = useState<AsientoContable[]>([]);
  const [extra, setExtra] = useState<AsientoContable[]>([]);
  const [todos, setTodos] = useState<AsientoContable[]>([]);
  const [cargando, setCargando] = useState(true);
  const [preparando, setPreparando] = useState(false);
  const [progreso, setProgreso] = useState({ leidos: 0, actualizados: 0 });

  const clave = [...new Set(codigos.filter(Boolean))].sort().join('|');
  const lista = useMemo(() => (clave ? clave.split('|') : []), [clave]);

  useEffect(() => subscribeEstadoIndiceAsientos(setEstado), []);

  const estadoConocido = estado !== null;
  const listo = estado?.listo === true && lista.length <= 30;
  const desde = estado?.revisadoHasta?.getTime() ?? 0;

  // Asientos preparados: por cuenta + lo creado o editado desde la última revisión
  useEffect(() => {
    if (!listo) return;
    setCargando(true);
    return subscribeToAsientosDeCuentas(lista, d => { setPorCuenta(d); setCargando(false); }, () => setCargando(false));
  }, [listo, lista]);

  useEffect(() => {
    if (!listo) return;
    return subscribeToAsientosRecientes(new Date(desde), setRecientes);
  }, [listo, desde]);

  // Aún sin preparar: lectura de siempre
  useEffect(() => {
    if (!estadoConocido || listo) return;
    setCargando(true);
    return subscribeToAsientos(d => { setTodos(d); setCargando(false); }, 10000);
  }, [estadoConocido, listo]);

  const base = useMemo(() => {
    if (!listo) return todos;
    const recientesDeCuenta = recientes.filter(a => tocaCuentas(a, lista));
    // Una edición pudo quitar la cuenta: lo que llegó por cuenta pero ya no la toca, se descarta
    return unirAsientos(porCuenta, recientesDeCuenta).filter(a => tocaCuentas(a, lista));
  }, [listo, todos, porCuenta, recientes, lista]);

  // Los enlazados que no llegaron por cuenta (p. ej. movidos a Caja) se leen una sola vez por id
  const pedidos = useRef(new Set<string>());
  const faltantes = useMemo(() => {
    if (!listo) return [];
    const hay = new Set([...base, ...recientes, ...extra].map(a => a.id));
    return [...new Set(idsExtra.filter(id => id && !hay.has(id) && !pedidos.current.has(id)))];
  }, [listo, base, recientes, extra, idsExtra]);

  useEffect(() => {
    if (faltantes.length === 0) return;
    faltantes.forEach(id => pedidos.current.add(id));
    getAsientosPorIds(faltantes).then(d => setExtra(prev => unirAsientos(prev, d))).catch(() => {});
  }, [faltantes]);

  // Quien edita asientos guarda las cuentas en lo reciente y adelanta la marca (una vez por pantalla)
  const revisado = useRef(false);
  useEffect(() => {
    if (!listo || !puedeEditar || revisado.current || recientes.length === 0) return;
    revisado.current = true;
    revisarAsientosRecientes(recientes).catch(() => {});
  }, [listo, puedeEditar, recientes]);

  const asientos = useMemo(() => {
    if (!listo) return todos;
    const recientesEnlazados = recientes.filter(a => idsExtra.includes(a.id));
    return unirAsientos(extra, recientesEnlazados, base);
  }, [listo, todos, extra, recientes, base, idsExtra]);

  const preparar = async () => {
    setPreparando(true);
    try {
      return await prepararAsientosPorCuenta((leidos, actualizados) => setProgreso({ leidos, actualizados }));
    } finally {
      setPreparando(false);
    }
  };

  return {
    asientos,
    cargando: !estadoConocido || cargando,
    /** false: los asientos aún no están preparados y se está leyendo toda la colección. */
    preparado: listo,
    estadoConocido,
    preparar, preparando, progreso,
  };
}
