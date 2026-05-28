'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Settings, Save } from 'lucide-react';

import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { Separator }from '@/components/ui/separator';

import { ConfigContable } from '@/types';
import { getOrCreateConfigContable, saveConfigContable } from '@/lib/firebase/config-contable';
import { seedPlanCuentas } from '@/lib/firebase/plan-cuentas';

const CAMPOS: { key: keyof ConfigContable; label: string; desc: string }[] = [
  { key:'cuentaVentas12',          label:'Ventas gravadas IVA 15%',         desc:'4.1.01' },
  { key:'cuentaVentas0',           label:'Ventas tarifa 0%',                desc:'4.1.02' },
  { key:'cuentaIVAVentas',         label:'IVA en Ventas (pasivo)',          desc:'2.1.02' },
  { key:'cuentaCaja',              label:'Caja',                            desc:'1.1.01' },
  { key:'cuentaBancos',            label:'Bancos',                          desc:'1.1.02' },
  { key:'cuentaCxCClientes',       label:'Cuentas por Cobrar Clientes',     desc:'1.1.03' },
  { key:'cuentaCostoVentas',       label:'Costo de Ventas',                 desc:'5.1.01' },
  { key:'cuentaInventario',        label:'Inventario de Mercaderías',       desc:'1.1.05' },
  { key:'cuentaIVACompras',        label:'IVA en Compras (activo)',         desc:'1.1.04' },
  { key:'cuentaCxPProveedores',    label:'Cuentas por Pagar Proveedores',   desc:'2.1.01' },
  { key:'cuentaRetFuenteClientes', label:'Ret. Fuente por Cobrar',          desc:'1.1.06' },
  { key:'cuentaRetIVAClientes',    label:'Ret. IVA por Cobrar',             desc:'1.1.07' },
];

export default function ConfigContablePage() {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const { register, handleSubmit, reset } = useForm<ConfigContable>();

  useEffect(() => {
    getOrCreateConfigContable().then(cfg => {
      if (cfg) reset(cfg);
      setLoading(false);
    });
  }, [reset]);

  const onSubmit = async (data: ConfigContable) => {
    setSaving(true);
    try {
      await saveConfigContable(data);
      toast.success('Configuración contable guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-slate-400">Cargando configuración...</div>;

  return (
    <div>
      <PageHeader
        title="Configuración Contable"
        description="Mapeo de cuentas contables a cada tipo de operación del sistema"
      />

      <div className="max-w-2xl bg-white rounded-xl border p-6 space-y-5">
        <div className="flex items-center gap-2 text-slate-600 text-sm">
          <Settings className="h-4 w-4" />
          <p>Ingresa el <strong>código</strong> de la cuenta contable para cada operación.
          Estos códigos deben existir en el Plan de Cuentas.</p>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-4">
          {CAMPOS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center gap-4">
              <div className="flex-1">
                <Label className="text-sm">{label}</Label>
                <p className="text-xs text-slate-400">Código sugerido: {desc}</p>
              </div>
              <Input
                className="w-32 font-mono text-sm"
                placeholder={desc}
                {...register(key)}
              />
            </div>
          ))}
        </div>

        <Separator />

        <Button className="w-full" onClick={() => handleSubmit(onSubmit)()} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
      </div>
    </div>
  );
}