import { desc, eq } from 'drizzle-orm';

import { requireSuperAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { platformNotificaciones, profiles } from '@/lib/db/schema';
import { createAdminClient } from '@/lib/supabase/admin';

import {
  PlatformNotificacionesClient,
  type PlatformNotificacion,
  type PushStats,
} from './notificaciones-client';

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
      programadaPara: platformNotificaciones.programadaPara,
      intentoIniciadoEn: platformNotificaciones.intentoIniciadoEn,
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
    programadaPara: r.programadaPara ? r.programadaPara.toISOString() : null,
    intentoIniciadoEn: r.intentoIniciadoEn ? r.intentoIniciadoEn.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    autor:
      [r.autorNombre, r.autorApellido].filter(Boolean).join(' ').trim() || r.autorEmail || null,
  }));

  const admin = createAdminClient();
  const [{ count: total }, { count: leidas }, { count: clickeadas }] = await Promise.all([
    admin.from('notificaciones').select('*', { count: 'exact', head: true }),
    admin
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .not('read_at', 'is', null),
    admin
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .not('clicked_at', 'is', null),
  ]);

  const pushStats: PushStats = {
    total: total ?? 0,
    leidas: leidas ?? 0,
    clickeadas: clickeadas ?? 0,
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PlatformNotificacionesClient notificaciones={items} pushStats={pushStats} />
    </div>
  );
}
