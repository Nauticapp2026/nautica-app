'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { platformComunicaciones } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

const tipoSchema = z.enum(['socios', 'publica']);
const categoriaSchema = z.enum(['informacion', 'anuncio', 'evento', 'mantenimiento', 'alerta']);

const inputSchema = z.object({
  titulo: z.string().trim().min(1, 'El título es obligatorio.').max(200),
  texto: z.string().trim().max(5000).optional().nullable(),
  tipo: tipoSchema,
  categoria: categoriaSchema,
  publicar: z.boolean(),
  imagenUrls: z.array(z.string().url()).default([]),
});

export type PlatformComunicacionInput = z.infer<typeof inputSchema>;

const BUCKET_COMUNICACIONES = 'comunicaciones';
const MAX_IMAGEN_BYTES = 8 * 1024 * 1024; // 8 MB
const TIPOS_IMAGEN_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function ensureBucket(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_COMUNICACIONES);
  if (!exists) {
    await admin.storage.createBucket(BUCKET_COMUNICACIONES, { public: true });
  }
}

export async function uploadPlatformComunicacionImagenAction(
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  const { profile } = await requireSuperAdmin();

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'Archivo inválido.' };
  if (file.size === 0) return { error: 'El archivo está vacío.' };
  if (file.size > MAX_IMAGEN_BYTES) return { error: 'La imagen supera el tamaño máximo (8 MB).' };
  if (file.type && !TIPOS_IMAGEN_ACEPTADOS.includes(file.type)) {
    return { error: 'Formato no soportado. Usá JPG, PNG, WebP o GIF.' };
  }

  const admin = createAdminClient();
  await ensureBucket(admin);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `_platform/${profile.id}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET_COMUNICACIONES)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (uploadErr) return { error: `Error subiendo imagen: ${uploadErr.message}` };

  const { data: urlData } = admin.storage.from(BUCKET_COMUNICACIONES).getPublicUrl(path);
  return { url: urlData.publicUrl };
}

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
      imagenUrls: data.imagenUrls.length > 0 ? data.imagenUrls : null,
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
      imagenUrls: data.imagenUrls.length > 0 ? data.imagenUrls : null,
      updatedAt: new Date(),
    })
    .where(eq(platformComunicaciones.id, id));

  revalidatePath('/super-admin/comunicaciones');
  return {};
}
