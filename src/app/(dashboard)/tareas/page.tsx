import { and, asc, desc, eq } from 'drizzle-orm';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { embarcaciones, memberships, profiles, tareas } from '@/lib/db/schema';

import { TareasClient } from './tareas-client';

export default async function TareasPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;
  const isAdmin = ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
  const isOperario = ctx.activeMembership.rol === 'operario';

  const [listado, operariosList, embarcacionesList] = await Promise.all([
    db
      .select({
        id: tareas.id,
        descripcion: tareas.descripcion,
        nota: tareas.nota,
        estado: tareas.estado,
        fechaHora: tareas.fechaHora,
        createdAt: tareas.createdAt,
        operarioId: tareas.operarioId,
        operarioNombre: profiles.nombre,
        operarioApellido: profiles.apellido,
        operarioEmail: profiles.email,
        embarcacionId: tareas.embarcacionId,
        embarcacionNombre: embarcaciones.nombre,
      })
      .from(tareas)
      .leftJoin(profiles, eq(profiles.id, tareas.operarioId))
      .leftJoin(embarcaciones, eq(embarcaciones.id, tareas.embarcacionId))
      .where(eq(tareas.guarderiaId, gId))
      .orderBy(desc(tareas.createdAt))
      .limit(500),

    db
      .select({
        id: profiles.id,
        nombre: profiles.nombre,
        apellido: profiles.apellido,
        email: profiles.email,
      })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .where(
        and(
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'operario'),
          eq(memberships.status, 'active'),
        ),
      )
      .orderBy(asc(profiles.apellido), asc(profiles.nombre)),

    db
      .select({
        id: embarcaciones.id,
        nombre: embarcaciones.nombre,
        matricula: embarcaciones.matricula,
      })
      .from(embarcaciones)
      .where(eq(embarcaciones.guarderiaId, gId))
      .orderBy(asc(embarcaciones.nombre)),
  ]);

  const tareasRows = listado.map((t) => ({
    id: t.id,
    descripcion: t.descripcion,
    nota: t.nota,
    estado: (t.estado ?? 'preparar') as 'preparar' | 'navegando' | 'guardada' | 'lavado',
    fechaHora: t.fechaHora ? t.fechaHora.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    operarioId: t.operarioId,
    operarioNombre:
      [t.operarioNombre, t.operarioApellido].filter(Boolean).join(' ') || t.operarioEmail || null,
    embarcacionId: t.embarcacionId,
    embarcacionNombre: t.embarcacionNombre,
  }));

  const operarios = operariosList.map((o) => ({
    id: o.id,
    nombre: [o.nombre, o.apellido].filter(Boolean).join(' ') || o.email,
  }));

  const embarcacionesOpts = embarcacionesList.map((e) => ({
    id: e.id,
    nombre: e.matricula ? `${e.nombre} (${e.matricula})` : e.nombre,
  }));

  return (
    <TareasClient
      tareas={tareasRows}
      operarios={operarios}
      embarcaciones={embarcacionesOpts}
      canCreate={isAdmin}
      canEditAll={isAdmin}
      currentUserId={ctx.user.id}
      isOperario={isOperario}
    />
  );
}
