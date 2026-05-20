'use client';

import { useEffect, useState } from 'react';
import { useForm }  from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Settings, Upload, Eye, EyeOff, Save } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Separator}from '@/components/ui/separator';
import { Badge }   from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { getConfigSRI, saveConfigSRI, ConfigSRI } from '@/lib/firebase/config-sri';

const schema = z.object({
  ruc:                  z.string().length(13, 'El RUC debe tener 13 dígitos'),
  razonSocial:          z.string().min(1, 'Requerido'),
  nombreComercial:      z.string().optional(),
  direccionMatriz:      z.string().min(1, 'Requerido'),
  establecimiento:      z.string().length(3, 'Debe tener 3 dígitos'),
  puntoEmision:         z.string().length(3, 'Debe tener 3 dígitos'),
  ambiente:             z.enum(['1', '2']),
  certificadoPassword:  z.string().min(1, 'Requerido'),
  contribuyenteEspecial:z.string().optional(),
  obligadoContabilidad: z.enum(['SI', 'NO']),
});

type ConfigForm = z.infer<typeof schema>;

export default function ConfiguracionSRIPage() {
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [p12Base64,    setP12Base64]    = useState('');
  const [p12Nombre,    setP12Nombre]    = useState('');
  const [tieneCert,    setTieneCert]    = useState(false);

  const { register, handleSubmit, reset, setValue, formState: { errors } } =
    useForm<ConfigForm>({ resolver: zodResolver(schema) });

  useEffect(() => {
    getConfigSRI().then(cfg => {
      if (cfg) {
        reset({
          ruc:                   cfg.ruc,
          razonSocial:           cfg.razonSocial,
          nombreComercial:       cfg.nombreComercial ?? '',
          direccionMatriz:       cfg.direccionMatriz,
          establecimiento:       cfg.establecimiento,
          puntoEmision:          cfg.puntoEmision,
          ambiente:              cfg.ambiente,
          certificadoPassword:   cfg.certificadoPassword,
          contribuyenteEspecial: cfg.contribuyenteEspecial ?? '',
          obligadoContabilidad:  cfg.obligadoContabilidad,
        });
        setTieneCert(!!cfg.certificadoP12);
        if (cfg.certificadoP12) setP12Base64(cfg.certificadoP12);
      }
      setLoading(false);
    });
  }, [reset]);

  const handleP12 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setP12Nombre(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = (ev.target?.result as string).split(',')[1];
      setP12Base64(b64);
      setTieneCert(true);
      toast.success('Certificado cargado correctamente');
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (data: ConfigForm) => {
    if (!p12Base64) { toast.error('Debes cargar el certificado .p12'); return; }
    setSaving(true);
    try {
      const cfg = await getConfigSRI();
      await saveConfigSRI({
        ...data,
        certificadoP12:        p12Base64,
        secuencialFactura:     cfg?.secuencialFactura     ?? 1,
        secuencialNotaVenta:   cfg?.secuencialNotaVenta   ?? 1,
        secuencialRetencion:   cfg?.secuencialRetencion   ?? 1,
        secuencialNotaCredito: cfg?.secuencialNotaCredito ?? 1,
        secuencialNotaDebito:  cfg?.secuencialNotaDebito  ?? 1,
        secuencialLiquidacion: cfg?.secuencialLiquidacion ?? 1,
        secuencialGuia:        cfg?.secuencialGuia        ?? 1,
      });
      toast.success('Configuración guardada correctamente');
    } catch {
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando configuración...</div>;

  return (
    <div>
      <PageHeader
        title="Configuración SRI"
        description="Datos del emisor, certificado digital y parámetros de facturación electrónica"
      />

      <div className="max-w-3xl space-y-6">

        {/* Datos del emisor */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-700">Datos del Emisor</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>RUC *</Label>
              <Input placeholder="1234567890001" {...register('ruc')} />
              {errors.ruc && <p className="text-xs text-red-500">{errors.ruc.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Razón Social *</Label>
              <Input placeholder="Empresa S.A." {...register('razonSocial')} />
              {errors.razonSocial && <p className="text-xs text-red-500">{errors.razonSocial.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nombre Comercial</Label>
              <Input placeholder="(opcional)" {...register('nombreComercial')} />
            </div>
            <div className="space-y-1.5">
              <Label>Obligado a llevar contabilidad</Label>
              <Select onValueChange={v => setValue('obligadoContabilidad', v as 'SI' | 'NO')} defaultValue="NO">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NO">No</SelectItem>
                  <SelectItem value="SI">Sí</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Dirección Matriz *</Label>
              <Input placeholder="Av. Principal 123, Quito" {...register('direccionMatriz')} />
              {errors.direccionMatriz && <p className="text-xs text-red-500">{errors.direccionMatriz.message}</p>}
            </div>
          </div>
        </div>

        {/* Establecimiento */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold text-slate-700">Establecimiento y Ambiente</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Establecimiento *</Label>
              <Input placeholder="001" maxLength={3} {...register('establecimiento')} />
              {errors.establecimiento && <p className="text-xs text-red-500">{errors.establecimiento.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Punto de Emisión *</Label>
              <Input placeholder="001" maxLength={3} {...register('puntoEmision')} />
              {errors.puntoEmision && <p className="text-xs text-red-500">{errors.puntoEmision.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Ambiente SRI *</Label>
              <Select onValueChange={v => setValue('ambiente', v as '1' | '2')} defaultValue="1">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">🧪 Pruebas (Certificación)</SelectItem>
                  <SelectItem value="2">🚀 Producción</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            ⚠️ Inicia siempre en ambiente de <strong>Pruebas</strong> hasta validar todos los comprobantes con el SRI antes de pasar a Producción.
          </div>
        </div>

        {/* Certificado digital */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold text-slate-700">Certificado Digital (.p12)</h3>

          <div className="flex items-center gap-4">
            <label className="cursor-pointer">
              <input type="file" accept=".p12,.pfx" className="hidden" onChange={handleP12} />
              <div className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
                <Upload className="h-4 w-4" />
                {tieneCert ? 'Cambiar certificado' : 'Cargar certificado .p12'}
              </div>
            </label>
            {tieneCert && (
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-600">
                  ✓ Certificado cargado
                </Badge>
                {p12Nombre && <span className="text-xs text-slate-400">{p12Nombre}</span>}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Contraseña del certificado *</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...register('certificadoPassword')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.certificadoPassword && (
              <p className="text-xs text-red-500">{errors.certificadoPassword.message}</p>
            )}
          </div>

          <div className="text-xs text-slate-400 space-y-1">
            <p>• El certificado es emitido por el Banco Central del Ecuador (BCE) o entidades autorizadas.</p>
            <p>• Se almacena de forma cifrada en tu base de datos Firestore.</p>
          </div>
        </div>

        <Button
          className="w-full h-12"
          onClick={() => handleSubmit(onSubmit)()}
          disabled={saving}
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
      </div>
    </div>
  );
}