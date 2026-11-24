/**
 * onSnapshot con listeners COMPARTIDOS entre pantallas.
 *
 * Problema: cada pantalla abría su propio listener (productos, clientes, proveedores, plan de
 * cuentas…) y lo cerraba al salir; al volver a entrar Firestore cobraba otra vez la lectura de
 * TODOS los documentos. Con 3 000 productos, cada cambio de pantalla eran 3 000 lecturas.
 *
 * Solución: el listener de una misma consulta se abre una sola vez y se comparte; al salir de la
 * pantalla se mantiene abierto unos minutos (solo cobra los documentos que cambien) y quien llega
 * después recibe al instante la última foto, sin leer nada.
 *
 * Es un reemplazo directo de `onSnapshot` de firebase/firestore: mismas llamadas, mismo resultado.
 * Para referencias a documentos (no consultas) delega en el original.
 */

import {
  onSnapshot as onSnapshotFirestore, queryEqual,
  type DocumentData, type DocumentReference, type DocumentSnapshot,
  type FirestoreError, type Query, type QuerySnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config';

/** Cuánto sigue abierto un listener sin pantallas que lo usen (solo cobra los cambios). */
const MANTENER_MS = 5 * 60 * 1000;

interface Suscriptor {
  next:   (snap: QuerySnapshot<DocumentData>) => void;
  error?: (err: FirestoreError) => void;
}

interface Entrada {
  consulta:     Query<DocumentData>;
  suscriptores: Set<Suscriptor>;
  ultimo?:      QuerySnapshot<DocumentData>;
  baja:         Unsubscribe;
  temporizador?: ReturnType<typeof setTimeout>;
}

const entradas: Entrada[] = [];

function cerrar(entrada: Entrada) {
  if (entrada.temporizador) clearTimeout(entrada.temporizador);
  entrada.baja();
  const i = entradas.indexOf(entrada);
  if (i >= 0) entradas.splice(i, 1);
}

/** Cierra todos los listeners compartidos (al cambiar de usuario o de sesión). */
export function cerrarSuscripcionesCompartidas() {
  [...entradas].forEach(cerrar);
}

/** Cantidad de listeners abiertos ahora mismo (para diagnóstico). */
export function suscripcionesCompartidasAbiertas() {
  return entradas.length;
}

// Los datos de un usuario nunca se le entregan a otro: al cambiar la sesión se descarta todo.
if (typeof window !== 'undefined') {
  let uidActual: string | null | undefined;
  onAuthStateChanged(auth, user => {
    const uid = user?.uid ?? null;
    if (uidActual !== undefined && uid !== uidActual) cerrarSuscripcionesCompartidas();
    uidActual = uid;
  });
}

export function onSnapshot<T = DocumentData>(
  ref: Query<T>,
  next: (snap: QuerySnapshot<T>) => void,
  error?: (err: FirestoreError) => void
): Unsubscribe;
export function onSnapshot<T = DocumentData>(
  ref: DocumentReference<T>,
  next: (snap: DocumentSnapshot<T>) => void,
  error?: (err: FirestoreError) => void
): Unsubscribe;
export function onSnapshot(
  ref: Query<DocumentData> | DocumentReference<DocumentData>,
  next: unknown,
  error?: unknown
): Unsubscribe {
  const esConsulta = (ref.type === 'query' || ref.type === 'collection') && typeof next === 'function';
  if (!esConsulta) {
    // Documento suelto u otras formas de llamada: comportamiento original
    return (onSnapshotFirestore as (...a: unknown[]) => Unsubscribe)(ref, next, error);
  }

  const consulta = ref as Query<DocumentData>;
  const suscriptor: Suscriptor = {
    next:  next as Suscriptor['next'],
    error: typeof error === 'function' ? error as Suscriptor['error'] : undefined,
  };

  let entrada = entradas.find(e => queryEqual(e.consulta, consulta));
  if (entrada) {
    if (entrada.temporizador) { clearTimeout(entrada.temporizador); entrada.temporizador = undefined; }
    entrada.suscriptores.add(suscriptor);
    // Quien llega tarde recibe de inmediato la última foto: no se vuelve a leer nada
    if (entrada.ultimo) suscriptor.next(entrada.ultimo);
  } else {
    const nueva: Entrada = { consulta, suscriptores: new Set([suscriptor]), baja: () => {} };
    entradas.push(nueva);
    entrada = nueva;
    nueva.baja = onSnapshotFirestore(
      consulta,
      snap => {
        nueva.ultimo = snap;
        [...nueva.suscriptores].forEach(s => s.next(snap));
      },
      err => {
        // Un listener con error ya no emite más: se descarta para que el siguiente lo abra de nuevo
        const afectados = [...nueva.suscriptores];
        cerrar(nueva);
        afectados.forEach(s => s.error?.(err));
      }
    );
  }

  const propia = entrada;
  return () => {
    propia.suscriptores.delete(suscriptor);
    if (propia.suscriptores.size === 0 && entradas.includes(propia)) {
      propia.temporizador = setTimeout(() => cerrar(propia), MANTENER_MS);
    }
  };
}
