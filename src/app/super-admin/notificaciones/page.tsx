import { asc, desc, eq } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { guarderias, platformNotificaciones, profiles } from '@/lib/db/schema';

import {
  PlatformNotificacionesClient,
  type GuarderiaOpt,
  type PlatformNotificacion,
} from './notificaciones-client';

export const dynamic = 'force-dynamic';

export default async function SuperAdminNotificacionesPage() {
  await requireSuperAdmin();

  const [rows, guarderiasRows] = await Promise.all([
    db
      .select({
        id: platformNotificaciones.id,
        titulo: platformNotificaciones.titulo,
        cuerpo: platformNotificaciones.cuerpo,
        audiencia: platformNotificaciones.audiencia,
        guarderiaId: platformNotificaciones.guarderiaId,
        estado: platformNotificaciones.estado,
        error: platformNotificaciones.error,
        enviadoEn: platformNotificaciones.enviadoEn,
        createdAt: platformNotificaciones.createdAt,
        guarderiaNombre: guarderias.nombre,
        autorNombre: profiles.nombre,
        autorApellido: profiles.apellido,
        autorEmail: profiles.email,
      })
      .from(platformNotificaciones)
      .leftJoin(guarderias, eq(guarderias.id, platformNotificaciones.guarderiaId))
      .leftJoin(profiles, eq(profiles.id, platformNotificaciones.autorId))
      .orderBy(desc(platformNotificaciones.createdAt)),
    db
      .select({ id: guarderias.id, nombre: guarderias.nombre })
      .from(guarderias)
      .orderBy(asc(guarderias.nombre)),
  ]);

  const items: PlatformNotificacion[] = rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    cuerpo: r.cuerpo,
    audiencia: r.audiencia,
    guarderiaId: r.guarderiaId,
    guarderiaNombre: r.guarderiaNombre,
    estado: r.estado,
    error: r.error,
    enviadoEn: r.enviadoEn ? r.enviadoEn.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    autor:
      [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
  }));

  const guarderiasOpts: GuarderiaOpt[] = guarderiasRows.map((g) => ({
    id: g.id,
    nombre: g.nombre,
  }));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PlatformNotificacionesClient notificaciones={items} guarderias={guarderiasOpts} />
    </div>
  );
}
