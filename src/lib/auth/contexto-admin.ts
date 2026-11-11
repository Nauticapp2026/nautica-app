/**
 * Contexto del administrador del club para los módulos de administración (legajo del
 * personal, proveedores, bienes de uso). Esos datos son sensibles (CUIL, CBU, costos): solo
 * los ve y los edita un admin del club (`ADMIN_ROLES`) o un super admin.
 *
 * Cada acción del servidor lo llama primero: así tiene el rol validado y el `guarderia_id`
 * del usuario actual, que es el que se usa para scopear TODA consulta (nunca un id que venga
 * del cliente sin comprobar que pertenece a ese club).
 */

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';

export type ContextoAdmin = {
  gId: string;
  /** Usuario que hace el cambio (para los registros de quién modificó). */
  userId: string;
  guarderiaNombre: string;
};

/** Contexto del admin actual, o un mensaje de error listo para devolver. */
export async function contextoAdmin(): Promise<ContextoAdmin | { error: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };
  const esAdmin = ctx.profile.isSuperAdmin || ADMIN_ROLES.includes(ctx.activeMembership.rol);
  if (!esAdmin) return { error: 'Solo los administradores pueden ver y editar esta sección.' };
  return {
    gId: ctx.activeMembership.guarderiaId,
    userId: ctx.profile.id,
    guarderiaNombre: ctx.activeGuarderia?.nombre ?? '',
  };
}

export function esError(c: ContextoAdmin | { error: string }): c is { error: string } {
  return 'error' in c;
}
