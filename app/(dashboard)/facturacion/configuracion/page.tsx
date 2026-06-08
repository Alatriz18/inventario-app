'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Settings, Upload, Eye, EyeOff, Save,
  ShieldCheck, ShieldAlert, Loader2, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { Badge }  from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { getConfigSRI, saveConfigSRI } from '@/lib/firebase/config-sri';

interface InfoCertificado {
  valido:         boolean;
  titular?:       string;
  organizacion?:  string;
  emisor?:        string;
  validoDesde?:   string;
  validoHasta?:   string;
  diasRestantes?: number;
  vencido?:       boolean;
  expiraPronto?:  boolean;
  error?:         string;
}

const schema = z.object({
  ruc:                   z.string().length(13, 'El RUC debe tener 13 dígitos'),
  razonSocial:           z.string().min(1, 'Requerido'),
  nombreComercial:       z.string().optional(),
  direccionMatriz:       z.string().min(1, 'Requerido'),
  establecimiento:       z.string().length(3, 'Debe tener 3 dígitos'),
  puntoEmision:          z.string().length(3, 'Debe tener 3 dígitos'),
  ambiente:              z.enum(['1', '2']),
  certificadoPassword:   z.string().min(1, 'Requerido'),
  contribuyenteEspecial: z.string().optional(),
  obligadoContabilidad:  z.enum(['SI', 'NO']),
});

type ConfigForm = z.infer<typeof schema>;

export default function ConfiguracionSRIPage() {
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [verificando,   setVerificando]   = useState(false);
  const [showPassword,  setShowPassword]  = useState(false);
  const [p12Base64,     setP12Base64]     = useState('');
  const [p12Nombre,     setP12Nombre]     = useState('');
  const [tieneCert,     setTieneCert]     = useState(false);
  const [infoCert,      setInfoCert]      = useState<InfoCertificado | null>(null);

  const { register, handleSubmit, reset, setValue, getValues, formState: { errors } } =
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
    setInfoCert(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = (ev.target?.result as string).split(',')[1];
      setP12Base64(b64);
      setTieneCert(true);
      toast.success('Certificado cargado — ingresa la contraseña y haz clic en Verificar');
    };
    reader.readAsDataURL(file);
  };

  const verificarCertificado = async () => {
    if (!p12Base64) { toast.error('Primero carga el archivo .p12'); return; }
    const password = getValues('certificadoPassword');
    if (!password)  { toast.error('Ingresa la contraseña del certificado'); return; }

    setVerificando(true);
    setInfoCert(null);
    try {
      const res = await fetch('/api/sri/test-firma', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ p12Base64, password }),
      });
      const data: InfoCertificado = await res.json();
      setInfoCert(data);
      if (data.valido) {
        toast.success('Certificado válido y listo para firmar comprobantes SRI');
      } else {
        toast.error(data.error ?? 'Certificado inválido');
      }
    } catch {
      toast.error('Error al verificar el certificado');
    } finally {
      setVerificando(false);
    }
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

  const fmtFecha = (iso?: string) => {
    if (!iso) return '—';
    try { return format(new Date(iso), 'dd MMM yyyy', { locale: es }); } catch { return iso; }
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

        {/* Establecimiento y ambiente */}
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
                  <SelectItem value="1">Pruebas (Certificación)</SelectItem>
                  <SelectItem value="2">Producción</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            Inicia siempre en ambiente de <strong>Pruebas</strong> hasta validar todos los comprobantes con el SRI antes de pasar a Producción.
          </div>
        </div>

        {/* Certificado digital */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold text-slate-700">Certificado Digital (.p12)</h3>

          {/* Upload */}
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
                <Badge className="bg-green-600">Certificado cargado</Badge>
                {p12Nombre && <span className="text-xs text-slate-400">{p12Nombre}</span>}
              </div>
            )}
          </div>

          {/* Contraseña */}
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

          {/* Botón verificar */}
          <Button
            type="button"
            variant="outline"
            onClick={verificarCertificado}
            disabled={verificando || !tieneCert}
            className="w-full"
          >
            {verificando
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando certificado...</>
              : <><ShieldCheck className="mr-2 h-4 w-4" />Verificar Firma Digital</>
            }
          </Button>

          {/* Resultado de verificación */}
          {infoCert && (
            <div className={`rounded-lg border p-4 space-y-3 ${
              infoCert.valido
                ? infoCert.vencido
                  ? 'bg-red-50 border-red-200'
                  : infoCert.expiraPronto
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              {infoCert.valido ? (
                <>
                  <div className="flex items-center gap-2">
                    {infoCert.vencido
                      ? <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                      : infoCert.expiraPronto
                        ? <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                        : <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    }
                    <span className={`font-semibold text-sm ${
                      infoCert.vencido ? 'text-red-700' : infoCert.expiraPronto ? 'text-amber-700' : 'text-green-700'
                    }`}>
                      {infoCert.vencido
                        ? 'Certificado VENCIDO — no puede firmar comprobantes'
                        : infoCert.expiraPronto
                          ? `Certificado válido — vence en ${infoCert.diasRestantes} días`
                          : `Certificado válido — firma digital OK`
                      }
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500 font-medium">Titular</p>
                      <p className="text-slate-800">{infoCert.titular || '—'}</p>
                    </div>
                    {infoCert.organizacion && infoCert.organizacion !== infoCert.titular && (
                      <div>
                        <p className="text-slate-500 font-medium">Organización</p>
                        <p className="text-slate-800">{infoCert.organizacion}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-slate-500 font-medium">Emisor</p>
                      <p className="text-slate-800">{infoCert.emisor || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium">Válido desde</p>
                      <p className="text-slate-800">{fmtFecha(infoCert.validoDesde)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 font-medium">Válido hasta</p>
                      <p className={`font-semibold ${infoCert.vencido ? 'text-red-700' : infoCert.expiraPronto ? 'text-amber-700' : 'text-slate-800'}`}>
                        {fmtFecha(infoCert.validoHasta)}
                        {infoCert.diasRestantes !== undefined && infoCert.diasRestantes >= 0
                          ? ` (${infoCert.diasRestantes} días)`
                          : ''}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                  <span className="text-sm font-semibold text-red-700">{infoCert.error}</span>
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-slate-400 space-y-1">
            <p>El certificado es emitido por el Banco Central del Ecuador (BCE) o entidades autorizadas.</p>
            <p>Se almacena en tu base de datos Firestore y se usa para firmar cada comprobante electrónico.</p>
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
