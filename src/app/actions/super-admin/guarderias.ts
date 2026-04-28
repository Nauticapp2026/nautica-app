'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { guarderias } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';

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
