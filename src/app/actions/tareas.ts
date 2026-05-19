'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { tareas, memberships, embarcaciones, guarderias, solicitudesLavado } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { sendPushToUser } from '@/lib/push-notifications';
import {
  ESTADOS_SOLICITUD_LAVADO,
  ESTADOS_TAREA,
  ESTADOS_TAREA_TERMINALES,
  type EstadoSolicitudLavado,
  type EstadoTarea,
} from '@/app/(dashboard)/tareas/constants';

export type CreateTareaData = {
  descripcion: string;
  nota?: string | null;
  operarioId?: string | null;
  embarcacionId?: string | null;
  estado?: EstadoTarea;
  fechaHora?: string | null; // ISO datetime-local
};

export type UpdateTareaData = CreateTareaData & { id: string };

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

// Quién puede gestionar el módulo /tareas (CRUD + asignar + mover): admin y
// operario. Decisión de producto: el operario opera de igual a igual con el
// admin en este módulo (no así en el resto del back-office).
function canManageTareas(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return isAdmin(ctx) || ctx.activeMembership.rol === 'operario';
}

async function validateOperarioBelongsToGuarderia(
  operarioId: string,
  guarderiaId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, operarioId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function validateEmbarcacionBelongsToGuarderia(
  embarcacionId: string,
  guarderiaId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: embarcaciones.id })
    .from(embarcaciones)
    .where(and(eq(embarcaciones.id, embarcacionId), eq(embarcaciones.guarderiaId, guarderiaId)))
    .limit(1);
  return Boolean(row);
}

// ─── Crear ──────────────────────────────────────────────────────────────────

export async function createTareaAction(
  data: CreateTareaData,
): Promise<{ error?: string; tareaId?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!canManageTareas(ctx)) return { error: 'No tenés permiso para crear tareas.' };

  const descripcion = data.descripcion.trim();
  if (!descripcion) return { error: 'La descripción es obligatoria.' };

  const gId = ctx.activeMembership.guarderiaId;

  if (data.operarioId && !(await validateOperarioBelongsToGuarderia(data.operarioId, gId))) {
    return { error: 'El operario no pertenece a esta guardería.' };
  }
  if (
    data.embarcacionId &&
    !(await validateEmbarcacionBelongsToGuarderia(data.embarcacionId, gId))
  ) {
    return { error: 'La embarcación no pertenece a esta guardería.' };
  }

  const [row] = await db
    .insert(tareas)
    .values({
      guarderiaId: gId,
      descripcion,
      nota: data.nota?.trim() || null,
      operarioId: data.operarioId || null,
      embarcacionId: data.embarcacionId || null,
      estado: (data.estado ?? 'preparar') as EstadoTarea,
      fechaHora: data.fechaHora ? new Date(data.fechaHora) : null,
    })
    .returning({ id: tareas.id });

  revalidatePath('/tareas');
  return { tareaId: row.id };
}

// ─── Update completo (admin) ────────────────────────────────────────────────

export async function updateTareaAction(data: UpdateTareaData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!canManageTareas(ctx)) return { error: 'No tenés permiso para editar tareas.' };

  const descripcion = data.descripcion.trim();
  if (!descripcion) return { error: 'La descripción es obligatoria.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: tareas.id, estado: tareas.estado })
    .from(tareas)
    .where(and(eq(tareas.id, data.id), eq(tareas.guarderiaId, gId)))
    .limit(1);
  if (!current) return { error: 'Tarea no encontrada.' };

  if (data.operarioId && !(await validateOperarioBelongsToGuarderia(data.operarioId, gId))) {
    return { error: 'El operario no pertenece a esta guardería.' };
  }
  if (
    data.embarcacionId &&
    !(await validateEmbarcacionBelongsToGuarderia(data.embarcacionId, gId))
  ) {
    return { error: 'La embarcación no pertenece a esta guardería.' };
  }

  // Si la tarea ya está en un estado terminal, preservamos el estado actual
  // y solo dejamos editar el resto de los campos (descripción, nota, etc).
  // El cliente además oculta el select de estado en estos casos.
  const estadoActual = current.estado as EstadoTarea;
  const estadoFinal = ESTADOS_TAREA_TERMINALES.includes(estadoActual)
    ? estadoActual
    : ((data.estado ?? 'preparar') as EstadoTarea);

  await db
    .update(tareas)
    .set({
      descripcion,
      nota: data.nota?.trim() || null,
      operarioId: data.operarioId || null,
      embarcacionId: data.embarcacionId || null,
      estado: estadoFinal,
      fechaHora: data.fechaHora ? new Date(data.fechaHora) : null,
    })
    .where(and(eq(tareas.id, data.id), eq(tareas.guarderiaId, gId)));

  revalidatePath('/tareas');
  return {};
}

// ─── Mover estado ───────────────────────────────────────────────────────────

export async function updateTareaEstadoAction(
  tareaId: string,
  estado: EstadoTarea,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!canManageTareas(ctx)) return { error: 'No tenés permiso para mover esta tarea.' };

  if (!ESTADOS_TAREA.includes(estado)) return { error: 'Estado inválido.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: tareas.id, estado: tareas.estado })
    .from(tareas)
    .where(and(eq(tareas.id, tareaId), eq(tareas.guarderiaId, gId)))
    .limit(1);
  if (!current) return { error: 'Tarea no encontrada.' };

  // Una vez que la tarea entra en un estado terminal (guardada/lavado) ya no
  // se puede mover. Guard contra el cliente (UI lo oculta) y también contra
  // race conditions si alguien tenía la pantalla vieja abierta.
  if (ESTADOS_TAREA_TERMINALES.includes(current.estado as EstadoTarea)) {
    return { error: 'Esta tarea ya está en un estado final y no se puede mover.' };
  }

  await db
    .update(tareas)
    .set({ estado })
    .where(and(eq(tareas.id, tareaId), eq(tareas.guarderiaId, gId)));

  revalidatePath('/tareas');
  return {};
}

// ─── Cambiar operario asignado ──────────────────────────────────────────────

export async function updateTareaOperarioAction(
  tareaId: string,
  operarioId: string | null,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!canManageTareas(ctx)) return { error: 'No tenés permiso para asignar tareas.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: tareas.id })
    .from(tareas)
    .where(and(eq(tareas.id, tareaId), eq(tareas.guarderiaId, gId)))
    .limit(1);
  if (!current) return { error: 'Tarea no encontrada.' };

  if (operarioId) {
    const ok = await validateOperarioBelongsToGuarderia(operarioId, gId);
    if (!ok) return { error: 'El operario no pertenece a esta guardería.' };
  }

  await db
    .update(tareas)
    .set({ operarioId })
    .where(and(eq(tareas.id, tareaId), eq(tareas.guarderiaId, gId)));

  revalidatePath('/tareas');
  return {};
}

// ─── Cambiar estado de solicitud de lavado asociada ─────────────────────────

export async function updateSolicitudLavadoEstadoAction(
  tareaId: string,
  estado: EstadoSolicitudLavado,
  motivoCancelacion?: string | null,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!canManageTareas(ctx)) {
    return { error: 'No tenés permiso para actualizar este lavado.' };
  }

  if (!ESTADOS_SOLICITUD_LAVADO.includes(estado as (typeof ESTADOS_SOLICITUD_LAVADO)[number])) {
    return { error: 'Estado inválido.' };
  }

  const motivoLimpio = motivoCancelacion?.trim() || null;
  if (estado === 'cancelada' && !motivoLimpio) {
    return { error: 'Para cancelar una solicitud hay que indicar el motivo.' };
  }

  const gId = ctx.activeMembership.guarderiaId;

  const [tarea] = await db
    .select({ id: tareas.id })
    .from(tareas)
    .where(and(eq(tareas.id, tareaId), eq(tareas.guarderiaId, gId)))
    .limit(1);
  if (!tarea) return { error: 'Tarea no encontrada.' };

  const [solicitud] = await db
    .select({
      id: solicitudesLavado.id,
      socioId: solicitudesLavado.socioId,
      diaUso: solicitudesLavado.diaUso,
    })
    .from(solicitudesLavado)
    .where(and(eq(solicitudesLavado.tareaId, tareaId), eq(solicitudesLavado.guarderiaId, gId)))
    .limit(1);
  if (!solicitud) return { error: 'Esta tarea no tiene una solicitud de lavado asociada.' };

  // El motivo solo persiste cuando se cancela. Si se cambia a otro estado
  // limpiamos el campo para no arrastrar texto viejo de una cancelación
  // que después se revirtió.
  await db
    .update(solicitudesLavado)
    .set({
      estado,
      motivoCancelacion: estado === 'cancelada' ? motivoLimpio : null,
      updatedAt: new Date(),
    })
    .where(eq(solicitudesLavado.id, solicitud.id));

  // Push al celular del socio. La row in-app la inserta el trigger
  // `trg_notificar_solicitud_lavado`; acá solo armamos el copy del push.
  // Fire-and-forget: si Expo falla, no rompemos la acción del admin.
  const [club] = await db
    .select({ nombre: guarderias.nombre })
    .from(guarderias)
    .where(eq(guarderias.id, gId))
    .limit(1);
  const clubNombre = club?.nombre ?? 'tu club';

  let pushTitle: string | null = null;
  let pushBody: string | null = null;
  let pushTipo: string | null = null;
  if (estado === 'aceptada') {
    pushTipo = 'lavado_aceptada';
    pushTitle = 'Solicitud de lavado aceptada';
    pushBody = `${clubNombre} aceptó tu solicitud de lavado.`;
  } else if (estado === 'lista') {
    pushTipo = 'lavado_lista';
    pushTitle = 'Tu lavado está listo';
    pushBody = `${clubNombre} terminó el lavado de tu embarcación.`;
  } else if (estado === 'cancelada') {
    pushTipo = 'lavado_cancelada';
    pushTitle = 'Solicitud de lavado cancelada';
    pushBody = motivoLimpio
      ? `${clubNombre} canceló tu solicitud. Motivo: ${motivoLimpio}`
      : `${clubNombre} canceló tu solicitud de lavado.`;
  }

  if (pushTitle && pushBody && pushTipo) {
    await sendPushToUser({
      userId: solicitud.socioId,
      title: pushTitle,
      body: pushBody,
      data: { tipo: pushTipo, solicitudId: solicitud.id },
    });
  }

  revalidatePath('/tareas');
  return {};
}

// ─── Eliminar ───────────────────────────────────────────────────────────────

export async function deleteTareaAction(tareaId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!canManageTareas(ctx)) return { error: 'No tenés permiso para eliminar tareas.' };

  const gId = ctx.activeMembership.guarderiaId;
  await db.delete(tareas).where(and(eq(tareas.id, tareaId), eq(tareas.guarderiaId, gId)));

  revalidatePath('/tareas');
  return {};
}
