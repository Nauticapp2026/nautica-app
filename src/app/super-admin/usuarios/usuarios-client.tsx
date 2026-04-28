'use client';

import { useState, useTransition, useMemo } from 'react';
import { Trash2, X, ShieldCheck, Shield } from 'lucide-react';

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
};

type Props = {
  usuarios: UsuarioRow[];
  actorId: string;
};

export function UsuariosClient({ usuarios, actorId }: Props) {
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
        <input
          type="search"
          placeholder="Buscar por email o nombre..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#669E9D] focus:outline-none sm:max-w-xs"
        />
        <p className="text-xs text-[#677B85]">
          {filtered.length} de {usuarios.length} usuarios
        </p>
      </div>

      {globalError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {globalError}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold tracking-wider text-[#677B85] uppercase">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Memberships</th>
              <th className="px-4 py-3">Super admin</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-[#677B85]">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <UsuarioFila
                  key={u.id}
                  usuario={u}
                  isSelf={u.id === actorId}
                  onError={setGlobalError}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsuarioFila({
  usuario,
  isSelf,
  onError,
}: {
  usuario: UsuarioRow;
  isSelf: boolean;
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
        <div className="font-semibold text-[#175861]">{usuario.email}</div>
        {fullName && <div className="text-xs text-[#677B85]">{fullName}</div>}
      </td>
      <td className="px-4 py-3 align-top">
        {usuario.memberships.length === 0 ? (
          <span className="text-xs text-gray-400">Sin memberships</span>
        ) : (
          <ul className="space-y-1.5">
            {usuario.memberships.map((m) => (
              <MembershipFila key={m.id} membership={m} onError={onError} />
            ))}
          </ul>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <button
          type="button"
          onClick={handleToggleSuperAdmin}
          disabled={pending || (isSelf && usuario.isSuperAdmin)}
          title={
            isSelf && usuario.isSuperAdmin
              ? 'No podés quitarte el flag a vos mismo'
              : usuario.isSuperAdmin
                ? 'Quitar flag'
                : 'Marcar como super admin'
          }
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            usuario.isSuperAdmin
              ? 'bg-[#175861] text-white hover:bg-[#669E9D]'
              : 'bg-gray-100 text-[#677B85] hover:bg-gray-200'
          }`}
        >
          {usuario.isSuperAdmin ? (
            <>
              <ShieldCheck className="size-3.5" /> Sí
            </>
          ) : (
            <>
              <Shield className="size-3.5" /> No
            </>
          )}
        </button>
      </td>
      <td className="px-4 py-3 text-right align-top">
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending || isSelf}
          title={isSelf ? 'No podés eliminar tu propia cuenta' : 'Eliminar cuenta'}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
          Eliminar
        </button>
      </td>
    </tr>
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
  // la mostramos en el select para no perderla, pero el resto son las normales.
  const rolOptions = MEMBERSHIP_ROLES.includes(membership.rol as (typeof MEMBERSHIP_ROLES)[number])
    ? MEMBERSHIP_ROLES
    : [membership.rol, ...MEMBERSHIP_ROLES];

  return (
    <li className={`flex flex-wrap items-center gap-2 ${pending ? 'opacity-50' : ''}`}>
      <span className="font-medium text-[#175861]">{membership.guarderia.nombre}</span>
      <span className="text-gray-300">—</span>
      <select
        value={membership.rol}
        onChange={handleRolChange}
        disabled={pending}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-[#669E9D] focus:outline-none disabled:opacity-50"
      >
        {rolOptions.map((r) => (
          <option key={r} value={r}>
            {ROL_LABELS[r as Rol] ?? r}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleRemove}
        disabled={pending}
        title="Quitar de esta guardería"
        className="inline-flex items-center rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}
