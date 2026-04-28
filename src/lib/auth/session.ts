import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { memberships, guarderias, profiles } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Rol } from '@/config/roles';

export const ACTIVE_GUARDERIA_COOKIE = 'active_guarderia_id';

// cache() deduplicates within a single render cycle — layout + page share the result
export const getCurrentUser = cache(async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function getUserContext() {
  const user = await getCurrentUser();
  if (!user) return null;

  // Single JOIN query instead of two round-trips
  const rows = await db
    .select({
      profile: profiles,
      membershipId: memberships.id,
      rol: memberships.rol,
      status: memberships.status,
      guarderiaId: memberships.guarderiaId,
      guarderia: {
        id: guarderias.id,
        nombre: guarderias.nombre,
        slug: guarderias.slug,
        logoUrl: guarderias.logoUrl,
      },
    })
    .from(profiles)
    .innerJoin(
      memberships,
      and(eq(memberships.userId, profiles.id), eq(memberships.status, 'active')),
    )
    .innerJoin(guarderias, eq(guarderias.id, memberships.guarderiaId))
    .where(eq(profiles.id, user.id));

  if (!rows.length) return null;

  const profile = rows[0].profile;
  const userMemberships = rows.map((r) => ({
    id: r.membershipId,
    rol: r.rol,
    status: r.status,
    guarderiaId: r.guarderiaId,
    guarderia: r.guarderia,
  }));

  return { user, profile, memberships: userMemberships };
}

export const getActiveMarina = cache(async function getActiveMarina() {
  const ctx = await getUserContext();
  if (!ctx || ctx.memberships.length === 0) return null;

  const cookieStore = await cookies();
  const activeCookie = cookieStore.get(ACTIVE_GUARDERIA_COOKIE)?.value;

  const active = ctx.memberships.find((m) => m.guarderiaId === activeCookie) ?? ctx.memberships[0];

  return {
    ...ctx,
    activeMembership: active,
    activeGuarderia: active.guarderia,
  };
});

export async function requireRole(allowed: Rol[]) {
  const ctx = await getActiveMarina();
  if (!ctx) redirect('/login');

  if (ctx.profile.isSuperAdmin) return ctx;

  if (!allowed.includes(ctx.activeMembership.rol as Rol)) {
    redirect('/dashboard?error=forbidden');
  }

  return ctx;
}

// Para el panel de super admin: solo carga el profile (no requiere membership
// activa en ninguna guardería) y exige is_super_admin = true.
export async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);

  if (!profile?.isSuperAdmin) redirect('/no-access');

  return { user, profile };
}
