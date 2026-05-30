'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Save, Building2, Receipt, Shield } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Separator }from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const schema = z.object({
  nombreEmpresa:   z.string().min(1, 'Requerido'),
  nombreComercial: z.string().optional(),
  ruc:             z.string().length(13, 'El RUC debe tener 13 dígitos'),
  direccion:       z.string().min(1, 'Requerido'),
  telefono:        z.string().optional(),
  email:           z.string().email('Email inválido').optional().or(z.literal('')),
  ciudad:          z.string().optional(),
  provincia:       z.string().optional(),
  tasaIVA:         z.coerce.number().min(0).max(100),
  moneda:          z.string(),
});

type ConfigForm = z.infer<typeof schema>;

export default function ConfiguracionPage() {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const { register, handleSubmit, reset, setValue, formState: { errors } } =
    useForm<ConfigForm>({
      resolver: zodResolver(schema) as any,
      defaultValues: { tasaIVA: 15, moneda: 'USD' },
    });

  useEffect(() => {
    getDoc(doc(db, 'config_empresa', 'config')).then(snap => {
      if (snap.exists()) reset(snap.data() as ConfigForm);
      setLoading(false);
    });
  }, [reset]);

  const onSubmit = async (data: ConfigForm) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config_empresa', 'config'), data);
      toast.success('Configuración guardada correctamente');
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;

  return (
    <div>
      <PageHeader
        title="Configuración General"
        description="Datos de la empresa, parámetros fiscales y preferencias del sistema"
      />

      <div className="max-w-2xl space-y-6">

        {/* Datos de la empresa */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-700">Datos de la Empresa</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Razón Social *</Label>
              <Input placeholder="Empresa S.A." {...register('nombreEmpresa')} />
              {errors.nombreEmpresa && <p className="text-xs text-red-500">{errors.nombreEmpresa.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nombre Comercial</Label>
              <Input placeholder="(opcional)" {...register('nombreComercial')} />
            </div>
            <div className="space-y-1.5">
              <Label>RUC *</Label>
              <Input placeholder="1234567890001" maxLength={13} {...register('ruc')} />
              {errors.ruc && <p className="text-xs text-red-500">{errors.ruc.message}</p>}
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Dirección *</Label>
              <Input placeholder="Av. Principal 123, Quito" {...register('direccion')} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input placeholder="02-000-0000" {...register('telefono')} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="empresa@mail.com" {...register('email')} />
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input placeholder="Quito" {...register('ciudad')} />
            </div>
            <div className="space-y-1.5">
              <Label>Provincia</Label>
              <Input placeholder="Pichincha" {...register('provincia')} />
            </div>
          </div>
        </div>

        {/* Parámetros fiscales */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-700">Parámetros Fiscales</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tasa IVA (%)</Label>
              <Input type="number" step="0.1" min="0" max="100"
                placeholder="15" {...register('tasaIVA')} />
              <p className="text-xs text-slate-400">Actualmente Ecuador usa 15%</p>
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select onValueChange={v => setValue('moneda', v)} defaultValue="USD">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">🇺🇸 USD — Dólar Americano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            ⚠️ Cambiar la tasa de IVA afecta los nuevos comprobantes. Los ya emitidos no se modifican.
            El cambio de tasa también debes actualizarlo en <strong>Facturación → Configuración SRI</strong>.
          </div>
        </div>

        {/* Seguridad */}
        <div className="bg-white rounded-xl border p-6 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-700">Información del sistema</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Versión', value: 'v1.0.0 — Sprint 7' },
              { label: 'Plan', value: 'Producción' },
              { label: 'Base de datos', value: 'Firebase Firestore' },
              { label: 'Deploy', value: 'Vercel' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="font-medium text-slate-700 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <Button className="w-full h-12" onClick={() => handleSubmit(onSubmit)()} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
      </div>
    </div>
  );
}