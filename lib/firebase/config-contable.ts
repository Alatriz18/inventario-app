import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { ConfigContable } from '@/types';
import { CONFIG_CONTABLE_DEFAULT } from '@/lib/data/plan-cuentas-ecuador';

const DOC_ID = 'config';

export async function getConfigContable(): Promise<ConfigContable | null> {
  const snap = await getDoc(doc(db, 'config_contable', DOC_ID));
  return snap.exists() ? (snap.data() as ConfigContable) : null;
}

export async function saveConfigContable(config: ConfigContable): Promise<void> {
  await setDoc(doc(db, 'config_contable', DOC_ID), config);
}

export async function getOrCreateConfigContable(): Promise<ConfigContable> {
  const existing = await getConfigContable();
  if (existing) return existing;
  await saveConfigContable(CONFIG_CONTABLE_DEFAULT as ConfigContable);
  return CONFIG_CONTABLE_DEFAULT as ConfigContable;
}