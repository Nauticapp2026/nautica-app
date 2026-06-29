import { and, eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { embarcaciones, memberships, profiles } from '@/lib/db/schema';

import { CobranzaClient, type SocioOption } from './cobranza-client';

export default async function CobranzasPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;

  const [socios, barcos] = await Promise.all([
    db
      .select({
        id: profiles.id,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        numeroSocio: memberships.numeroSocio,
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
      .orderBy(profiles.apellido, profiles.nombre),

    db
      .select({
        profileId: embarcaciones.profileId,
        nombre: embarcaciones.nombre,
        matricula: embarcaciones.matricula,
      })
      .from(embarcaciones)
      .where(eq(embarcaciones.guarderiaId, gId)),
  ]);

  // Agrupar embarcaciones (nombre/matrícula) por socio para el filtro.
  const barcosPorSocio = new Map<string, string[]>();
  for (const b of barcos) {
    if (!b.profileId) continue;
    const arr = barcosPorSocio.get(b.profileId) ?? [];
    if (b.nombre) arr.push(b.nombre);
    if (b.matricula) arr.push(b.matricula);
    barcosPorSocio.set(b.profileId, arr);
  }

  const sociosOptions: SocioOption[] = socios.map((s) => ({
    id: s.id,
    nombre: [s.nombre, s.apellido].filter(Boolean).join(' ') || 'Sin nombre',
    numeroSocio: s.numeroSocio,
    embarcaciones: barcosPorSocio.get(s.id) ?? [],
  }));

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="page-title">Registro de Cobranza</h1>
        <p className="page-subtitle">
          Registrá los pagos de tus socios y aplicalos a sus comprobantes.
        </p>
      </div>
      <CobranzaClient socios={sociosOptions} />
    </div>
  );
}
