import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  areaMarineros,
  areaOperarios,
  embarcaciones,
  espacios,
  memberships,
  naves,
  porteria,
  profiles,
  solicitudesLavado,
  tareas,
} from '@/lib/db/schema';

import { TareasClient } from './tareas-client';

function buildUbicacion(
  naveNombre: string | null,
  espNomenclatura: string | null,
  ubicacionLibre: string | null,
): string | null {
  if (naveNombre && espNomenclatura) return `${naveNombre} — ${espNomenclatura}`;
  if (espNomenclatura) return espNomenclatura;
  return ubicacionLibre ?? null;
}

export default async function TareasPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  const gId = ctx.activeMembership.guarderiaId;
  const isAdmin =
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo';
  const isOperario = ctx.activeMembership.rol === 'operario';
  const isMarinero = ctx.activeMembership.rol === 'marinero';
  // En /tareas, admin, operario y marinero operan al mismo nivel (decisión de
  // producto). El flag fino queda por si alguna sección futura los distingue.
  const canManage = isAdmin || isOperario || isMarinero;

  // Alias para traer al socio dueño de la embarcación (profiles se usa dos veces:
  // una para el operario y otra para el socio).
  const socioProfile = alias(profiles, 'socio_profile');
  // Alias para el espacio y nave asociados a la embarcación de la tarea.
  const embEspacio = alias(espacios, 'emb_espacio');
  const embNave = alias(naves, 'emb_nave');
  // Fallback: embarcación principal del socio cuando la tarea no tiene embarcacionId
  // (p.ej. solicitudes de lavado creadas desde mobile sin vincular embarcación).
  const lavadoEmb = alias(embarcaciones, 'lavado_emb');

  // Staff (operario/marinero, no admin) ve solo tareas de SUS áreas (+ las sin
  // área), y SOLO del tipo que le corresponde: operario → tareas de nave
  // (es_marina=false); marinero → tareas de marina (es_marina=true). El admin/
  // super admin ven todas.
  const soloMisAreas = (isOperario || isMarinero) && !isAdmin;
  let staffAreaIds: string[] = [];
  if (soloMisAreas) {
    const rows = isMarinero
      ? await db
          .select({ areaId: areaMarineros.areaId })
          .from(areaMarineros)
          .where(and(eq(areaMarineros.marineroId, ctx.user.id), eq(areaMarineros.guarderiaId, gId)))
      : await db
          .select({ areaId: areaOperarios.areaId })
          .from(areaOperarios)
          .where(
            and(eq(areaOperarios.operarioId, ctx.user.id), eq(areaOperarios.guarderiaId, gId)),
          );
    staffAreaIds = rows.map((r) => r.areaId);
  }
  const areaCond = soloMisAreas
    ? and(
        eq(tareas.esMarina, isMarinero),
        staffAreaIds.length > 0
          ? or(isNull(tareas.areaId), inArray(tareas.areaId, staffAreaIds))
          : isNull(tareas.areaId),
      )
    : undefined;

  const [listado, operariosList, embarcacionesList] = await Promise.all([
    db
      .select({
        id: tareas.id,
        descripcion: tareas.descripcion,
        nota: tareas.nota,
        estado: tareas.estado,
        fechaHora: tareas.fechaHora,
        createdAt: tareas.createdAt,
        updatedAt: tareas.updatedAt,
        operarioId: tareas.operarioId,
        operarioNombre: profiles.nombre,
        operarioApellido: profiles.apellido,
        operarioEmail: profiles.email,
        embarcacionId: tareas.embarcacionId,
        embarcacionNombre: embarcaciones.nombre,
        embUbicacion: embarcaciones.ubicacion,
        embEspacioNomenclatura: embEspacio.nomenclatura,
        embNaveNombre: embNave.nombre,
        lavadoEmbNombre: lavadoEmb.nombre,
        socioNombre: socioProfile.nombre,
        socioApellido: socioProfile.apellido,
        socioEmail: socioProfile.email,
        solicitudLavadoEstado: solicitudesLavado.estado,
        solicitudDiaUso: solicitudesLavado.diaUso,
        solicitudUpdatedAt: solicitudesLavado.updatedAt,
        porteriaEstado: porteria.estado,
      })
      .from(tareas)
      .leftJoin(profiles, eq(profiles.id, tareas.operarioId))
      .leftJoin(porteria, eq(porteria.id, tareas.porteriaId))
      .leftJoin(embarcaciones, eq(embarcaciones.id, tareas.embarcacionId))
      .leftJoin(socioProfile, eq(socioProfile.id, embarcaciones.profileId))
      .leftJoin(embEspacio, eq(embEspacio.id, embarcaciones.espacioId))
      .leftJoin(embNave, eq(embNave.id, embEspacio.naveId))
      .leftJoin(solicitudesLavado, eq(solicitudesLavado.tareaId, tareas.id))
      .leftJoin(
        lavadoEmb,
        and(
          eq(lavadoEmb.profileId, solicitudesLavado.socioId),
          eq(lavadoEmb.guarderiaId, gId),
          eq(lavadoEmb.esPrincipal, true),
        ),
      )
      .where(
        and(
          eq(tareas.guarderiaId, gId),
          // Operario: solo sus áreas + tareas sin área. Admin: sin filtro.
          areaCond,
        ),
      )
      .orderBy(desc(tareas.createdAt))
      // Sin filtro de estado/fecha acá: el cliente decide qué muestra en el
      // Kanban (oculta cancelada/vencidas) y qué muestra en el Historial (todo,
      // sin filtrar) a partir del mismo listado. Límite más alto porque nada se
      // borra físicamente y el Historial necesita ver hacia atrás.
      .limit(2000),

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
          // Operarios y marineros son asignables a tareas (nave y marina resp.).
          inArray(memberships.rol, ['operario', 'marinero']),
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
    updatedAt: t.updatedAt.toISOString(),
    operarioId: t.operarioId,
    operarioNombre:
      [t.operarioNombre, t.operarioApellido].filter(Boolean).join(' ') || t.operarioEmail || null,
    embarcacionId: t.embarcacionId,
    // Fallback: si la tarea no tiene embarcacionId (lavado desde mobile),
    // usar la embarcación principal del socio.
    embarcacionNombre: t.embarcacionNombre ?? t.lavadoEmbNombre,
    ubicacion: buildUbicacion(t.embNaveNombre, t.embEspacioNomenclatura, t.embUbicacion),
    socioNombre: [t.socioNombre, t.socioApellido].filter(Boolean).join(' ') || t.socioEmail || null,
    solicitudLavadoEstado: t.solicitudLavadoEstado as
      | 'pendiente'
      | 'aceptada'
      | 'lista'
      | 'cancelada'
      | null,
    solicitudDiaUso: t.solicitudDiaUso ?? null,
    solicitudUpdatedAt: t.solicitudUpdatedAt ? t.solicitudUpdatedAt.toISOString() : null,
    // El socio canceló la salida → porteria.estado = 'revocado'. La tarea sigue
    // en 'salida_programada' pero se marca "Cancelada" en el tablero.
    salidaCancelada: t.porteriaEstado === 'revocado',
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
