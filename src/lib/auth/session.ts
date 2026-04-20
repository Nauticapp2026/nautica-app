import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { memberships, marinas, profiles } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Role } from '@/config/roles';

export const ACTIVE_MARINA_COOKIE = 'active_marina_id';

/**
 * Devuelve el user autenticado o null.
 * Usar en páginas/layouts que pueden ser públicas.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Devuelve el user o redirige a /login.
 * Usar en páginas protegidas.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Devuelve el profile + todas las memberships del user actual.
 * Incluye data de la guardería para el selector.
 */
export async function getUserContext() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return null;

  const userMemberships = await db
    .select({
      id: memberships.id,
      role: memberships.role,
      status: memberships.status,
      marinaId: memberships.marinaId,
      marina: {
        id: marinas.id,
        name: marinas.name,
        slug: marinas.slug,
        logoUrl: marinas.logoUrl,
      },
    })
    .from(memberships)
    .innerJoin(marinas, eq(marinas.id, memberships.marinaId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active')));

  return { user, profile, memberships: userMemberships };
}

/**
 * Devuelve la guardería activa basada en la cookie `active_marina_id`.
 * Si la cookie no existe o apunta a una guardería donde el user no tiene
 * membership activa, toma la primera disponible.
 */
export async function getActiveMarina() {
  const ctx = await getUserContext();
  if (!ctx || ctx.memberships.length === 0) return null;

  const cookieStore = await cookies();
  const activeCookie = cookieStore.get(ACTIVE_MARINA_COOKIE)?.value;

  const active = ctx.memberships.find((m) => m.marinaId === activeCookie) ?? ctx.memberships[0];

  return {
    ...ctx,
    activeMembership: active,
    activeMarina: active.marina,
  };
}

/**
 * Requiere que el user esté autenticado, tenga al menos una guardería
 * y que su rol en la guardería activa esté en la lista permitida.
 */
export async function requireRole(allowed: Role[]) {
  const ctx = await getActiveMarina();
  if (!ctx) redirect('/login');

  const isSuperAdmin = ctx.profile.isSuperAdmin;
  if (isSuperAdmin) return ctx;

  if (!allowed.includes(ctx.activeMembership.role as Role)) {
    redirect('/dashboard?error=forbidden');
  }

  return ctx;
}
