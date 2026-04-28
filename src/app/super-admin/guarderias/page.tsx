import { desc, sql } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias } from '@/lib/db/schema';
import { GuarderiasClient, type GuarderiaRow } from './guarderias-client';

export const dynamic = 'force-dynamic';

export default async function SuperAdminGuarderiasPage() {
  await requireSuperAdmin();

  const rows = await db
    .select({
      id: guarderias.id,
      nombre: guarderias.nombre,
      slug: guarderias.slug,
      ciudad: guarderias.ciudad,
      provincia: guarderias.provincia,
      plan: guarderias.plan,
      createdAt: guarderias.createdAt,
      usuarios: sql<number>`(select count(*)::int from public.memberships where guarderia_id = ${guarderias.id} and status = 'active')`,
      espacios: sql<number>`(select count(*)::int from public.espacios where guarderia_id = ${guarderias.id})`,
      embarcaciones: sql<number>`(select count(*)::int from public.embarcaciones where guarderia_id = ${guarderias.id})`,
    })
    .from(guarderias)
    .orderBy(desc(guarderias.createdAt));

  const data: GuarderiaRow[] = rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    slug: r.slug,
    ciudad: r.ciudad,
    provincia: r.provincia,
    plan: r.plan,
    createdAt: r.createdAt.toISOString(),
    usuarios: r.usuarios,
    espacios: r.espacios,
    embarcaciones: r.embarcaciones,
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
