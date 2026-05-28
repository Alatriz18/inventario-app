import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid } = await params;
    const { nombre, rol, activo, password } = await req.json();

    const adminAuth = getAdminAuth();
    const adminDb   = getAdminDb();

    const authUpdate: any = {};
    if (nombre)             authUpdate.displayName = nombre;
    if (password)           authUpdate.password    = password;
    if (activo !== undefined) authUpdate.disabled  = !activo;

    if (Object.keys(authUpdate).length > 0) {
      await adminAuth.updateUser(uid, authUpdate);
    }

    const fsUpdate: any = {};
    if (nombre !== undefined) fsUpdate.nombre = nombre;
    if (rol    !== undefined) fsUpdate.rol    = rol;
    if (activo !== undefined) fsUpdate.activo = activo;

    if (Object.keys(fsUpdate).length > 0) {
      await adminDb.collection('users').doc(uid).update(fsUpdate);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error al actualizar' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid } = await params;
    await getAdminAuth().updateUser(uid, { disabled: true });
    await getAdminDb().collection('users').doc(uid).update({ activo: false });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error al desactivar' }, { status: 400 });
  }
}