import { desc, eq } from 'drizzle-orm';
import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { profiles, solicitudesMembership } from '@/lib/db/schema';
import { SolicitudesSocioClient } from './solicitudes-socio-client';

export default async function SolicitudesSocioPage() {
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
  }));

  return <SolicitudesSocioClient solicitudes={solicitudes} />;
}
