'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { platformComunicaciones } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';

const tipoSchema = z.enum(['socios', 'publica']);
const categoriaSchema = z.enum(['informacion', 'anuncio', 'evento', 'mantenimiento', 'alerta']);

const inputSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio.').max(200),
  texto: z.string().trim().max(5000).optional().nullable(),
  tipo: tipoSchema,
  categoria: categoriaSchema,
  publicar: z.boolean(),
});

export type PlatformComunicacionInput = z.infer<typeof inputSchema>;

export async function createPlatformComunicacionAction(
  input: PlatformComunicacionInput,
): Promise<{ error?: string; id?: string }> {
  const { profile } = await requireSuperAdmin();

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const data = parsed.data;

  const [row] = await db
    .insert(platformComunicaciones)
    .values({
      autorId: profile.id,
      titulo: data.titulo,
      texto: data.texto?.trim() || null,
      tipo: data.tipo,
      categoria: data.categoria,
      publicar: data.publicar,
      fecha: new Date(),
    })
    .returning({ id: platformComunicaciones.id });

  revalidatePath('/super-admin/comunicaciones');
  return { id: row.id };
}

export async function updatePlatformComunicacionAction(
  id: string,
  input: PlatformComunicacionInput,
): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const data = parsed.data;

  const [current] = await db
    .select({ id: platformComunicaciones.id })
    .from(platformComunicaciones)
    .where(eq(platformComunicaciones.id, id))
    .limit(1);

  if (!current) return { error: 'Comunicación no encontrada.' };

  await db
    .update(platformComunicaciones)
    .set({
      titulo: data.titulo,
      texto: data.texto?.trim() || null,
      tipo: data.tipo,
      categoria: data.categoria,
      publicar: data.publicar,
      updatedAt: new Date(),
    })
    .where(eq(platformComunicaciones.id, id));

  revalidatePath('/super-admin/comunicaciones');
  return {};
}
