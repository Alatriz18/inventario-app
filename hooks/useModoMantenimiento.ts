'use client';

import { useEffect, useState } from 'react';

const CLAVE = 'modoMantenimiento';

/**
 * Las herramientas de reparación y corrección (reparar asientos, reclasificar, corregir fechas…)
 * no se muestran en el uso diario. Se activan agregando ?mantenimiento=1 a la dirección de
 * cualquier pantalla y se mantienen en esa pestaña; ?mantenimiento=0 las vuelve a ocultar.
 */
export function useModoMantenimiento(): boolean {
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('mantenimiento');
      if (param === '1') sessionStorage.setItem(CLAVE, '1');
      if (param === '0') sessionStorage.removeItem(CLAVE);
      setActivo(sessionStorage.getItem(CLAVE) === '1');
    } catch {
      setActivo(false);
    }
  }, []);

  return activo;
}
