/**
 * Catálogos (productos, clientes) sin releerlos completos en cada apertura.
 *
 * Problema: el POS, el Dashboard y otras pantallas escuchan el catálogo entero. Cada computador,
 * cada pestaña nueva y cada recarga (F5) cobraba todos los documentos otra vez (con 3 000 productos
 * y 3 000 clientes, 6 000 lecturas por apertura del POS).
 *
 * Solución: la primera apertura del día carga todo (como antes) y guarda una marca en el navegador.
 * Las siguientes aperturas de ese día toman los documentos de la caché local de Firestore (no se
 * cobran) y solo escuchan los que cambiaron desde la marca (`updatedAt`). Si la caché está
 * incompleta o es otro día, se vuelve a cargar todo. Un documento borrado en otro computador
 * desaparece a más tardar al día siguiente (el que lo borró lo ve al instante).
 *
 * Requisito: todo lo que modifica estas colecciones debe poner `updatedAt` (ya lo hacen ventas,
 * entradas, despachos, anulaciones y las funciones de productos y clientes).
 */
import {
  collection, query, where, orderBy, limit as fsLimit, getDocsFromCache, Timestamp,
  onSnapshot as onSnapshotFirestore, type DocumentData, type QueryDocumentSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './config';
import { diaLocal, leerMarca, puedeUsarCache, desdeDelta, mayorFecha, type MarcaCatalogo } from './catalogo-marca';

export interface FuenteCatalogo {
  coleccion:  string;
  ordenarPor: string;
  limite:     number;
}

export type DocCatalogo = { id: string } & DocumentData;
type Oyente = (docs: DocCatalogo[]) => void;

/** Cuánto sigue escuchando sin pantallas que lo usen (solo cobra los cambios). */
const MANTENER_MS = 30 * 60 * 1000;

interface Estado {
  fuente:       FuenteCatalogo;
  docs:         Map<string, DocCatalogo>;
  emitido:      boolean;
  oyentes:      Set<Oyente>;
  baja?:        Unsubscribe;
  iniciando:    boolean;
  temporizador?: ReturnType<typeof setTimeout>;
}

const estados = new Map<string, Estado>();

const claveMarca = (coleccion: string) => `catalogo:${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ''}:${coleccion}`;

function leerMarcaLocal(coleccion: string): MarcaCatalogo | null {
  try { return leerMarca(localStorage.getItem(claveMarca(coleccion))); } catch { return null; }
}
function guardarMarca(coleccion: string, m: MarcaCatalogo) {
  try { localStorage.setItem(claveMarca(coleccion), JSON.stringify(m)); } catch { /* sin almacenamiento */ }
}

function millis(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis();
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as Timestamp).toMillis();
  return null;
}

const aDoc = (d: QueryDocumentSnapshot<DocumentData>): DocCatalogo => ({ id: d.id, ...d.data() });

/** Los documentos en el mismo orden que daba la consulta (orden de Firestore: por código de carácter). */
function ordenados(e: Estado): DocCatalogo[] {
  const campo = e.fuente.ordenarPor;
  return [...e.docs.values()].sort((a, b) => {
    const x = String(a[campo] ?? ''), y = String(b[campo] ?? '');
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function emitir(e: Estado) {
  const lista = ordenados(e);
  e.emitido = true;
  [...e.oyentes].forEach(o => o(lista));
}

function cerrar(e: Estado) {
  if (e.temporizador) clearTimeout(e.temporizador);
  e.baja?.();
  estados.delete(e.fuente.coleccion);
}

async function iniciar(e: Estado) {
  e.iniciando = true;
  const f = e.fuente;
  const qCompleta = query(collection(db, f.coleccion), orderBy(f.ordenarPor), fsLimit(f.limite));
  const hoy = diaLocal();
  const marca = leerMarcaLocal(f.coleccion);

  let desdeCache = false;
  if (marca && marca.dia === hoy) {
    try {
      const snap = await getDocsFromCache(qCompleta);
      if (puedeUsarCache(marca, hoy, snap.size)) {
        e.docs = new Map(snap.docs.map(d => [d.id, aDoc(d)]));
        desdeCache = true;
      }
    } catch { /* sin caché: carga completa */ }
  }
  if (!estados.has(f.coleccion)) return; // se cerró mientras se leía la caché

  if (desdeCache && marca) {
    emitir(e);
    let hasta = marca.hasta;
    const qCambios = query(collection(db, f.coleccion), where('updatedAt', '>', Timestamp.fromMillis(desdeDelta(marca))));
    e.baja = onSnapshotFirestore(qCambios, snap => {
      snap.docChanges().forEach(c => {
        if (c.type === 'removed') e.docs.delete(c.doc.id);
        else e.docs.set(c.doc.id, aDoc(c.doc));
        hasta = mayorFecha([millis(c.doc.data().updatedAt)], hasta);
      });
      guardarMarca(f.coleccion, { v: 1, dia: marca.dia, hasta, n: e.docs.size });
      emitir(e);
    }, () => { e.baja = undefined; });
  } else {
    e.baja = onSnapshotFirestore(qCompleta, snap => {
      e.docs = new Map(snap.docs.map(d => [d.id, aDoc(d)]));
      const hasta = mayorFecha(snap.docs.map(d => millis(d.data().updatedAt)));
      if (!snap.metadata.fromCache) guardarMarca(f.coleccion, { v: 1, dia: hoy, hasta, n: snap.size });
      emitir(e);
    }, () => { e.baja = undefined; });
  }
  e.iniciando = false;
}

/** Escucha un catálogo completo; lo comparten todas las pantallas de la pestaña. */
export function suscribirCatalogo(fuente: FuenteCatalogo, oyente: Oyente): () => void {
  let e = estados.get(fuente.coleccion);
  if (!e) {
    e = { fuente, docs: new Map(), emitido: false, oyentes: new Set(), iniciando: false };
    estados.set(fuente.coleccion, e);
  }
  if (e.temporizador) { clearTimeout(e.temporizador); e.temporizador = undefined; }
  e.oyentes.add(oyente);
  if (e.emitido) oyente(ordenados(e));
  if (!e.baja && !e.iniciando) void iniciar(e);

  const propio = e;
  return () => {
    propio.oyentes.delete(oyente);
    if (propio.oyentes.size === 0 && estados.get(propio.fuente.coleccion) === propio) {
      propio.temporizador = setTimeout(() => cerrar(propio), MANTENER_MS);
    }
  };
}

// Al cambiar de sesión se descarta todo lo escuchado
if (typeof window !== 'undefined') {
  let uidActual: string | null | undefined;
  onAuthStateChanged(auth, user => {
    const uid = user?.uid ?? null;
    if (uidActual !== undefined && uid !== uidActual) [...estados.values()].forEach(cerrar);
    uidActual = uid;
  });
}
