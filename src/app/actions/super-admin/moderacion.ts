'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { comunicaciones, publicaciones } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';

export async function deleteComunicacionClubAction(id: string): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const [current] = await db
    .select({ id: comunicaciones.id })
    .from(comunicaciones)
    .where(eq(comunicaciones.id, id))
    .limit(1);

  if (!current) return { error: 'Comunicación no encontrada.' };

  await db.delete(comunicaciones).where(eq(comunicaciones.id, id));

  revalidatePath('/super-admin/moderacion');
  return {};
}

export async function deletePublicacionClubAction(id: string): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const [current] = await db
    .select({ id: publicaciones.id })
    .from(publicaciones)
    .where(eq(publicaciones.id, id))
    .limit(1);

  if (!current) return { error: 'Publicación no encontrada.' };

  await db.delete(publicaciones).where(eq(publicaciones.id, id));

  revalidatePath('/super-admin/moderacion');
  return {};
}
