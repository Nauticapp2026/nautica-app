'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { platformNotificaciones } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';
import { processPendingNotifications } from '@/lib/push-notifications';
import { TURNOS, momentoDelTurno } from '@/app/super-admin/notificaciones/turnos';

const audienciaSchema = z.enum([
  'todos',
  'con_club',
  'sin_club',
  'plan_esencial',
  'plan_premium',
  'plan_elite',
]);

const inputSchema = z
  .object({
    titulo: z.string().trim().min(1, 'El título es obligatorio.').max(200),
    cuerpo: z.string().trim().min(1, 'El cuerpo es obligatorio.').max(2000),
    audiencia: audienciaSchema,
    // Programación opcional: si no vienen, la notificación sale en el acto.
    // Van juntos o no van — un día sin turno (o al revés) es un error.
    programadaFecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
      .optional(),
    programadaTurno: z.enum(TURNOS).optional(),
  })
  .refine((d) => Boolean(d.programadaFecha) === Boolean(d.programadaTurno), {
    message: 'Para programar el envío hace falta elegir el día y el turno.',
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

  // Un turno que ya pasó saldría en la corrida siguiente del cron, no en el
  // momento que eligió el usuario. Mejor rechazarlo que enviar a destiempo.
  let programadaPara: Date | null = null;
  if (data.programadaFecha && data.programadaTurno) {
    programadaPara = momentoDelTurno(data.programadaFecha, data.programadaTurno);
    if (programadaPara.getTime() <= Date.now()) {
      return { error: 'Ese día y turno ya pasaron. Elegí un horario futuro.' };
    }
  }

  const [row] = await db
    .insert(platformNotificaciones)
    .values({
      autorId: profile.id,
      titulo: data.titulo,
      cuerpo: data.cuerpo,
      audiencia: data.audiencia,
      programadaPara,
    })
    .returning({ id: platformNotificaciones.id });

  // Sin programación, el envío se dispara inline para que salga en el acto (el
  // cron corre solo tres veces por día). Si está programada, se deja en cola:
  // la levanta la corrida del cron correspondiente al turno.
  // Errores se logean pero no rompen la creación — la notif queda en
  // 'pendiente' y la próxima corrida del cron la reintenta.
  if (!programadaPara) {
    try {
      await processPendingNotifications({ notifId: row.id });
    } catch (err) {
      console.error('[notificaciones] inline send falló:', err);
    }
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
