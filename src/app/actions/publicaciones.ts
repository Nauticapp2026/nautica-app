'use server';

import { revalidatePath } from 'next/cache';
import { and, count as sqlCount, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { publicaciones } from '@/lib/db/schema';
import { getPlanFeatureLimits } from '@/lib/pricing/limits';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const TIPOS = ['amarra', 'cama'] as const;
type Tipo = (typeof TIPOS)[number];

const ESTADOS = ['borrador', 'publicada'] as const;
type Estado = (typeof ESTADOS)[number];

const SERVICIOS = [
  'agua_potable',
  'conexion_220v',
  'abierto_24hs',
  'combustible',
  'seguridad_24hs',
  'vestuarios',
  'confiteria',
  'lavadero',
  'aire_libre',
  'bajo_techo',
  'sin_arco',
] as const;
type Servicio = (typeof SERVICIOS)[number];

const BUCKET = 'publicaciones';
const MAX_IMAGEN_BYTES = 8 * 1024 * 1024;
const TIPOS_IMAGEN_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function ensureBucket(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    await admin.storage.createBucket(BUCKET, { public: true });
  }
}

export type PublicacionInput = {
  tipo: Tipo;
  ubicacion: string;
  eslora: string;
  manga: string;
  unidadMetraje: 'metros' | 'pies';
  expensas: string;
  precio: string;
  servicios: Servicio[];
  imagenUrls: string[];
  estado: Estado;
};

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

function validar(input: PublicacionInput): string | null {
  if (!TIPOS.includes(input.tipo)) return 'Tipo inválido.';
  if (!ESTADOS.includes(input.estado)) return 'Estado inválido.';
  if (!['metros', 'pies'].includes(input.unidadMetraje)) return 'Unidad inválida.';
  if (input.precio && isNaN(parseFloat(input.precio))) return 'Precio inválido.';
  if (input.eslora && isNaN(parseFloat(input.eslora))) return 'Eslora inválida.';
  if (input.manga && isNaN(parseFloat(input.manga))) return 'Manga inválida.';
  return null;
}

function toNum(v: string): string | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : String(n);
}

export async function uploadPublicacionImagenAction(
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden subir imágenes.' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'Archivo inválido.' };
  if (file.size === 0) return { error: 'El archivo está vacío.' };
  if (file.size > MAX_IMAGEN_BYTES) return { error: 'La imagen supera el tamaño máximo (8 MB).' };
  if (!file.type || !TIPOS_IMAGEN_ACEPTADOS.includes(file.type)) {
    return { error: 'Formato no soportado. Usá JPG, PNG, WebP o GIF.' };
  }

  const admin = createAdminClient();
  await ensureBucket(admin);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${ctx.activeMembership.guarderiaId}/${ctx.profile.id}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });
  if (uploadErr) return { error: `Error subiendo imagen: ${uploadErr.message}` };

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
  return { url: urlData.publicUrl };
}

export async function createPublicacionAction(
  input: PublicacionInput,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden crear publicaciones.' };

  const err = validar(input);
  if (err) return { error: err };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const limits = await getPlanFeatureLimits(guarderiaId, ['nautishop_publicaciones']);
  const limit = limits['nautishop_publicaciones'];
  if (limit === 0) {
    return { error: 'Tu plan no incluye publicaciones. Actualizá a Premium o Elite.' };
  }

  const [{ total }] = await db
    .select({ total: sqlCount() })
    .from(publicaciones)
    .where(eq(publicaciones.guarderiaId, guarderiaId));

  if (Number(total) >= limit) {
    return {
      error: `Alcanzaste el límite de ${limit} publicación${limit > 1 ? 'es' : ''} de tu plan. Eliminá una para poder crear otra.`,
    };
  }

  const [row] = await db
    .insert(publicaciones)
    .values({
      guarderiaId,
      autorId: ctx.profile.id,
      tipo: input.tipo,
      ubicacion: input.ubicacion.trim() || null,
      eslora: toNum(input.eslora),
      manga: toNum(input.manga),
      unidadMetraje: input.unidadMetraje,
      expensas: toNum(input.expensas),
      precio: toNum(input.precio),
      servicios: input.servicios.filter((s): s is Servicio => SERVICIOS.includes(s as Servicio)),
      imagenUrls: input.imagenUrls,
      estado: input.estado,
    })
    .returning({ id: publicaciones.id });

  revalidatePath('/publicaciones');
  return { id: row.id };
}

export async function updatePublicacionAction(
  id: string,
  input: PublicacionInput,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar publicaciones.' };

  const err = validar(input);
  if (err) return { error: err };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: publicaciones.id, createdAt: publicaciones.createdAt })
    .from(publicaciones)
    .where(and(eq(publicaciones.id, id), eq(publicaciones.guarderiaId, guarderiaId)))
    .limit(1);

  if (!current) return { error: 'Publicación no encontrada.' };

  if (Date.now() - current.createdAt.getTime() > EDIT_WINDOW_MS) {
    return { error: 'El plazo de edición de 24 horas ha vencido.' };
  }

  await db
    .update(publicaciones)
    .set({
      tipo: input.tipo,
      ubicacion: input.ubicacion.trim() || null,
      eslora: toNum(input.eslora),
      manga: toNum(input.manga),
      unidadMetraje: input.unidadMetraje,
      expensas: toNum(input.expensas),
      precio: toNum(input.precio),
      servicios: input.servicios.filter((s): s is Servicio => SERVICIOS.includes(s as Servicio)),
      imagenUrls: input.imagenUrls,
      estado: input.estado,
      updatedAt: new Date(),
    })
    .where(eq(publicaciones.id, id));

  revalidatePath('/publicaciones');
  return {};
}

export async function deletePublicacionAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar publicaciones.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  await db
    .delete(publicaciones)
    .where(and(eq(publicaciones.id, id), eq(publicaciones.guarderiaId, guarderiaId)));

  revalidatePath('/publicaciones');
  return {};
}
