'use server';

import { revalidatePath } from 'next/cache';
import { desc } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { terminosVersiones } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';

const publicarSchema = z.object({
  contenido: z
    .string()
    .trim()
    .min(50, 'El contenido es demasiado corto.')
    .max(100_000, 'El contenido es demasiado largo.'),
});

export async function publicarVersionTerminosAction(
  input: z.infer<typeof publicarSchema>,
): Promise<{ error?: string; version?: number }> {
  const { profile } = await requireSuperAdmin();

  const parsed = publicarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }

  // La nueva versión es max(version) + 1. Si todavía no hay ninguna fila
  // (caso muy raro: borraron la versión inicial de la migración), arranca
  // en 1.
  const [ultima] = await db
    .select({ version: terminosVersiones.version })
    .from(terminosVersiones)
    .orderBy(desc(terminosVersiones.version))
    .limit(1);
  const nuevaVersion = (ultima?.version ?? 0) + 1;

  await db.insert(terminosVersiones).values({
    version: nuevaVersion,
    contenido: parsed.data.contenido,
    publicadoPor: profile.id,
  });

  revalidatePath('/super-admin/terminos');
  revalidatePath('/terminos');
  return { version: nuevaVersion };
}
