import { redirect } from 'next/navigation';
import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { profiles, memberships, embarcaciones } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { SocioDetail } from './socio-detail';

export default async function SocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;

  const rows = await db
    .select({
      id: profiles.id,
      nombre: profiles.nombre,
      apellido: profiles.apellido,
      email: profiles.email,
      telefono: profiles.telefono,
      tipoDocumento: profiles.tipoDocumento,
      numeroDocumento: profiles.numeroDocumento,
      direccion: profiles.direccion,
      razonSocial: profiles.razonSocial,
      condicionIva: profiles.condicionIva,
      estadoSocio: profiles.estadoSocio,
      deuda: profiles.deuda,
      memberSince: memberships.createdAt,
    })
    .from(profiles)
    .innerJoin(
      memberships,
      and(
        eq(memberships.userId, profiles.id),
        eq(memberships.guarderiaId, gId),
        eq(memberships.rol, 'socio'),
      ),
    )
    .where(eq(profiles.id, id))
    .limit(1);

  if (!rows.length) redirect('/usuarios');

  const socio = rows[0];

  const embarcacionesList = await db
    .select({
      id: embarcaciones.id,
      nombre: embarcaciones.nombre,
      matricula: embarcaciones.matricula,
      modelo: embarcaciones.modelo,
      seguro: embarcaciones.seguro,
    })
    .from(embarcaciones)
    .where(and(eq(embarcaciones.profileId, id), eq(embarcaciones.guarderiaId, gId)));

  return (
    <SocioDetail
      socio={{
        ...socio,
        memberSince: socio.memberSince.toISOString(),
        tipoDocumento: socio.tipoDocumento ?? null,
        condicionIva: socio.condicionIva ?? null,
        estadoSocio: socio.estadoSocio ?? null,
      }}
      embarcaciones={embarcacionesList}
    />
  );
}
