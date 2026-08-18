import { desc, eq, inArray } from 'drizzle-orm';
import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { embarcaciones, profiles, solicitudesMembership } from '@/lib/db/schema';
import { SolicitudesSocioClient } from './solicitudes-socio-client';
import { SOLICITUDES_TAB_IDS, tabDesdeUrl } from '@/lib/tab-url';

export default async function SolicitudesSocioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Pestaña activa desde la URL: refrescar (F5) mantiene la vista.
  const { tab } = await searchParams;
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;

  const rows = await db
    .select({
      id: solicitudesMembership.id,
      estado: solicitudesMembership.estado,
      motivoRechazo: solicitudesMembership.motivoRechazo,
      createdAt: solicitudesMembership.createdAt,
      resolvedAt: solicitudesMembership.resolvedAt,
      solicitanteId: profiles.id,
      solicitanteNombre: profiles.nombre,
      solicitanteApellido: profiles.apellido,
      solicitanteEmail: profiles.email,
      solicitanteTelefono: profiles.telefono,
    })
    .from(solicitudesMembership)
    .innerJoin(profiles, eq(profiles.id, solicitudesMembership.solicitanteId))
    .where(eq(solicitudesMembership.guarderiaId, gId))
    .orderBy(desc(solicitudesMembership.createdAt));

  // Marcar qué solicitantes tienen al menos una embarcación cargada (en
  // cualquier guardería). El admin no puede aprobar sin embarcación previa.
  const solicitanteIds = Array.from(new Set(rows.map((r) => r.solicitanteId)));
  const embarcacionesRows =
    solicitanteIds.length > 0
      ? await db
          .select({
            profileId: embarcaciones.profileId,
            modelo: embarcaciones.modelo,
            esloraM: embarcaciones.esloraM,
          })
          .from(embarcaciones)
          .where(inArray(embarcaciones.profileId, solicitanteIds))
      : [];

  // Primera embarcación por socio (la más relevante para mostrar)
  const embarcacionPorSocio = new Map<string, { modelo: string | null; esloraM: string | null }>();
  for (const e of embarcacionesRows) {
    if (e.profileId && !embarcacionPorSocio.has(e.profileId)) {
      embarcacionPorSocio.set(e.profileId, { modelo: e.modelo, esloraM: e.esloraM });
    }
  }

  const solicitudes = rows.map((r) => ({
    id: r.id,
    estado: r.estado,
    motivoRechazo: r.motivoRechazo,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    solicitanteId: r.solicitanteId,
    nombre: r.solicitanteNombre,
    apellido: r.solicitanteApellido,
    email: r.solicitanteEmail,
    telefono: r.solicitanteTelefono,
    tieneEmbarcacion: embarcacionPorSocio.has(r.solicitanteId),
    embarcacion: embarcacionPorSocio.get(r.solicitanteId) ?? null,
  }));

  return (
    <SolicitudesSocioClient
      initialTab={tabDesdeUrl(tab, SOLICITUDES_TAB_IDS, 'pendientes')}
      solicitudes={solicitudes}
    />
  );
}
