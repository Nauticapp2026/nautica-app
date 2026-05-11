'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { embarcaciones, memberships } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

export type EmbarcacionInput = {
  nombre: string;
  matricula: string;
  modelo: string;
  seguro: string;
};

export type CreateEmbarcacionData = EmbarcacionInput & { socioId: string };
export type UpdateEmbarcacionData = EmbarcacionInput & { id: string };

function norm(s: string): string | null {
  const t = s.trim();
  return t === '' ? null : t;
}

export async function createEmbarcacionAction(
  data: CreateEmbarcacionData,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;

  if (!data.nombre.trim()) return { error: 'El nombre de la embarcación es obligatorio.' };

  // Verificar que el socio pertenezca a la guardería activa.
  const [member] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, data.socioId), eq(memberships.guarderiaId, gId)))
    .limit(1);
  if (!member) return { error: 'Socio no pertenece a esta guardería.' };

  try {
    const [row] = await db
      .insert(embarcaciones)
      .values({
        guarderiaId: gId,
        profileId: data.socioId,
        nombre: data.nombre.trim(),
        matricula: norm(data.matricula),
        modelo: norm(data.modelo),
        seguro: norm(data.seguro),
      })
      .returning({ id: embarcaciones.id });
    revalidatePath(`/usuarios/${data.socioId}`);
    return { id: row.id };
  } catch {
    return { error: 'Error al crear la embarcación.' };
  }
}

export async function updateEmbarcacionAction(
  data: UpdateEmbarcacionData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;

  if (!data.nombre.trim()) return { error: 'El nombre de la embarcación es obligatorio.' };

  // Validar que la embarcación sea de la guardería activa.
  const [existing] = await db
    .select({ profileId: embarcaciones.profileId })
    .from(embarcaciones)
    .where(and(eq(embarcaciones.id, data.id), eq(embarcaciones.guarderiaId, gId)))
    .limit(1);
  if (!existing) return { error: 'Embarcación no pertenece a esta guardería.' };

  try {
    await db
      .update(embarcaciones)
      .set({
        nombre: data.nombre.trim(),
        matricula: norm(data.matricula),
        modelo: norm(data.modelo),
        seguro: norm(data.seguro),
      })
      .where(eq(embarcaciones.id, data.id));
    if (existing.profileId) revalidatePath(`/usuarios/${existing.profileId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar la embarcación.' };
  }
}

export async function deleteEmbarcacionAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [existing] = await db
    .select({ profileId: embarcaciones.profileId })
    .from(embarcaciones)
    .where(and(eq(embarcaciones.id, id), eq(embarcaciones.guarderiaId, gId)))
    .limit(1);
  if (!existing) return { error: 'Embarcación no pertenece a esta guardería.' };

  try {
    await db.delete(embarcaciones).where(eq(embarcaciones.id, id));
    if (existing.profileId) revalidatePath(`/usuarios/${existing.profileId}`);
    return {};
  } catch {
    return { error: 'Error al eliminar la embarcación.' };
  }
}
