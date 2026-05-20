'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createCliente } from '@/lib/firebase/clientes';
import { Cliente } from '@/types';

const schema = z.object({
  tipoIdentificacion: z.enum(['ruc','cedula','pasaporte','consumidor_final','identificacion_exterior']),
  identificacion:     z.string().min(1, 'Requerida'),
  nombre:             z.string().min(1, 'Requerido'),
  email:              z.string().email('Inválido').optional().or(z.literal('')),
  telefono:           z.string().optional(),
});

type QuickClienteForm = z.infer<typeof schema>;

interface Props {
  open:     boolean;
  onClose:  () => void;
  onCreated:(cliente: Omit<Cliente, 'id' | 'createdAt'> & { nombre: string; identificacion: string }) => void;
}

export default function QuickCreateCliente({ open, onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, setValue, formState: { errors } } =
    useForm<QuickClienteForm>({ resolver: zodResolver(schema), defaultValues: { tipoIdentificacion: 'cedula' } });

  const onSubmit = async (data: QuickClienteForm) => {
    setSaving(true);
    try {
      await createCliente({
        tipoIdentificacion: data.tipoIdentificacion,
        identificacion:     data.identificacion,
        nombre:             data.nombre,
        email:              data.email || undefined,
        telefono:           data.telefono || undefined,
        tipoCliente:        'local',
        tipoPago:           'contado',
        pais:               'Ecuador',
        codigoPais:         'EC',
        activo:             true,
        createdAt:          new Date(),
      });
      toast.success('Cliente creado');
      onCreated({
        tipoIdentificacion: data.tipoIdentificacion,
        identificacion:     data.identificacion,
        nombre:             data.nombre,
        tipoCliente:        'local',
        tipoPago:           'contado',
        pais:               'Ecuador',
        codigoPais:         'EC',
        activo:             true,
      });
      reset();
      onClose();
    } catch {
      toast.error('Error al crear cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Nuevo Cliente Rápido
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo ID *</Label>
              <Select onValueChange={v => setValue('tipoIdentificacion', v as any)} defaultValue="cedula">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ruc">RUC</SelectItem>
                  <SelectItem value="cedula">Cédula</SelectItem>
                  <SelectItem value="pasaporte">Pasaporte</SelectItem>
                  <SelectItem value="consumidor_final">Consumidor Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Identificación *</Label>
              <Input placeholder="0000000000" {...register('identificacion')} />
              {errors.identificacion && <p className="text-xs text-red-500">{errors.identificacion.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre / Razón Social *</Label>
            <Input placeholder="Juan Pérez" {...register('nombre')} />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input placeholder="0999999999" {...register('telefono')} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="cliente@mail.com" {...register('email')} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={saving}>
            {saving ? 'Guardando...' : 'Crear Cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}