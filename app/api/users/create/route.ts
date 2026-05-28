import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { nombre, email, password, rol } = await req.json();

    if (!nombre || !email || !password || !rol) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const adminDb   = getAdminDb();

    // 1. Crear en Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: nombre,
    });

    // 2. Crear perfil en Firestore
    await adminDb.collection('users').doc(userRecord.uid).set({
      nombre,
      email,
      rol,
      activo:    true,
      createdAt: new Date(),
    });

    return NextResponse.json({ uid: userRecord.uid }, { status: 201 });
  } catch (err: any) {
    const msg = err.code === 'auth/email-already-exists'
      ? 'El email ya está registrado'
      : err.message ?? 'Error al crear usuario';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}