import { asc, eq } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { memberships, profiles, guarderias } from '@/lib/db/schema';
import { UsuariosClient, type UsuarioRow } from './usuarios-client';

export const dynamic = 'force-dynamic';

export default async function SuperAdminUsuariosPage() {
  const { profile: actor } = await requireSuperAdmin();

  const [allProfiles, allMemberships] = await Promise.all([
    db.select().from(profiles).orderBy(asc(profiles.email)),
    db
      .select({
        id: memberships.id,
        userId: memberships.userId,
        rol: memberships.rol,
        status: memberships.status,
        guarderiaId: guarderias.id,
        guarderiaNombre: guarderias.nombre,
      })
      .from(memberships)
      .innerJoin(guarderias, eq(guarderias.id, memberships.guarderiaId)),
  ]);

  const byUser = new Map<string, UsuarioRow['memberships']>();
  for (const m of allMemberships) {
    const arr = byUser.get(m.userId) ?? [];
    arr.push({
      id: m.id,
      rol: m.rol,
      status: m.status,
      guarderia: { id: m.guarderiaId, nombre: m.guarderiaNombre },
    });
    byUser.set(m.userId, arr);
  }

  const usuarios: UsuarioRow[] = allProfiles.map((p) => ({
    id: p.id,
    email: p.email,
    nombre: p.nombre,
    apellido: p.apellido,
    isSuperAdmin: p.isSuperAdmin,
    createdAt: p.createdAt.toISOString(),
    memberships: byUser.get(p.id) ?? [],
  }));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Usuarios</h1>
        <p className="page-subtitle mt-1">
          Todos los usuarios de la plataforma. Las acciones acá afectan a todas las guarderías.
        </p>
      </div>

      <UsuariosClient usuarios={usuarios} actorId={actor.id} />
    </div>
  );
}
