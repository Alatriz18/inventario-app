'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Building2, Receipt, Shield, ChevronRight,
  CheckCircle, AlertCircle, Info, Mail,
} from 'lucide-react';

import PageHeader   from '@/components/shared/PageHeader';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Separator }from '@/components/ui/separator';
import { Badge }    from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import {
  getConfigEmpresa, saveConfigEmpresa,
  getDefaultsRegimen, REGIMEN_LABELS, REGIMEN_DESCRIPCION,
} from '@/lib/firebase/config-empresa';
import { getConfigEmail, saveConfigEmail } from '@/lib/firebase/config-email';
import {
  RegimenEmpresa, ComprobantesHabilitados, ReglasTributarias,
  ConfigEmail, ProveedorEmail,
} from '@/types';

// ── Schema ────────────────────────────────────────────────────────────────

const schema = z.object({
  nombreEmpresa:   z.string().min(1, 'Requerido'),
  nombreComercial: z.string().optional(),
  ruc:             z.string().length(13, 'El RUC debe tener 13 dígitos'),
  direccion:       z.string().min(1, 'Requerido'),
  telefono:        z.string().optional(),
  email:           z.string().email('Email inválido').optional().or(z.literal('')),
  ciudad:          z.string().optional(),
  provincia:       z.string().optional(),
  regimen:         z.enum([
    'general','rimpe_emprendedor','rimpe_negocio_popular',
    'rimpe_artesano','exportador_habitual','contribuyente_especial',
  ]),
  moneda:          z.string(),
  mensajeAdicional:z.string().optional(),
});

type ConfigForm = z.infer<typeof schema>;

// ── Componente ────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [regimenActual, setRegimenActual] = useState<RegimenEmpresa>('general');
  const [comprobantes,  setComprobantes]  = useState<ComprobantesHabilitados | null>(null);
  const [reglas,        setReglas]        = useState<ReglasTributarias | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<ConfigForm>({
      resolver: zodResolver(schema) as any,
      defaultValues: { moneda: 'USD', regimen: 'general' },
    });

  const regimenWatch = watch('regimen') as RegimenEmpresa;

  // Actualizar preview cuando cambia el régimen
  useEffect(() => {
    if (!regimenWatch) return;
    setRegimenActual(regimenWatch);
    const defaults = getDefaultsRegimen(regimenWatch);
    setComprobantes(defaults.comprobantesHabilitados);
    setReglas(defaults.reglasTributarias);
  }, [regimenWatch]);

  useEffect(() => {
    getConfigEmpresa().then(cfg => {
      if (cfg) {
        reset({
          nombreEmpresa:    cfg.nombreEmpresa,
          nombreComercial:  cfg.nombreComercial ?? '',
          ruc:              cfg.ruc,
          direccion:        cfg.direccion,
          telefono:         cfg.telefono ?? '',
          email:            cfg.email ?? '',
          ciudad:           cfg.ciudad ?? '',
          provincia:        cfg.provincia ?? '',
          regimen:          cfg.regimen,
          moneda:           cfg.moneda,
          mensajeAdicional: cfg.mensajeAdicional ?? '',
        });
        setRegimenActual(cfg.regimen);
        setComprobantes(cfg.comprobantesHabilitados);
        setReglas(cfg.reglasTributarias);
      }
      setLoading(false);
    });
  }, [reset]);

  const onSubmit = async (data: ConfigForm) => {
    setSaving(true);
    try {
      await saveConfigEmpresa(data as any);
      toast.success('Configuración guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando...</div>;

  return (
    <div>
      <PageHeader
        title="Configuración del Negocio"
        description="Datos de la empresa, régimen tributario y comprobantes habilitados"
      />

      <div className="max-w-3xl space-y-6">

        {/* ── Datos generales ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-700">Datos de la Empresa</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Razón Social *</Label>
              <Input {...register('nombreEmpresa')} placeholder="Empresa S.A." />
              {errors.nombreEmpresa && <p className="text-xs text-red-500">{errors.nombreEmpresa.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nombre Comercial</Label>
              <Input {...register('nombreComercial')} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>RUC *</Label>
              <Input {...register('ruc')} placeholder="1234567890001" maxLength={13} />
              {errors.ruc && <p className="text-xs text-red-500">{errors.ruc.message}</p>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Dirección *</Label>
              <Input {...register('direccion')} placeholder="Av. Principal 123" />
              {errors.direccion && <p className="text-xs text-red-500">{errors.direccion.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input {...register('ciudad')} placeholder="Quito" />
            </div>
            <div className="space-y-1.5">
              <Label>Provincia</Label>
              <Input {...register('provincia')} placeholder="Pichincha" />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input {...register('telefono')} placeholder="0998765432" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input {...register('email')} type="email" placeholder="contacto@empresa.com" />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
          </div>
        </div>

        {/* ── Régimen tributario ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-700">Régimen Tributario</h3>
          </div>

          <div className="space-y-1.5">
            <Label>Régimen *</Label>
            <Select
              value={regimenWatch}
              onValueChange={v => setValue('regimen', v as RegimenEmpresa)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona el régimen" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REGIMEN_LABELS) as RegimenEmpresa[]).map(r => (
                  <SelectItem key={r} value={r}>
                    <div>
                      <div className="font-medium text-sm">{REGIMEN_LABELS[r]}</div>
                      <div className="text-xs text-slate-500">{REGIMEN_DESCRIPCION[r]}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview del régimen seleccionado */}
          {comprobantes && reglas && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Comprobantes habilitados */}
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                  Comprobantes habilitados
                </p>
                <div className="space-y-1.5">
                  {(Object.entries(comprobantes) as [keyof ComprobantesHabilitados, boolean][]).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      {val
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        : <AlertCircle className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                      <span className={`text-xs ${val ? 'text-slate-700' : 'text-slate-400'}`}>
                        {COMPROBANTE_LABELS[key]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reglas tributarias */}
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                  Reglas tributarias
                </p>
                <div className="space-y-1.5">
                  <RealBadge label={`IVA ${reglas.tasaIVA}%`} active={reglas.cobrarIVA} />
                  <RealBadge label="Agente de retención"      active={reglas.esAgenteRetencion} />
                  <RealBadge label="Oblig. a contabilidad"    active={reglas.obligadoContabilidad} />
                  <RealBadge label="Contrib. especial"        active={reglas.contribuyenteEspecial} />
                  <RealBadge label="Aplica ICE"               active={reglas.aplicaICE} />
                  <Separator className="my-2" />
                  <p className="text-xs font-medium text-slate-500 mb-1">Declara:</p>
                  <RealBadge label="Form 104 – IVA"       active={reglas.declaraFormulario104} />
                  <RealBadge label="Form 103 – Retenc."   active={reglas.declaraFormulario103} />
                  <RealBadge label="Form 105 – ICE"       active={reglas.declaraFormulario105} />
                  <RealBadge label="ATS mensual"          active={reglas.declaraATS} />
                  <RealBadge label="Form 101 – IR anual"  active={reglas.declaraFormulario101} />
                  <RealBadge label="Declaración RIMPE"    active={reglas.declaraRIMPE} />
                </div>
              </div>

            </div>
          )}

          {regimenWatch === 'rimpe_negocio_popular' && (
            <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>En Negocio Popular (antes RISE) solo puedes emitir Notas de Venta, no facturas. No cobras IVA separado — incluyes la cuota fija mensual al SRI.</span>
            </div>
          )}
          {regimenWatch === 'exportador_habitual' && (
            <div className="flex gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Como exportador habitual, tus ventas al exterior tienen tarifa IVA 0%. Tienes derecho a devolución del IVA pagado en compras locales usadas en exportaciones.</span>
            </div>
          )}
        </div>

        {/* ── Opciones adicionales ────────────────────────────────────── */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-slate-400" />
            <h3 className="font-semibold text-slate-700">Opciones Adicionales</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select
                value={watch('moneda')}
                onValueChange={v => setValue('moneda', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD – Dólar americano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mensaje adicional en comprobantes</Label>
              <Input
                {...register('mensajeAdicional')}
                placeholder="Ej: Gracias por su compra"
              />
            </div>
          </div>
        </div>

        <Button onClick={handleSubmit(onSubmit)} disabled={saving} className="w-full">
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </Button>

        {/* ── Correo (SMTP) ───────────────────────────────────────────── */}
        <EmailConfigCard />

      </div>
    </div>
  );
}

// ── Configuración de correo (SMTP) ──────────────────────────────────────────

function EmailConfigCard() {
  const [cfg, setCfg] = useState<ConfigEmail>({
    proveedor: 'gmail', email: '', password: '', fromName: '', host: '', port: 587,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfigEmail().then(c => { if (c) setCfg({ ...c, password: c.password ?? '' }); });
  }, []);

  const guardar = async () => {
    if (!cfg.email || !cfg.password) { toast.error('Ingresa correo y contraseña de aplicación'); return; }
    if (cfg.proveedor === 'otro' && (!cfg.host || !cfg.port)) {
      toast.error('Para "Otro" indica host y puerto SMTP'); return;
    }
    setSaving(true);
    try { await saveConfigEmail(cfg); toast.success('Configuración de correo guardada'); }
    catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border p-6 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="h-4 w-4 text-slate-400" />
        <h3 className="font-semibold text-slate-700">Correo para enviar comprobantes (SMTP)</h3>
      </div>

      <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Usa una <b>contraseña de aplicación</b>, no la contraseña normal de tu cuenta.
          En Gmail: activa la verificación en 2 pasos y genera una en{' '}
          <span className="font-mono">myaccount.google.com → Seguridad → Contraseñas de aplicaciones</span>.
          En Outlook: <span className="font-mono">cuenta.microsoft.com → Seguridad → Opciones avanzadas</span>.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Proveedor</Label>
          <Select value={cfg.proveedor} onValueChange={v => setCfg(c => ({ ...c, proveedor: v as ProveedorEmail }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gmail">Gmail</SelectItem>
              <SelectItem value="outlook">Outlook / Office 365</SelectItem>
              <SelectItem value="otro">Otro (SMTP personalizado)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Nombre del remitente</Label>
          <Input value={cfg.fromName ?? ''} placeholder="Mi Empresa S.A."
            onChange={e => setCfg(c => ({ ...c, fromName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Correo *</Label>
          <Input type="email" value={cfg.email} placeholder="ventas@gmail.com"
            onChange={e => setCfg(c => ({ ...c, email: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Contraseña de aplicación *</Label>
          <Input type="password" value={cfg.password} placeholder="xxxx xxxx xxxx xxxx"
            onChange={e => setCfg(c => ({ ...c, password: e.target.value }))} />
        </div>

        {cfg.proveedor === 'otro' && (
          <>
            <div className="space-y-1.5">
              <Label>Host SMTP</Label>
              <Input value={cfg.host ?? ''} placeholder="smtp.miservidor.com"
                onChange={e => setCfg(c => ({ ...c, host: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Puerto</Label>
              <Input type="number" value={cfg.port ?? 587} placeholder="587"
                onChange={e => setCfg(c => ({ ...c, port: Number(e.target.value) }))} />
            </div>
          </>
        )}
      </div>

      <Button onClick={guardar} disabled={saving} variant="outline" className="w-full">
        {saving ? 'Guardando...' : 'Guardar correo'}
      </Button>
    </div>
  );
}

// ── Helpers de UI ─────────────────────────────────────────────────────────

function RealBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {active
        ? <CheckCircle className="h-3 w-3 text-green-600 shrink-0" />
        : <div className="h-3 w-3 rounded-full border border-slate-300 shrink-0" />}
      <span className={`text-xs ${active ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
    </div>
  );
}

const COMPROBANTE_LABELS: Record<keyof ComprobantesHabilitados, string> = {
  factura:              'Factura electrónica',
  notaVenta:            'Nota de venta',
  notaCredito:          'Nota de crédito',
  notaDebito:           'Nota de débito',
  comprobanteRetencion: 'Comprobante de retención',
  liquidacionCompras:   'Liquidación de compras',
  guiaRemision:         'Guía de remisión',
  reciboInterno:        'Recibo interno (sin validez SRI)',
};
