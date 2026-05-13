'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { platformNotificaciones } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';
import { processPendingNotifications } from '@/lib/push-notifications';

const audienciaSchema = z.enum([
  'todos',
  'con_club',
  'sin_club',
  'plan_esencial',
  'plan_club',
  'plan_elite',
]);

const inputSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio.').max(200),
  cuerpo: z.string().trim().min(1, 'El cuerpo es obligatorio.').max(2000),
  audiencia: audienciaSchema,
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

  const [row] = await db
    .insert(platformNotificaciones)
    .values({
      autorId: profile.id,
      titulo: data.titulo,
      cuerpo: data.cuerpo,
      audiencia: data.audiencia,
    })
    .returning({ id: platformNotificaciones.id });

  // Disparamos el envío inline: Vercel Hobby no permite crons sub-diarios, así
  // que el envío real se gatilla acá. El cron diario sirve solo de fallback
  // para reintentar pendientes que fallaron por algún issue transitorio.
  // Errores se logean pero no rompen la creación — la notif queda en
  // 'pendiente' y el cron del día siguiente la levanta.
  try {
    await processPendingNotifications({ notifId: row.id });
  } catch (err) {
    console.error('[notificaciones] inline send falló:', err);
  }

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
