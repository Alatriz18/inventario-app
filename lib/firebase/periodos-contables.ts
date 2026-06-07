import {
  collection, doc, addDoc, updateDoc,
  onSnapshot, query, orderBy, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { PeriodoContable } from '@/types';
import { bloquearAsientosDePeriodo } from '@/lib/firebase/asientos';

const COL = 'periodos_contables';

export function subscribeToPeriodos(
  callback: (data: PeriodoContable[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('anio', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as PeriodoContable)));
  });
}

export async function createPeriodo(anio: number, mes: number): Promise<void> {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  await addDoc(collection(db, COL), {
    anio, mes,
    nombre:   `${meses[mes-1]} ${anio}`,
    estado:   'abierto',
    creadoAt: new Date(),
  });
}

/**
 * Cierra el período y bloquea todos sus asientos contables.
 * Los asientos bloqueados no se pueden editar ni eliminar.
 */
export async function cerrarPeriodo(id: string, anio: number, mes: number): Promise<void> {
  await updateDoc(doc(db, COL, id), { estado: 'cerrado' });
  // Bloquear todos los asientos del mes para evitar modificaciones
  await bloquearAsientosDePeriodo(anio, mes, true);
}

/**
 * Reabre el período y desbloquea sus asientos (solo admin).
 */
export async function abrirPeriodo(id: string, anio: number, mes: number): Promise<void> {
  await updateDoc(doc(db, COL, id), { estado: 'abierto' });
  await bloquearAsientosDePeriodo(anio, mes, false);
}

export async function getPeriodoActual(): Promise<PeriodoContable | null> {
  const snap = await getDocs(query(collection(db, COL), orderBy('anio', 'desc')));
  const periodos = snap.docs.map(d => ({ id: d.id, ...d.data() } as PeriodoContable));
  return periodos.find(p => p.estado === 'abierto') ?? null;
}
