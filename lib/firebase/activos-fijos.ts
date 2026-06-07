import {
  collection, doc, onSnapshot, query, orderBy,
  serverTimestamp, addDoc, updateDoc, getDoc,
  QueryDocumentSnapshot, DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { ActivoFijo, CuotaDepreciacion, MetodoDepreciacion } from '@/types';

const COL = 'activos_fijos';

export function subscribeToActivosFijos(
  callback: (data: ActivoFijo[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('fechaAdquisicion', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
        id: d.id,
        ...d.data(),
      } as ActivoFijo))
    );
  });
}

export async function getActivoFijoById(id: string): Promise<ActivoFijo | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ActivoFijo;
}

export async function createActivoFijo(
  data: Omit<ActivoFijo, 'id' | 'createdAt' | 'updatedAt' | 'cuotas' | 'depreciacionAcumulada' | 'valorLibros'>
): Promise<string> {
  const cuotas = generarCuotas(data);
  const ref = await addDoc(collection(db, COL), {
    ...data,
    cuotas,
    depreciacionAcumulada: 0,
    valorLibros:           data.valorAdquisicion,
    createdAt:             serverTimestamp(),
    updatedAt:             serverTimestamp(),
  });
  return ref.id;
}

export async function updateActivoFijo(
  id:   string,
  data: Partial<Omit<ActivoFijo, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...data as Record<string, unknown>,
    updatedAt: serverTimestamp(),
  });
}

export async function registrarDepreciacionMensual(
  activoId: string,
  anio:     number,
  mes:      number,
  asientoId:string
): Promise<void> {
  const snap = await getDoc(doc(db, COL, activoId));
  if (!snap.exists()) throw new Error('Activo no encontrado');
  const activo = snap.data() as ActivoFijo;

  const cuotas = activo.cuotas.map(c => {
    if (c.anio === anio && c.mes === mes) {
      return { ...c, registrado: true, asientoId };
    }
    return c;
  });

  const cuotaMes = activo.cuotas.find(c => c.anio === anio && c.mes === mes);
  const depAcumulada = (activo.depreciacionAcumulada ?? 0) + (cuotaMes?.cuota ?? 0);
  const valorLibros  = activo.valorAdquisicion - depAcumulada;

  await updateDoc(doc(db, COL, activoId), {
    cuotas,
    depreciacionAcumulada: depAcumulada,
    valorLibros,
    updatedAt:             serverTimestamp(),
  });
}

// ── Generador de tabla de depreciación ──────────────────────────────────────

export function generarCuotas(
  data: Pick<ActivoFijo, 'valorAdquisicion' | 'valorResidual' | 'vidaUtilAnios' | 'metodoDepreciacion' | 'fechaAdquisicion' | 'tasaDepreciacion'>
): CuotaDepreciacion[] {
  const { valorAdquisicion, valorResidual, vidaUtilAnios, metodoDepreciacion, fechaAdquisicion } = data;
  const base      = valorAdquisicion - valorResidual;
  const totalMeses= vidaUtilAnios * 12;
  const cuotas: CuotaDepreciacion[] = [];

  const inicio = (fechaAdquisicion as any)?.toDate?.() ?? new Date(fechaAdquisicion);
  let anio  = inicio.getFullYear();
  let mes   = inicio.getMonth() + 1; // 1-12
  let depAcum = 0;

  for (let i = 0; i < totalMeses; i++) {
    let cuota = 0;
    if (metodoDepreciacion === 'linea_recta') {
      cuota = base / totalMeses;
    } else if (metodoDepreciacion === 'saldo_decreciente') {
      const tasa = data.tasaDepreciacion / 100 / 12;
      cuota = (valorAdquisicion - depAcum) * tasa;
    }
    cuota      = parseFloat(cuota.toFixed(2));
    depAcum   += cuota;
    const valLib = parseFloat((valorAdquisicion - depAcum).toFixed(2));

    cuotas.push({
      id:           `${anio}-${String(mes).padStart(2,'0')}`,
      anio,
      mes,
      cuota,
      depAcumulada: parseFloat(depAcum.toFixed(2)),
      valorLibros:  valLib < 0 ? 0 : valLib,
      registrado:   false,
    });

    mes++;
    if (mes > 12) { mes = 1; anio++; }
  }

  return cuotas;
}
