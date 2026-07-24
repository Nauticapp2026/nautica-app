'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { guarderias } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';
import { despacharInvitacionesPendientes } from '@/lib/equipo-invitaciones';

const uuidSchema = z.string().uuid('ID inválido.');

export async function deleteGuarderiaAction(guarderiaId: string): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = uuidSchema.safeParse(guarderiaId);
  if (!parsed.success) return { error: 'ID inválido.' };

  // Cascade desde guarderias borra memberships, espacios, embarcaciones,
  // facturación, etc. Las cuentas (auth.users / profiles) NO se borran:
  // son globales a la plataforma y un user puede pertenecer a varias
  // guarderías. Para borrar cuentas, usar el panel de Usuarios.
  await db.delete(guarderias).where(eq(guarderias.id, parsed.data));

  revalidatePath('/super-admin/guarderias');
  revalidatePath('/super-admin');
  return {};
}

const setActivaSchema = z.object({
  guarderiaId: z.string().uuid('ID inválido.'),
  activa: z.boolean(),
});

export async function setGuarderiaActivaAction(
  input: z.infer<typeof setActivaSchema>,
): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = setActivaSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos.' };

  await db
    .update(guarderias)
    .set({ activa: parsed.data.activa, updatedAt: new Date() })
    .where(eq(guarderias.id, parsed.data.guarderiaId));

  // Al dar de alta la guardería salen los mails de invitación al equipo que
  // quedaron encolados durante el onboarding. Los que fallan quedan en la
  // cola y se reintentan si se vuelve a activar.
  if (parsed.data.activa) {
    const { enviadas, errores } = await despacharInvitacionesPendientes(parsed.data.guarderiaId);
    if (errores.length > 0) {
      console.error('[setGuarderiaActivaAction] invitaciones con error', { enviadas, errores });
    }
  }

  revalidatePath('/super-admin/guarderias');
  return {};
}
