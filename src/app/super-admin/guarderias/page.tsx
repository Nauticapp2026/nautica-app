import { desc, eq, sql } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { embarcaciones, espacios, guarderias, memberships } from '@/lib/db/schema';
import { GuarderiasClient, type GuarderiaRow } from './guarderias-client';

export const dynamic = 'force-dynamic';

export default async function SuperAdminGuarderiasPage() {
  await requireSuperAdmin();

  // Queries separadas en vez de subqueries correlacionadas: más robustas y
  // fáciles de leer. count(*)::int devuelve int4, que postgres-js parsea
  // como number — agregamos .mapWith(Number) por las dudas.
  const [guarderiasRows, usuariosPorGuarderia, espaciosPorGuarderia, embarcacionesPorGuarderia] =
    await Promise.all([
      db
        .select({
          id: guarderias.id,
          nombre: guarderias.nombre,
          slug: guarderias.slug,
          ciudad: guarderias.ciudad,
          provincia: guarderias.provincia,
          plan: guarderias.plan,
          activa: guarderias.activa,
          createdAt: guarderias.createdAt,
        })
        .from(guarderias)
        .orderBy(desc(guarderias.createdAt)),

      db
        .select({
          guarderiaId: memberships.guarderiaId,
          count: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(memberships)
        .where(eq(memberships.status, 'active'))
        .groupBy(memberships.guarderiaId),

      db
        .select({
          guarderiaId: espacios.guarderiaId,
          count: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(espacios)
        .groupBy(espacios.guarderiaId),

      db
        .select({
          guarderiaId: embarcaciones.guarderiaId,
          count: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(embarcaciones)
        .groupBy(embarcaciones.guarderiaId),
    ]);

  const usuariosMap = new Map(usuariosPorGuarderia.map((r) => [r.guarderiaId, r.count]));
  const espaciosMap = new Map(espaciosPorGuarderia.map((r) => [r.guarderiaId, r.count]));
  const embarcacionesMap = new Map(embarcacionesPorGuarderia.map((r) => [r.guarderiaId, r.count]));

  const data: GuarderiaRow[] = guarderiasRows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    slug: r.slug,
    ciudad: r.ciudad,
    provincia: r.provincia,
    plan: r.plan,
    activa: r.activa,
    createdAt: r.createdAt.toISOString(),
    usuarios: usuariosMap.get(r.id) ?? 0,
    espacios: espaciosMap.get(r.id) ?? 0,
    embarcaciones: embarcacionesMap.get(r.id) ?? 0,
  }));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="page-title">Guarderías</h1>
        <p className="page-subtitle mt-1">
          Todas las guarderías registradas en la plataforma. Eliminar una borra todos sus datos
          (espacios, embarcaciones, facturación, memberships) — las cuentas de los usuarios quedan,
          pueden seguir teniendo acceso a otras guarderías.
        </p>
      </div>

      <GuarderiasClient guarderias={data} />
    </div>
  );
}
