import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { memberships, profiles, embarcaciones } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { UsuariosClient } from './usuarios-client';

export default async function UsuariosPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;

  const socios = await db
    .select({
      membresiaId: memberships.id,
      profileId: profiles.id,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      email: profiles.email,
      direccion: profiles.direccion,
      deuda: profiles.deuda,
      estadoSocio: profiles.estadoSocio,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.guarderiaId, gId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .orderBy(desc(memberships.createdAt));

  const profileIds = socios.map((s) => s.profileId);

  const embarcacionesList =
    profileIds.length > 0
      ? await db
          .select({ profileId: embarcaciones.profileId, nombre: embarcaciones.nombre })
          .from(embarcaciones)
          .where(inArray(embarcaciones.profileId, profileIds as string[]))
      : [];

  const embByProfile: Record<string, string> = {};
  for (const e of embarcacionesList) {
    if (e.profileId && !embByProfile[e.profileId]) embByProfile[e.profileId] = e.nombre;
  }

  const sociosData = socios.map((s) => ({
    ...s,
    embarcacion: s.profileId ? (embByProfile[s.profileId] ?? null) : null,
  }));

  return <UsuariosClient socios={sociosData} />;
}
