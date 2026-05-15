'use client';

import { useState, useTransition, useMemo } from 'react';
import { Trash2, X, ShieldCheck, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { MEMBERSHIP_ROLES, ROL_LABELS, type Rol } from '@/config/roles';
import {
  deleteUserAction,
  toggleSuperAdminAction,
  updateMembershipRolAction,
  removeMembershipAction,
} from '@/app/actions/super-admin/usuarios';

export type MembershipRow = {
  id: string;
  rol: Rol;
  status: string;
  guarderia: { id: string; nombre: string };
};

export type UsuarioRow = {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  isSuperAdmin: boolean;
  createdAt: string;
  memberships: MembershipRow[];
  // Última aceptación de T&C del usuario, o null si nunca aceptó.
  terminos: { version: number; aceptadoEn: string } | null;
};

type Props = {
  usuarios: UsuarioRow[];
  actorId: string;
  // Versión vigente de los T&C. null si todavía no hay nada publicado
  // (caso de borde, la migración 0042 inserta la v1).
  versionVigente: number | null;
};

const TZ_AR = 'America/Argentina/Buenos_Aires';

function formatFechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    timeZone: TZ_AR,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

// Mismo estilo que un Input shadcn pero para <select> nativo. Mantiene los
// tokens del design system (border-input, focus-visible:border-ring) y evita
// los wrappers de radix dentro de filas de tabla.
const selectCls =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 rounded-md border bg-transparent px-2 py-1 text-xs shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50';

export function UsuariosClient({ usuarios, actorId, versionVigente }: Props) {
  const [query, setQuery] = useState('');
  const [globalError, setGlobalError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter((u) => {
      const fullName = `${u.nombre ?? ''} ${u.apellido ?? ''}`.toLowerCase();
      return u.email.toLowerCase().includes(q) || fullName.includes(q);
    });
  }, [usuarios, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          placeholder="Buscar por email o nombre..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <p className="text-muted-foreground text-xs">
          {filtered.length} de {usuarios.length} usuarios
        </p>
      </div>

      {globalError && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
          {globalError}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="text-muted-foreground bg-gray-50 text-left text-xs font-semibold tracking-wider uppercase">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Memberships</th>
                <th className="px-4 py-3">Super admin</th>
                <th className="px-4 py-3">Términos</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-4 py-6 text-center text-sm">
                    Sin resultados.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <UsuarioFila
                    key={u.id}
                    usuario={u}
                    isSelf={u.id === actorId}
                    versionVigente={versionVigente}
                    onError={setGlobalError}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function UsuarioFila({
  usuario,
  isSelf,
  versionVigente,
  onError,
}: {
  usuario: UsuarioRow;
  isSelf: boolean;
  versionVigente: number | null;
  onError: (msg: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const fullName = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ');

  function handleDelete() {
    if (
      !confirm(
        `¿Eliminar a ${usuario.email}? Esta acción borra la cuenta y todas sus memberships en todas las guarderías.`,
      )
    ) {
      return;
    }
    onError(null);
    startTransition(async () => {
      const res = await deleteUserAction(usuario.id);
      if (res.error) onError(res.error);
    });
  }

  function handleToggleSuperAdmin() {
    const next = !usuario.isSuperAdmin;
    if (
      !confirm(
        next
          ? `¿Marcar a ${usuario.email} como super admin?`
          : `¿Quitarle el flag de super admin a ${usuario.email}?`,
      )
    ) {
      return;
    }
    onError(null);
    startTransition(async () => {
      const res = await toggleSuperAdminAction({ userId: usuario.id, value: next });
      if (res.error) onError(res.error);
    });
  }

  return (
    <tr className={pending ? 'opacity-50' : ''}>
      <td className="px-4 py-3 align-top">
        <div className="font-semibold text-[#101828]">{usuario.email}</div>
        {fullName && <div className="text-muted-foreground text-xs">{fullName}</div>}
      </td>
      <td className="px-4 py-3 align-top">
        {usuario.memberships.length === 0 ? (
          <span className="text-muted-foreground text-xs">Sin memberships</span>
        ) : (
          <ul className="space-y-1.5">
            {usuario.memberships.map((m) => (
              <MembershipFila key={m.id} membership={m} onError={onError} />
            ))}
          </ul>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <Button
          type="button"
          variant={usuario.isSuperAdmin ? 'default' : 'outline'}
          size="xs"
          onClick={handleToggleSuperAdmin}
          disabled={pending || (isSelf && usuario.isSuperAdmin)}
          title={
            isSelf && usuario.isSuperAdmin
              ? 'No podés quitarte el flag a vos mismo'
              : usuario.isSuperAdmin
                ? 'Quitar flag'
                : 'Marcar como super admin'
          }
        >
          {usuario.isSuperAdmin ? <ShieldCheck /> : <Shield />}
          {usuario.isSuperAdmin ? 'Sí' : 'No'}
        </Button>
      </td>
      <td className="px-4 py-3 align-top">
        <TerminosCell terminos={usuario.terminos} versionVigente={versionVigente} />
      </td>
      <td className="px-4 py-3 text-right align-top">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={handleDelete}
          disabled={pending || isSelf}
          title={isSelf ? 'No podés eliminar tu propia cuenta' : 'Eliminar cuenta'}
          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 />
          Eliminar
        </Button>
      </td>
    </tr>
  );
}

function TerminosCell({
  terminos,
  versionVigente,
}: {
  terminos: UsuarioRow['terminos'];
  versionVigente: number | null;
}) {
  if (!terminos) {
    return <span className="text-xs font-semibold text-red-600">—</span>;
  }
  const desactualizado = versionVigente != null && terminos.version < versionVigente;
  return (
    <span
      className={`text-xs tabular-nums ${desactualizado ? 'text-amber-700' : 'text-[#175861]'}`}
      title={
        desactualizado ? `Aceptó v${terminos.version} (vigente: v${versionVigente})` : undefined
      }
    >
      v{terminos.version} · {formatFechaCorta(terminos.aceptadoEn)}
    </span>
  );
}

function MembershipFila({
  membership,
  onError,
}: {
  membership: MembershipRow;
  onError: (msg: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleRolChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === membership.rol) return;
    onError(null);
    startTransition(async () => {
      const res = await updateMembershipRolAction({
        membershipId: membership.id,
        rol: next,
      });
      if (res.error) onError(res.error);
    });
  }

  function handleRemove() {
    if (
      !confirm(
        `¿Quitar a este usuario de "${membership.guarderia.nombre}"? Pierde acceso a esa guardería.`,
      )
    ) {
      return;
    }
    onError(null);
    startTransition(async () => {
      const res = await removeMembershipAction(membership.id);
      if (res.error) onError(res.error);
    });
  }

  // Si la rol actual no está en MEMBERSHIP_ROLES (ej. super_admin viejo), igual
  // la mostramos en el select para no perderla.
  const rolOptions = MEMBERSHIP_ROLES.includes(membership.rol as (typeof MEMBERSHIP_ROLES)[number])
    ? MEMBERSHIP_ROLES
    : [membership.rol, ...MEMBERSHIP_ROLES];

  return (
    <li className={`flex flex-wrap items-center gap-2 ${pending ? 'opacity-50' : ''}`}>
      <span className="font-medium text-[#101828]">{membership.guarderia.nombre}</span>
      <span className="text-muted-foreground">—</span>
      <select
        value={membership.rol}
        onChange={handleRolChange}
        disabled={pending}
        className={selectCls}
      >
        {rolOptions.map((r) => (
          <option key={r} value={r}>
            {ROL_LABELS[r as Rol] ?? r}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={handleRemove}
        disabled={pending}
        title="Quitar de esta guardería"
        className="text-muted-foreground hover:bg-red-50 hover:text-red-600"
      >
        <X />
      </Button>
    </li>
  );
}
