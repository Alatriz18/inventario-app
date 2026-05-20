'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createProveedor } from '@/lib/firebase/proveedores';

const schema = z.object({
  tipoIdentificacion: z.enum(['ruc','cedula','pasaporte','identificacion_exterior']),
  ruc:     z.string().min(5, 'Requerido'),
  nombre:  z.string().min(1, 'Requerido'),
  telefono:z.string().optional(),
  email:   z.string().email('Inválido').optional().or(z.literal('')),
});

type QuickProvForm = z.infer<typeof schema>;

interface Props {
  open:     boolean;
  onClose:  () => void;
  onCreated:(id: string, nombre: string) => void;
}

export default function QuickCreateProveedor({ open, onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, setValue, formState: { errors } } =
    useForm<QuickProvForm>({ resolver: zodResolver(schema), defaultValues: { tipoIdentificacion: 'ruc' } });

  const onSubmit = async (data: QuickProvForm) => {
    setSaving(true);
    try {
      await createProveedor({
        tipoIdentificacion: data.tipoIdentificacion,
        ruc:                data.ruc,
        nombre:             data.nombre,
        telefono:           data.telefono || undefined,
        email:              data.email    || undefined,
        tipoProveedor:      'local',
        tipoPago:           'contado',
        pais:               'Ecuador',
        codigoPais:         'EC',
        activo:             true,
        createdAt:          new Date(),
      });
      toast.success('Proveedor creado');
      onCreated(data.ruc, data.nombre);
      reset();
      onClose();
    } catch {
      toast.error('Error al crear proveedor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> Nuevo Proveedor Rápido
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo ID *</Label>
              <Select onValueChange={v => setValue('tipoIdentificacion', v as any)} defaultValue="ruc">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ruc">RUC</SelectItem>
                  <SelectItem value="cedula">Cédula</SelectItem>
                  <SelectItem value="pasaporte">Pasaporte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>RUC / Identificación *</Label>
              <Input placeholder="0990000000001" {...register('ruc')} />
              {errors.ruc && <p className="text-xs text-red-500">{errors.ruc.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre / Razón Social *</Label>
            <Input placeholder="Empresa S.A." {...register('nombre')} />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input placeholder="0999999999" {...register('telefono')} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="proveedor@mail.com" {...register('email')} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={saving}>
            {saving ? 'Guardando...' : 'Crear Proveedor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}