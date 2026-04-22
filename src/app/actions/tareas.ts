'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { tareas, memberships, embarcaciones } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { ESTADOS_TAREA, type EstadoTarea } from '@/app/(dashboard)/tareas/constants';

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
  return ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
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
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden crear tareas.' };

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
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar tareas.' };

  const descripcion = data.descripcion.trim();
  if (!descripcion) return { error: 'La descripción es obligatoria.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: tareas.id })
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

  await db
    .update(tareas)
    .set({
      descripcion,
      nota: data.nota?.trim() || null,
      operarioId: data.operarioId || null,
      embarcacionId: data.embarcacionId || null,
      estado: (data.estado ?? 'preparar') as EstadoTarea,
      fechaHora: data.fechaHora ? new Date(data.fechaHora) : null,
    })
    .where(and(eq(tareas.id, data.id), eq(tareas.guarderiaId, gId)));

  revalidatePath('/tareas');
  return {};
}

// ─── Mover estado (admin u operario asignado) ───────────────────────────────

export async function updateTareaEstadoAction(
  tareaId: string,
  estado: EstadoTarea,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  if (!ESTADOS_TAREA.includes(estado)) return { error: 'Estado inválido.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: tareas.id, operarioId: tareas.operarioId })
    .from(tareas)
    .where(and(eq(tareas.id, tareaId), eq(tareas.guarderiaId, gId)))
    .limit(1);
  if (!current) return { error: 'Tarea no encontrada.' };

  const canMove =
    isAdmin(ctx) || (ctx.activeMembership.rol === 'operario' && current.operarioId === ctx.user.id);
  if (!canMove) return { error: 'No tenés permiso para mover esta tarea.' };

  await db
    .update(tareas)
    .set({ estado })
    .where(and(eq(tareas.id, tareaId), eq(tareas.guarderiaId, gId)));

  revalidatePath('/tareas');
  return {};
}

// ─── Eliminar (admin) ───────────────────────────────────────────────────────

export async function deleteTareaAction(tareaId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar tareas.' };

  const gId = ctx.activeMembership.guarderiaId;
  await db.delete(tareas).where(and(eq(tareas.id, tareaId), eq(tareas.guarderiaId, gId)));

  revalidatePath('/tareas');
  return {};
}
