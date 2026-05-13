import { desc, eq } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { platformNotificaciones, profiles } from '@/lib/db/schema';

import { PlatformNotificacionesClient, type PlatformNotificacion } from './notificaciones-client';

export const dynamic = 'force-dynamic';

export default async function SuperAdminNotificacionesPage() {
  await requireSuperAdmin();

  const rows = await db
    .select({
      id: platformNotificaciones.id,
      titulo: platformNotificaciones.titulo,
      cuerpo: platformNotificaciones.cuerpo,
      audiencia: platformNotificaciones.audiencia,
      estado: platformNotificaciones.estado,
      error: platformNotificaciones.error,
      enviadoEn: platformNotificaciones.enviadoEn,
      createdAt: platformNotificaciones.createdAt,
      autorNombre: profiles.nombre,
      autorApellido: profiles.apellido,
      autorEmail: profiles.email,
    })
    .from(platformNotificaciones)
    .leftJoin(profiles, eq(profiles.id, platformNotificaciones.autorId))
    .orderBy(desc(platformNotificaciones.createdAt));

  const items: PlatformNotificacion[] = rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    cuerpo: r.cuerpo,
    audiencia: r.audiencia,
    estado: r.estado,
    error: r.error,
    enviadoEn: r.enviadoEn ? r.enviadoEn.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    autor:
      [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
  }));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PlatformNotificacionesClient notificaciones={items} />
    </div>
  );
}
