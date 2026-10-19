'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { eq, max } from 'drizzle-orm';
import { z } from 'zod';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { reglamentosClub } from '@/lib/db/schema';
import {
  BUCKET_REGLAMENTO,
  MAX_BYTES_REGLAMENTO,
  MAX_NOVEDADES_REGLAMENTO,
  MAX_TITULO_REGLAMENTO,
  MIME_REGLAMENTO,
} from '@/lib/reglamento';
import { createAdminClient } from '@/lib/supabase/admin';

export type PublicarReglamentoResult = { error?: string; version?: number };

const reglamentoSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(3, 'Escribí un título para el reglamento.')
    .max(MAX_TITULO_REGLAMENTO, `El título puede tener hasta ${MAX_TITULO_REGLAMENTO} caracteres.`),
  novedades: z
    .string()
    .trim()
    .max(
      MAX_NOVEDADES_REGLAMENTO,
      `Lo que cambió puede tener hasta ${MAX_NOVEDADES_REGLAMENTO} caracteres.`,
    ),
});

/**
 * Publica una versión del reglamento del club (mig 0170). La primera vez es la
 * versión 1; cada actualización suma una versión nueva y NO borra las anteriores:
 * quedan como historial con sus aceptaciones. Al haber una versión más nueva, todos
 * los socios tienen que volver a aceptar.
 *
 * Solo admins del club. El PDF se guarda en el bucket privado `documentos` bajo
 * reglamentos/<guarderia_id>/, y la fila siempre se escribe con el guarderia_id del
 * usuario actual (nunca uno que venga del cliente).
 */
export async function publicarReglamentoAction(
  formData: FormData,
): Promise<PublicarReglamentoResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };
  if (!ADMIN_ROLES.includes(ctx.activeMembership.rol)) {
    return { error: 'Solo los administradores pueden publicar el reglamento.' };
  }
  const gId = ctx.activeMembership.guarderiaId;

  const parsed = reglamentoSchema.safeParse({
    titulo: formData.get('titulo') ?? '',
    novedades: formData.get('novedades') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: 'Elegí el PDF del reglamento.' };
  }
  if (archivo.type !== MIME_REGLAMENTO) {
    return { error: 'El reglamento tiene que ser un archivo PDF.' };
  }
  if (archivo.size > MAX_BYTES_REGLAMENTO) {
    return { error: 'El PDF pesa más de 8 MB. Comprimilo e intentá de nuevo.' };
  }
  const bytes = Buffer.from(await archivo.arrayBuffer());
  // El tipo que declara el navegador no alcanza: se mira la firma real del archivo.
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { error: 'El archivo no es un PDF válido.' };
  }

  const admin = createAdminClient();
  const path = `reglamentos/${gId}/${randomUUID()}.pdf`;
  const { error: uploadErr } = await admin.storage
    .from(BUCKET_REGLAMENTO)
    .upload(path, bytes, { contentType: MIME_REGLAMENTO, upsert: false });
  if (uploadErr) return { error: `No se pudo subir el PDF: ${uploadErr.message}` };

  try {
    const version = await db.transaction(async (tx) => {
      const [fila] = await tx
        .select({ ultima: max(reglamentosClub.version) })
        .from(reglamentosClub)
        .where(eq(reglamentosClub.guarderiaId, gId));
      const siguiente = (fila?.ultima ?? 0) + 1;
      await tx.insert(reglamentosClub).values({
        guarderiaId: gId,
        version: siguiente,
        titulo: parsed.data.titulo,
        novedades: parsed.data.novedades === '' ? null : parsed.data.novedades,
        archivoPath: path,
        archivoNombre: archivo.name.slice(0, 200),
        publicadoPor: ctx.user.id,
      });
      return siguiente;
    });

    revalidatePath('/configuracion');
    return { version };
  } catch (e) {
    // El PDF ya subido queda huérfano: se borra para no acumular archivos sin fila.
    await admin.storage
      .from(BUCKET_REGLAMENTO)
      .remove([path])
      .catch(() => null);
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('reglamentos_club_version_unica')) {
      return { error: 'Se publicó otra versión al mismo tiempo. Intentá de nuevo.' };
    }
    return { error: 'No se pudo publicar el reglamento.' };
  }
}
