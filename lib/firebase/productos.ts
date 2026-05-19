import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { db, storage } from './config';
import { Producto } from '@/types';

const COL = 'productos';

export function subscribeToProductos(
  callback: (data: Producto[]) => void
): () => void {
  const q = query(collection(db, COL), orderBy('nombre'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Producto)));
  });
}

export async function uploadProductoImage(
  file: File,
  productoId: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const ext      = file.name.split('.').pop();
  const storageRef = ref(storage, `productos/${productoId}.${ext}`);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}

export async function deleteProductoImage(url: string): Promise<void> {
  try {
    await deleteObject(ref(storage, url));
  } catch { /* ignora si no existe */ }
}

export async function createProducto(
  data: Omit<Producto, 'id'>,
  imageFile?: File
): Promise<string> {
  const docRef = await addDoc(collection(db, COL), {
    ...data,
    imagen: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (imageFile) {
    const url = await uploadProductoImage(imageFile, docRef.id);
    await updateDoc(docRef, { imagen: url });
  }
  return docRef.id;
}

export async function updateProducto(
  id: string,
  data: Partial<Omit<Producto, 'id'>>,
  imageFile?: File
): Promise<void> {
  let imagen = data.imagen;
  if (imageFile) {
    imagen = await uploadProductoImage(imageFile, id);
  }
  await updateDoc(doc(db, COL, id), {
    ...data,
    imagen,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProducto(id: string, imagenUrl?: string): Promise<void> {
  if (imagenUrl) await deleteProductoImage(imagenUrl);
  await deleteDoc(doc(db, COL, id));
}