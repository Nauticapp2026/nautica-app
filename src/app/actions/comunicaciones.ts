'use server';

import { revalidatePath } from 'next/cache';
import { and, count as sqlCount, eq, gte } from 'drizzle-orm';

import { db } from '@/lib/db';
import { comunicaciones } from '@/lib/db/schema';
import {
  getGuarderiaPlanSlug,
  getPlanLimitsForSlug,
  mensajeUpsellPlan,
} from '@/lib/pricing/limits';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

const TIPOS = ['socios', 'publica'] as const;
type Tipo = (typeof TIPOS)[number];

const CATEGORIAS = ['informacion', 'anuncio', 'evento', 'mantenimiento', 'alerta'] as const;
type Categoria = (typeof CATEGORIAS)[number];

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

export type ComunicacionInput = {
  titulo: string;
  texto: string;
  tipo: Tipo;
  categoria: Categoria;
  publicar: boolean;
  imagenUrls: string[];
};

export async function uploadComunicacionImagenAction(
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
    .from(BUCKET_COMUNICACIONES)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (uploadErr) return { error: `Error subiendo imagen: ${uploadErr.message}` };

  const { data: urlData } = admin.storage.from(BUCKET_COMUNICACIONES).getPublicUrl(path);
  return { url: urlData.publicUrl };
}

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

function validar(input: ComunicacionInput): string | null {
  if (!input.titulo.trim()) return 'El título es obligatorio.';
  if (!TIPOS.includes(input.tipo)) return 'Tipo de comunicación inválido.';
  if (!CATEGORIAS.includes(input.categoria)) return 'Categoría inválida.';
  return null;
}

export async function createComunicacionAction(
  input: ComunicacionInput,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden crear comunicaciones.' };

  const err = validar(input);
  if (err) return { error: err };

  const guarderiaId = ctx.activeMembership.guarderiaId;
  const featureId = input.tipo === 'socios' ? 'com_cerrada' : 'com_abierta';
  const planSlug = await getGuarderiaPlanSlug(guarderiaId);
  const limits = await getPlanLimitsForSlug(planSlug, [featureId]);
  const tipoLimit = limits[featureId];

  if (tipoLimit === 0) {
    const base =
      input.tipo === 'publica'
        ? 'Tu plan no incluye comunicaciones públicas.'
        : 'Tu plan no incluye comunicaciones para socios.';
    return { error: `${base} ${mensajeUpsellPlan(planSlug)}` };
  }

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [{ used }] = await db
    .select({ used: sqlCount() })
    .from(comunicaciones)
    .where(
      and(
        eq(comunicaciones.guarderiaId, guarderiaId),
        eq(comunicaciones.tipo, input.tipo),
        gte(comunicaciones.createdAt, startOfMonth),
      ),
    );

  if (Number(used) >= tipoLimit) {
    return {
      error: `Alcanzaste el límite de ${tipoLimit} comunicación${tipoLimit !== 1 ? 'es' : ''} de este tipo para este mes. ${mensajeUpsellPlan(planSlug)}`,
    };
  }

  const [row] = await db
    .insert(comunicaciones)
    .values({
      guarderiaId,
      autorId: ctx.profile.id,
      titulo: input.titulo.trim(),
      texto: input.texto.trim() || null,
      tipo: input.tipo,
      categoria: input.categoria,
      publicar: input.publicar,
      fecha: new Date(),
      imagenUrls: input.imagenUrls.length > 0 ? input.imagenUrls : null,
    })
    .returning({ id: comunicaciones.id });

  revalidatePath('/comunicaciones');
  revalidatePath('/dashboard');
  return { id: row.id };
}

export async function updateComunicacionAction(
  id: string,
  input: ComunicacionInput,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar comunicaciones.' };

  const err = validar(input);
  if (err) return { error: err };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: comunicaciones.id })
    .from(comunicaciones)
    .where(and(eq(comunicaciones.id, id), eq(comunicaciones.guarderiaId, guarderiaId)))
    .limit(1);

  if (!current) return { error: 'Comunicación no encontrada.' };

  await db
    .update(comunicaciones)
    .set({
      titulo: input.titulo.trim(),
      texto: input.texto.trim() || null,
      tipo: input.tipo,
      categoria: input.categoria,
      publicar: input.publicar,
      imagenUrls: input.imagenUrls.length > 0 ? input.imagenUrls : null,
      updatedAt: new Date(),
    })
    .where(eq(comunicaciones.id, id));

  revalidatePath('/comunicaciones');
  revalidatePath('/dashboard');
  return {};
}

export async function deleteComunicacionAction(id: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar comunicaciones.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [current] = await db
    .select({ id: comunicaciones.id })
    .from(comunicaciones)
    .where(and(eq(comunicaciones.id, id), eq(comunicaciones.guarderiaId, guarderiaId)))
    .limit(1);

  if (!current) return { error: 'Comunicación no encontrada.' };

  await db.delete(comunicaciones).where(eq(comunicaciones.id, id));

  revalidatePath('/comunicaciones');
  revalidatePath('/dashboard');
  return {};
}
