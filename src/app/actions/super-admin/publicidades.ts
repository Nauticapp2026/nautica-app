'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { platformPublicidades } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

const tamanoSchema = z.enum(['350x300', '353x119']);

const seccionSchema = z.enum([
  'home',
  'nautishop',
  'mi_club',
  'contactos',
  'solicitud_lavado',
  'acceso_externo',
  'qr',
  'marketplace_embarcacion',
  'marketplace_propiedad',
]);

// Acepta '' o 'YYYY-MM-DD'. La validación lógica (inicio <= fin) se hace
// abajo con .superRefine.
const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
  .or(z.literal(''))
  .optional()
  .nullable();

const inputSchema = z
  .object({
    titulo: z.string().trim().min(1, 'El título es obligatorio.').max(200),
    texto: z.string().trim().max(5000).optional().nullable(),
    tamano: tamanoSchema,
    secciones: z.array(seccionSchema).default([]),
    fechaInicio: fechaSchema,
    fechaFin: fechaSchema,
    linkUrl: z
      .string()
      .trim()
      .url('El link debe ser una URL válida (https://…).')
      .max(2000)
      .optional()
      .nullable()
      .or(z.literal('')),
    publicar: z.boolean(),
    imagenUrls: z.array(z.string().url()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.fechaInicio && data.fechaFin && data.fechaInicio > data.fechaFin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fechaFin'],
        message: 'La fecha de fin no puede ser anterior a la de inicio.',
      });
    }
  });

export type PlatformPublicidadInput = z.infer<typeof inputSchema>;

const BUCKET_PUBLICIDADES = 'publicidades';
const MAX_IMAGEN_BYTES = 8 * 1024 * 1024; // 8 MB
const TIPOS_IMAGEN_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function ensureBucket(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_PUBLICIDADES);
  if (!exists) {
    await admin.storage.createBucket(BUCKET_PUBLICIDADES, { public: true });
  }
}

export async function uploadPlatformPublicidadImagenAction(
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
  const path = `${profile.id}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET_PUBLICIDADES)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (uploadErr) return { error: `Error subiendo imagen: ${uploadErr.message}` };

  const { data: urlData } = admin.storage.from(BUCKET_PUBLICIDADES).getPublicUrl(path);
  return { url: urlData.publicUrl };
}

export async function createPlatformPublicidadAction(
  input: PlatformPublicidadInput,
): Promise<{ error?: string; id?: string }> {
  const { profile } = await requireSuperAdmin();

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const data = parsed.data;
  const linkUrl = data.linkUrl && data.linkUrl !== '' ? data.linkUrl : null;
  const secciones = data.secciones.length > 0 ? data.secciones : null;
  const fechaInicio = data.fechaInicio && data.fechaInicio !== '' ? data.fechaInicio : null;
  const fechaFin = data.fechaFin && data.fechaFin !== '' ? data.fechaFin : null;

  const [row] = await db
    .insert(platformPublicidades)
    .values({
      autorId: profile.id,
      titulo: data.titulo,
      texto: data.texto?.trim() || null,
      tamano: data.tamano,
      secciones,
      fechaInicio,
      fechaFin,
      linkUrl,
      publicar: data.publicar,
      imagenUrls: data.imagenUrls.length > 0 ? data.imagenUrls : null,
    })
    .returning({ id: platformPublicidades.id });

  revalidatePath('/super-admin/publicidades');
  return { id: row.id };
}

export async function updatePlatformPublicidadAction(
  id: string,
  input: PlatformPublicidadInput,
): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const data = parsed.data;
  const linkUrl = data.linkUrl && data.linkUrl !== '' ? data.linkUrl : null;
  const secciones = data.secciones.length > 0 ? data.secciones : null;
  const fechaInicio = data.fechaInicio && data.fechaInicio !== '' ? data.fechaInicio : null;
  const fechaFin = data.fechaFin && data.fechaFin !== '' ? data.fechaFin : null;

  const [current] = await db
    .select({ id: platformPublicidades.id })
    .from(platformPublicidades)
    .where(eq(platformPublicidades.id, id))
    .limit(1);

  if (!current) return { error: 'Publicidad no encontrada.' };

  await db
    .update(platformPublicidades)
    .set({
      titulo: data.titulo,
      texto: data.texto?.trim() || null,
      tamano: data.tamano,
      secciones,
      fechaInicio,
      fechaFin,
      linkUrl,
      publicar: data.publicar,
      imagenUrls: data.imagenUrls.length > 0 ? data.imagenUrls : null,
      updatedAt: new Date(),
    })
    .where(eq(platformPublicidades.id, id));

  revalidatePath('/super-admin/publicidades');
  return {};
}

export async function deletePlatformPublicidadAction(id: string): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const [current] = await db
    .select({ id: platformPublicidades.id })
    .from(platformPublicidades)
    .where(eq(platformPublicidades.id, id))
    .limit(1);

  if (!current) return { error: 'Publicidad no encontrada.' };

  await db.delete(platformPublicidades).where(eq(platformPublicidades.id, id));

  revalidatePath('/super-admin/publicidades');
  return {};
}
