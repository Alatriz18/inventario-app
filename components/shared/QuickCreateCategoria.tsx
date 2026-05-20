'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Tags } from 'lucide-react';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Textarea }from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { createCategoria } from '@/lib/firebase/categorias';

const schema = z.object({
  nombre:      z.string().min(1, 'Requerido'),
  descripcion: z.string().optional(),
});

type QuickCatForm = z.infer<typeof schema>;

interface Props {
  open:     boolean;
  onClose:  () => void;
  onCreated:(nombre: string) => void;
}

export default function QuickCreateCategoria({ open, onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<QuickCatForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: QuickCatForm) => {
    setSaving(true);
    try {
      await createCategoria({ nombre: data.nombre, descripcion: data.descripcion, activo: true });
      toast.success('Categoría creada');
      onCreated(data.nombre);
      reset();
      onClose();
    } catch {
      toast.error('Error al crear categoría');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-4 w-4" /> Nueva Categoría
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Ej: Tabacos, Licores..." {...register('nombre')} />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea placeholder="Opcional..." rows={2} {...register('descripcion')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => handleSubmit(onSubmit)()} disabled={saving}>
            {saving ? 'Guardando...' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}