'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';

export interface OpcionCuenta {
  value:   string;
  label:   string;   // texto que se muestra: "1010306 – INVENTARIOS…"
  grupo?:  string;   // encabezado opcional (p. ej. "Opciones especiales")
}

interface Props {
  value:        string;
  onChange:     (valor: string) => void;
  opciones:     OpcionCuenta[];
  placeholder?: string;
  /** Si se pasa, agrega una primera opción que deja el campo vacío (usar el valor por defecto). */
  vacioLabel?:  string;
  disabled?:    boolean;
}

/**
 * Selector de cuentas con búsqueda: se escribe el código o parte del nombre y se
 * filtra la lista. El texto largo se recorta para no invadir los campos vecinos.
 */
export default function CuentaCombobox({ value, onChange, opciones, placeholder = 'Elegir cuenta…', vacioLabel, disabled }: Props) {
  const [abierto, setAbierto] = useState(false);
  const actual = opciones.find(o => o.value === value);
  const elegir = (v: string) => { onChange(v); setAbierto(false); };

  const grupos = [...new Set(opciones.map(o => o.grupo ?? ''))];

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={abierto} disabled={disabled}
          className="w-full min-w-0 justify-between font-normal">
          <span className={cn('truncate', !actual && 'text-slate-400')}>
            {actual ? actual.label : (value === '' && vacioLabel ? vacioLabel : placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[320px] gap-0 p-0">
        <Command>
          <CommandInput placeholder="Escribe el código o el nombre…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No hay cuentas que coincidan.</CommandEmpty>
            {vacioLabel && (
              <CommandGroup>
                <CommandItem value="__vacio__" onSelect={() => elegir('')}>
                  <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                  {vacioLabel}
                </CommandItem>
              </CommandGroup>
            )}
            {grupos.map(g => (
              <CommandGroup key={g || 'general'} heading={g || undefined}>
                {opciones.filter(o => (o.grupo ?? '') === g).map(o => (
                  <CommandItem key={o.value} value={o.label} onSelect={() => elegir(o.value)}>
                    <Check className={cn('mr-2 h-4 w-4 shrink-0', value === o.value ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
