import { and, asc, desc, eq, isNull, notInArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { embarcaciones, memberships, profiles, solicitudesLavado, tareas } from '@/lib/db/schema';

import { TareasClient } from './tareas-client';

export default async function TareasPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;
  const isAdmin =
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo';
  const isOperario = ctx.activeMembership.rol === 'operario';
  // En /tareas, admin y operario operan al mismo nivel (decisión de
  // producto). El flag fino `isOperario` queda solo por si alguna sección
  // futura del módulo requiere distinguirlos.
  const canManage = isAdmin || isOperario;

  // Alias para traer al socio dueño de la embarcación (profiles se usa dos veces:
  // una para el operario y otra para el socio).
  const socioProfile = alias(profiles, 'socio_profile');

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
        socioNombre: socioProfile.nombre,
        socioApellido: socioProfile.apellido,
        socioEmail: socioProfile.email,
        solicitudLavadoEstado: solicitudesLavado.estado,
      })
      .from(tareas)
      .leftJoin(profiles, eq(profiles.id, tareas.operarioId))
      .leftJoin(embarcaciones, eq(embarcaciones.id, tareas.embarcacionId))
      .leftJoin(socioProfile, eq(socioProfile.id, embarcaciones.profileId))
      .leftJoin(solicitudesLavado, eq(solicitudesLavado.tareaId, tareas.id))
      .where(
        and(
          eq(tareas.guarderiaId, gId),
          or(
            isNull(solicitudesLavado.estado),
            notInArray(solicitudesLavado.estado, ['lista', 'cancelada']),
          ),
        ),
      )
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
    estado: (t.estado ?? 'preparar') as
      | 'salida_programada'
      | 'preparar'
      | 'navegando'
      | 'guardada'
      | 'lavado',
    fechaHora: t.fechaHora ? t.fechaHora.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    operarioId: t.operarioId,
    operarioNombre:
      [t.operarioNombre, t.operarioApellido].filter(Boolean).join(' ') || t.operarioEmail || null,
    embarcacionId: t.embarcacionId,
    embarcacionNombre: t.embarcacionNombre,
    socioNombre: [t.socioNombre, t.socioApellido].filter(Boolean).join(' ') || t.socioEmail || null,
    solicitudLavadoEstado: t.solicitudLavadoEstado as
      | 'pendiente'
      | 'aceptada'
      | 'lista'
      | 'cancelada'
      | null,
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
      canCreate={canManage}
      canEditAll={canManage}
      currentUserId={ctx.user.id}
      isOperario={isOperario}
    />
  );
}
