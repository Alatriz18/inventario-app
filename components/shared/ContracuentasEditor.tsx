'use client';

import { useEffect } from 'react';
import { Plus, X } from 'lucide-react';

import CuentaCombobox, { type OpcionCuenta } from '@/components/shared/CuentaCombobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resumirContrapartidas, type LineaContra } from '@/lib/bancos/contrapartidas';

interface Props {
  opciones: OpcionCuenta[];
  /** Monto del movimiento que se reparte entre las cuentas. */
  total:    number;
  value:    LineaContra[];
  onChange: (lineas: LineaContra[]) => void;
}

/**
 * Editor de contracuentas: una o varias cuentas contables que reparten el monto de un movimiento
 * bancario. Con una sola cuenta, su monto sigue al total; «Agregar cuenta» permite dividirlo
 * (comisión + IVA, parte a Caja y parte a un gasto, etc.).
 */
export default function ContracuentasEditor({ opciones, total, value, onChange }: Props) {
  // Con una sola cuenta, su monto es siempre el total del movimiento
  useEffect(() => {
    if (value.length === 1) {
      const texto = total > 0 ? total.toFixed(2) : '';
      if (value[0].monto !== texto) onChange([{ ...value[0], monto: texto }]);
    }
  }, [total, value, onChange]);

  const resumen = resumirContrapartidas(total, value);
  const cambiar = (i: number, parcial: Partial<LineaContra>) =>
    onChange(value.map((l, j) => (j === i ? { ...l, ...parcial } : l)));

  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <CuentaCombobox value={l.codigo} onChange={codigo => cambiar(i, { codigo })} opciones={opciones}
              placeholder="Buscar cuenta por código o nombre…" />
          </div>
          <Input type="number" min="0" step="0.01" className="w-28 text-right"
            value={l.monto} disabled={value.length === 1}
            onChange={e => cambiar(i, { monto: e.target.value })} placeholder="0.00" />
          {value.length > 1 && (
            <Button type="button" variant="ghost" size="sm" className="h-9 px-2 text-slate-400"
              onClick={() => onChange(value.filter((_, j) => j !== i))} title="Quitar esta cuenta">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
          onClick={() => onChange([...value, {
            codigo: '', monto: resumen.diferencia > 0 ? resumen.diferencia.toFixed(2) : '',
          }])}>
          <Plus className="mr-1 h-3 w-3" /> Agregar cuenta
        </Button>
        <span className={`text-xs ${resumen.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
          {resumen.ok ? `Repartido: $${resumen.suma.toFixed(2)}` : resumen.error}
        </span>
      </div>
    </div>
  );
}
