'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, UserX, UserCheck, KeyRound, UserCog } from 'lucide-react';

import PageHeader  from '@/components/shared/PageHeader';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Badge }   from '@/components/ui/badge';
import { Skeleton }from '@/components/ui/skeleton';
import { Separator}from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { AppUser, UserRole } from '@/types';
import { subscribeToUsers } from '@/lib/firebase/users';
import { useAuth } from '@/context/AuthContext';

const ROLES: { value: UserRole; label: string; color: string }[] = [
  { value: 'admin',     label: 'Administrador', color: 'bg-purple-100 text-purple-700' },
  { value: 'vendedor',  label: 'Vendedor',      color: 'bg-blue-100 text-blue-700' },
  { value: 'bodeguero', label: 'Bodeguero',     color: 'bg-green-100 text-green-700' },
  { value: 'contador',  label: 'Contador',      color: 'bg-orange-100 text-orange-700' },
];

const createSchema = z.object({
  nombre:   z.string().min(2, 'Mínimo 2 caracteres'),
  email:    z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  rol:      z.enum(['admin', 'vendedor', 'bodeguero', 'contador']),
});

const editSchema = z.object({
  nombre:   z.string().min(2, 'Mínimo 2 caracteres'),
  rol:      z.enum(['admin', 'vendedor', 'bodeguero', 'contador']),
  password: z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;

export default function UsuariosPage() {
  const { user: currentUser } = useAuth();

  const [usuarios,   setUsuarios]   = useState<AppUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<AppUser | null>(null);
  const [toggling,   setToggling]   = useState<AppUser | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');

  // Forms
  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) });
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  useEffect(() => {
    return subscribeToUsers((data) => { setUsuarios(data); setLoading(false); });
  }, []);

  const filtered = usuarios.filter(u =>
    u.nombre.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    createForm.reset({ nombre: '', email: '', password: '', rol: 'vendedor' });
    setDialogOpen(true);
  };

  const openEdit = (u: AppUser) => {
    setEditing(u);
    editForm.reset({ nombre: u.nombre, rol: u.rol, password: '' });
    setDialogOpen(true);
  };

  const onCreateSubmit = async (data: CreateForm) => {
    setSaving(true);
    try {
      const res = await fetch('/api/users/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Usuario creado correctamente');
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al crear usuario');
    } finally {
      setSaving(false);
    }
  };

  const onEditSubmit = async (data: EditForm) => {
    if (!editing) return;
    setSaving(true);
    try {
      const body: any = { nombre: data.nombre, rol: data.rol };
      if (data.password) body.password = data.password;

      const res = await fetch(`/api/users/${editing.uid}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Usuario actualizado');
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const toggleUsuario = async () => {
    if (!toggling) return;
    try {
      const nuevoEstado = !toggling.activo;
      const res = await fetch(`/api/users/${toggling.uid}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ activo: nuevoEstado }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success(nuevoEstado ? 'Usuario activado' : 'Usuario desactivado');
    } catch (err: any) {
      toast.error(err.message ?? 'Error');
    } finally {
      setToggling(null);
    }
  };

  const stats = {
    total:    usuarios.length,
    activos:  usuarios.filter(u => u.activo).length,
    inactivos:usuarios.filter(u => !u.activo).length,
  };

  return (
    <div>
      <PageHeader
        title="Gestión de Usuarios"
        description="Administra los usuarios y sus permisos de acceso al sistema"
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo Usuario
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total usuarios', value: stats.total,    color: 'text-slate-700' },
          { label: 'Activos',        value: stats.activos,  color: 'text-green-600' },
          { label: 'Inactivos',      value: stats.inactivos,color: 'text-red-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <Input placeholder="Buscar por nombre o email..."
          value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-center">Rol</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-center w-28">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) =>
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                  <UserCog className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay usuarios registrados.</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(u => {
              const roleConfig = ROLES.find(r => r.value === u.rol);
              const isCurrentUser = u.uid === currentUser?.uid;
              return (
                <TableRow key={u.uid} className={!u.activo ? 'opacity-50' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                        {u.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{u.nombre}</p>
                        {isCurrentUser && <p className="text-xs text-slate-400">Tú</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">{u.email}</TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleConfig?.color ?? ''}`}>
                      {roleConfig?.label ?? u.rol}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={u.activo ? 'default' : 'secondary'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}
                        className="h-8 w-8 text-slate-500 hover:text-blue-600"
                        title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!isCurrentUser && (
                        <Button variant="ghost" size="icon"
                          onClick={() => setToggling(u)}
                          className={`h-8 w-8 ${u.activo ? 'text-slate-500 hover:text-red-600' : 'text-slate-500 hover:text-green-600'}`}
                          title={u.activo ? 'Desactivar' : 'Activar'}>
                          {u.activo
                            ? <UserX className="h-4 w-4" />
                            : <UserCheck className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ─── DIALOG CREAR ─── */}
      {!editing && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nuevo Usuario</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nombre completo *</Label>
                <Input placeholder="Juan Pérez" {...createForm.register('nombre')} />
                {createForm.formState.errors.nombre && (
                  <p className="text-xs text-red-500">{createForm.formState.errors.nombre.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" placeholder="usuario@empresa.com" {...createForm.register('email')} />
                {createForm.formState.errors.email && (
                  <p className="text-xs text-red-500">{createForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Contraseña temporal *</Label>
                <Input type="password" placeholder="Mínimo 8 caracteres" {...createForm.register('password')} />
                {createForm.formState.errors.password && (
                  <p className="text-xs text-red-500">{createForm.formState.errors.password.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Rol *</Label>
                <Select onValueChange={v => createForm.setValue('rol', v as UserRole)} defaultValue="vendedor">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-700">Permisos por rol:</p>
                <p>🟣 <strong>Admin</strong> — acceso total al sistema</p>
                <p>🔵 <strong>Vendedor</strong> — POS, ventas, clientes, comprobantes</p>
                <p>🟢 <strong>Bodeguero</strong> — inventario, entradas, despachos</p>
                <p>🟠 <strong>Contador</strong> — contabilidad, reportes, cuentas por pagar</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={() => createForm.handleSubmit(onCreateSubmit)()} disabled={saving}>
                {saving ? 'Creando...' : 'Crear Usuario'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── DIALOG EDITAR ─── */}
      {editing && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Usuario</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nombre completo *</Label>
                <Input {...editForm.register('nombre')} />
                {editForm.formState.errors.nombre && (
                  <p className="text-xs text-red-500">{editForm.formState.errors.nombre.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Rol *</Label>
                <Select onValueChange={v => editForm.setValue('rol', v as UserRole)} defaultValue={editing.rol}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  Nueva contraseña
                  <span className="text-xs text-slate-400 font-normal">(dejar vacío para no cambiar)</span>
                </Label>
                <Input type="password" placeholder="Nueva contraseña (opcional)" {...editForm.register('password')} />
                {editForm.formState.errors.password && (
                  <p className="text-xs text-red-500">{editForm.formState.errors.password.message}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={() => editForm.handleSubmit(onEditSubmit)()} disabled={saving}>
                {saving ? 'Guardando...' : 'Actualizar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── ALERT ACTIVAR/DESACTIVAR ─── */}
      <AlertDialog open={!!toggling} onOpenChange={() => setToggling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggling?.activo ? '¿Desactivar usuario?' : '¿Activar usuario?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.activo
                ? `${toggling?.nombre} no podrá iniciar sesión hasta que lo reactives.`
                : `${toggling?.nombre} recuperará el acceso al sistema.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={toggleUsuario}
              className={toggling?.activo ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}>
              {toggling?.activo ? 'Desactivar' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}