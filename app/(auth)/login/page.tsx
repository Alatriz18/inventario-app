'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/AuthContext';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast }    from 'sonner';
import { Loader2, PackageCheck } from 'lucide-react';

const loginSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const router                    = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  // ← Redirige SOLO cuando el user ya está seteado en el contexto
  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  const onSubmit = async (data: LoginForm) => {
    setSubmitting(true);
    try {
      await signIn(data.email, data.password);
      // No hacemos router.push aquí — el useEffect lo maneja
    } catch (err: any) {
      const msg =
        err.code === 'auth/invalid-credential'
          ? 'Credenciales incorrectas'
          : 'Error al iniciar sesión. Intenta de nuevo.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Si ya está autenticado, no mostrar el login
  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="bg-slate-900 text-white p-3 rounded-xl">
            <PackageCheck className="h-8 w-8" />
          </div>
          <p className="text-slate-500 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">

        <div className="flex flex-col items-center gap-2">
          <div className="bg-slate-900 text-white p-3 rounded-xl">
            <PackageCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">InventaPro</h1>
          <p className="text-sm text-slate-500 text-center">
            Sistema de Inventario, Ventas y Facturación SRI
          </p>
        </div>

        <Card className="shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Iniciar sesión</CardTitle>
            <CardDescription>Ingresa tus credenciales para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="usuario@empresa.com"
                  autoComplete="email"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit(onSubmit)()}
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit(onSubmit)()}
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={submitting}
                onClick={handleSubmit(onSubmit)}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Ingresar'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400">
          Contacta al administrador si no tienes acceso.
        </p>
      </div>
    </div>
  );
}