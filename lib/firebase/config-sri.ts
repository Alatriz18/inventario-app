import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export interface ConfigSRI {
  ruc:             string;
  razonSocial:     string;
  nombreComercial?: string;
  direccionMatriz: string;
  establecimiento: string;
  puntoEmision:    string;
  ambiente:        '1' | '2';
  certificadoP12:       string;
  certificadoPassword:  string;
  secuencialFactura:    number;
  secuencialNotaVenta:  number;
  secuencialRetencion:  number;
  secuencialNotaCredito:number;
  secuencialNotaDebito: number;
  secuencialLiquidacion:number;
  secuencialGuia:       number;
  contribuyenteEspecial?: string;
  obligadoContabilidad:   'SI' | 'NO';
  regimenMicroempresa?:   boolean;
  agenteRetencion?:       boolean;
}

const DOC_ID = 'config';

export async function getConfigSRI(): Promise<ConfigSRI | null> {
  const snap = await getDoc(doc(db, 'config_sri', DOC_ID));
  return snap.exists() ? (snap.data() as ConfigSRI) : null;
}

export async function saveConfigSRI(config: ConfigSRI): Promise<void> {
  await setDoc(doc(db, 'config_sri', DOC_ID), config);
}

export async function incrementarSecuencial(
  tipo: keyof Pick<ConfigSRI,
    'secuencialFactura' | 'secuencialNotaVenta' | 'secuencialRetencion' |
    'secuencialNotaCredito' | 'secuencialNotaDebito' |
    'secuencialLiquidacion' | 'secuencialGuia'>
): Promise<number> {
  const configRef = doc(db, 'config_sri', DOC_ID);
  const snap      = await getDoc(configRef);
  if (!snap.exists()) throw new Error('Configuración SRI no encontrada. Ve a Facturación → Configuración primero.');
  const current = (snap.data() as ConfigSRI)[tipo] ?? 1;
  await setDoc(configRef, { [tipo]: current + 1 }, { merge: true });
  return current;
}