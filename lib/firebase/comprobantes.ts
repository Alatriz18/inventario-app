import {
  collection, doc, addDoc, updateDoc, onSnapshot,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export type TipoComp   = 'factura' | 'nota_venta' | 'nota_credito' | 'nota_debito' | 'retencion' | 'liquidacion' | 'guia';
export type EstadoComp = 'pendiente' | 'firmado' | 'enviado' | 'autorizado' | 'rechazado' | 'anulado';

export interface Comprobante {
  id:                   string;
  tipo:                 TipoComp;
  ventaId?:             string;
  claveAcceso:          string;
  secuencial:           string;
  serie:                string;
  fechaEmision:         Date;
  clienteNombre:        string;
  clienteIdentificacion:string;
  subtotal:             number;
  iva:                  number;
  total:                number;
  estado:               EstadoComp;
  numeroAutorizacion?:  string;
  fechaAutorizacion?:   string;
  xmlFirmadoB64?:       string;
  xmlAutorizado?:       string;
  rideUrl?:             string;
  emailEnviado:         boolean;
  mensajesSRI:          string[];
  usuarioId:            string;
  usuarioNombre:        string;
  createdAt:            Date;
}

const COL = 'comprobantes';

export function subscribeToComprobantes(
  callback: (data: Comprobante[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comprobante)));
  });
}

export async function createComprobante(
  data: Omit<Comprobante, 'id'>
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateComprobante(
  id: string,
  data: Partial<Omit<Comprobante, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, COL, id), data);
}