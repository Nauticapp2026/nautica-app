'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { embarcaciones, espacios, memberships } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { cerrarContratoAbierto } from '@/lib/socio-servicios';

export type EmbarcacionInput = {
  nombre: string;
  matricula: string;
  astillero: string;
  modelo: string;
  seguro: string;
  esloraM: string;
};

export type CreateEmbarcacionData = EmbarcacionInput & { socioId: string; esPrincipal?: boolean };
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

  const [member] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, data.socioId), eq(memberships.guarderiaId, gId)))
    .limit(1);
  if (!member) return { error: 'Socio no pertenece a esta guardería.' };

  // Contar cuántas embarcaciones ya tiene para saber si será la primera.
  const existing = await db
    .select({ id: embarcaciones.id })
    .from(embarcaciones)
    .where(and(eq(embarcaciones.profileId, data.socioId), eq(embarcaciones.guarderiaId, gId)));

  const esPrimera = existing.length === 0;
  const marcarPrincipal = esPrimera || data.esPrincipal === true;

  try {
    if (marcarPrincipal && !esPrimera) {
      // Desmarcar las existentes antes de insertar la nueva como principal.
      await db
        .update(embarcaciones)
        .set({ esPrincipal: false })
        .where(and(eq(embarcaciones.profileId, data.socioId), eq(embarcaciones.guarderiaId, gId)));
    }

    const [row] = await db
      .insert(embarcaciones)
      .values({
        guarderiaId: gId,
        profileId: data.socioId,
        nombre: data.nombre.trim(),
        matricula: norm(data.matricula),
        astillero: norm(data.astillero),
        modelo: norm(data.modelo),
        seguro: norm(data.seguro),
        esloraM: norm(data.esloraM),
        esPrincipal: marcarPrincipal,
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
        astillero: norm(data.astillero),
        modelo: norm(data.modelo),
        seguro: norm(data.seguro),
        esloraM: norm(data.esloraM),
      })
      .where(eq(embarcaciones.id, data.id));

    if (existing.profileId) revalidatePath(`/usuarios/${existing.profileId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar la embarcación.' };
  }
}

export async function setPrincipalAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [target] = await db
    .select({ profileId: embarcaciones.profileId })
    .from(embarcaciones)
    .where(and(eq(embarcaciones.id, id), eq(embarcaciones.guarderiaId, gId)))
    .limit(1);
  if (!target) return { error: 'Embarcación no pertenece a esta guardería.' };

  try {
    if (target.profileId) {
      // Desmarcar todas las demás del mismo socio.
      await db
        .update(embarcaciones)
        .set({ esPrincipal: false })
        .where(
          and(
            eq(embarcaciones.profileId, target.profileId),
            eq(embarcaciones.guarderiaId, gId),
            ne(embarcaciones.id, id),
          ),
        );
    }
    await db.update(embarcaciones).set({ esPrincipal: true }).where(eq(embarcaciones.id, id));

    if (target.profileId) revalidatePath(`/usuarios/${target.profileId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar la embarcación principal.' };
  }
}

export async function deleteEmbarcacionAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [existing] = await db
    .select({
      profileId: embarcaciones.profileId,
      esPrincipal: embarcaciones.esPrincipal,
      espacioId: embarcaciones.espacioId,
    })
    .from(embarcaciones)
    .where(and(eq(embarcaciones.id, id), eq(embarcaciones.guarderiaId, gId)))
    .limit(1);
  if (!existing) return { error: 'Embarcación no pertenece a esta guardería.' };

  try {
    // Si la embarcación tenía un espacio asignado, traer quién lo ocupaba y
    // con qué tarifa antes de liberarlo, para cerrar el contrato en
    // Servicios Contratados.
    const espacioLiberado = existing.espacioId
      ? await db
          .select({ ocupanteId: espacios.ocupanteId, servicioId: espacios.servicioId })
          .from(espacios)
          .where(and(eq(espacios.id, existing.espacioId), eq(espacios.guarderiaId, gId)))
          .limit(1)
          .then((r) => r[0])
      : null;

    await db.delete(embarcaciones).where(eq(embarcaciones.id, id));

    // Si la embarcación tenía un espacio asignado, liberarlo. Sin esto el
    // espacio queda "ocupado" (ocupanteId) para siempre sin ninguna
    // embarcación real ahí, y el cron mensual lo sigue facturando.
    if (existing.espacioId) {
      await db
        .update(espacios)
        .set({ ocupanteId: null, estado: 'disponible', fechaAsignacion: null })
        .where(and(eq(espacios.id, existing.espacioId), eq(espacios.guarderiaId, gId)));

      if (espacioLiberado?.ocupanteId && espacioLiberado.servicioId) {
        await cerrarContratoAbierto({
          socioId: espacioLiberado.ocupanteId,
          servicioId: espacioLiberado.servicioId,
          espacioId: existing.espacioId,
        });
      }
    }

    // Si era la principal y quedan otras, promover la primera restante.
    if (existing.esPrincipal && existing.profileId) {
      const [next] = await db
        .select({ id: embarcaciones.id })
        .from(embarcaciones)
        .where(
          and(eq(embarcaciones.profileId, existing.profileId), eq(embarcaciones.guarderiaId, gId)),
        )
        .limit(1);
      if (next) {
        await db
          .update(embarcaciones)
          .set({ esPrincipal: true })
          .where(eq(embarcaciones.id, next.id));
      }
    }

    if (existing.profileId) revalidatePath(`/usuarios/${existing.profileId}`);
    return {};
  } catch {
    return { error: 'Error al eliminar la embarcación.' };
  }
}
