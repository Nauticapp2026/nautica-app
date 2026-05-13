'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { guarderias, platformNotificaciones } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';

const inputSchema = z
  .object({
    titulo: z.string().trim().min(1, 'El título es obligatorio.').max(200),
    cuerpo: z.string().trim().min(1, 'El cuerpo es obligatorio.').max(2000),
    audiencia: z.enum(['todas', 'guarderia']),
    guarderiaId: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.audiencia === 'guarderia' && !data.guarderiaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guarderiaId'],
        message: 'Elegí la guardería destinataria.',
      });
    }
  });

export type PlatformNotificacionInput = z.infer<typeof inputSchema>;

export async function createPlatformNotificacionAction(
  input: PlatformNotificacionInput,
): Promise<{ error?: string; id?: string }> {
  const { profile } = await requireSuperAdmin();

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const data = parsed.data;

  const guarderiaId = data.audiencia === 'guarderia' ? (data.guarderiaId ?? null) : null;

  if (guarderiaId) {
    const [g] = await db
      .select({ id: guarderias.id })
      .from(guarderias)
      .where(eq(guarderias.id, guarderiaId))
      .limit(1);
    if (!g) return { error: 'La guardería seleccionada no existe.' };
  }

  const [row] = await db
    .insert(platformNotificaciones)
    .values({
      autorId: profile.id,
      titulo: data.titulo,
      cuerpo: data.cuerpo,
      audiencia: data.audiencia,
      guarderiaId,
    })
    .returning({ id: platformNotificaciones.id });

  revalidatePath('/super-admin/notificaciones');
  return { id: row.id };
}

const uuidSchema = z.string().uuid('ID inválido.');

export async function deletePlatformNotificacionAction(id: string): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { error: 'ID inválido.' };

  const [current] = await db
    .select({ id: platformNotificaciones.id, estado: platformNotificaciones.estado })
    .from(platformNotificaciones)
    .where(eq(platformNotificaciones.id, parsed.data))
    .limit(1);

  if (!current) return { error: 'Notificación no encontrada.' };

  await db.delete(platformNotificaciones).where(eq(platformNotificaciones.id, parsed.data));

  revalidatePath('/super-admin/notificaciones');
  return {};
}
