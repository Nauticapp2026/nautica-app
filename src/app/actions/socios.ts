'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { documentos, embarcaciones, memberships, profiles } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateInviteError } from '@/lib/auth/errors';
import { and, eq } from 'drizzle-orm';

export type CreateSocioData = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion: string;
  tipoDocumento: string;
  numeroDocumento: string;
  razonSocial: string;
  condicionIva: string;
  embarcacionNombre: string;
  matricula: string;
  modelo: string;
  seguro: string;
};

export type SocioResult = { error?: string; socioId?: string };

export async function createSocioAction(data: CreateSocioData): Promise<SocioResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;
  const admin = createAdminClient();
  const emailLower = data.email.toLowerCase().trim();

  // 1. Pre-check: si ya existe un miembro con este email en esta guardería,
  // cortar antes de invitar. Sin este check, inviteUserByEmail puede
  // "re-invitar" a un usuario existente sin error, y el upsert del profile
  // termina sobreescribiendo los datos del miembro existente. Ver bug
  // reportado el 2026-05-11 (admin se cargó como socio con el mail de un
  // mantenimiento y los datos del mantenimiento quedaron pisados).
  const [existingMember] = await db
    .select({ rol: memberships.rol })
    .from(profiles)
    .innerJoin(memberships, eq(memberships.userId, profiles.id))
    .where(and(eq(profiles.email, emailLower), eq(memberships.guarderiaId, gId)))
    .limit(1);

  if (existingMember) {
    return {
      error: `Ya existe un usuario con ese email en esta guardería (rol: ${existingMember.rol}).`,
    };
  }

  // 2. Create auth user and send invite email for password setup
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    emailLower,
    { redirectTo: `${appUrl}/auth/callback?next=/crear-cuenta` },
  );

  if (inviteError) {
    console.error('[createSocioAction] inviteError', { email: emailLower, inviteError });
    return { error: translateInviteError(inviteError.message) };
  }

  const profileId = inviteData.user.id;

  try {
    // 3. Si el profile ya tiene datos cargados (usuario real, no solo row
    // del trigger handle_new_user), no overwriteamos. El profile es global —
    // pertenece al usuario, no a la guardería.
    const [existingProfile] = await db
      .select({ nombre: profiles.nombre })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    const profileTieneData = !!existingProfile?.nombre;

    if (!profileTieneData) {
      await db
        .insert(profiles)
        .values({
          id: profileId,
          email: emailLower,
          nombre: data.nombre.trim() || null,
          apellido: data.apellido.trim() || null,
          telefono: data.telefono.trim() || null,
          direccion: data.direccion.trim() || null,
          tipoDocumento: (data.tipoDocumento || null) as never,
          numeroDocumento: data.numeroDocumento.trim() || null,
          razonSocial: data.razonSocial.trim() || null,
          condicionIva: (data.condicionIva || null) as never,
          estadoSocio: 'activo',
        })
        .onConflictDoUpdate({
          target: profiles.id,
          set: {
            email: emailLower,
            nombre: data.nombre.trim() || null,
            apellido: data.apellido.trim() || null,
            telefono: data.telefono.trim() || null,
            direccion: data.direccion.trim() || null,
            tipoDocumento: (data.tipoDocumento || null) as never,
            numeroDocumento: data.numeroDocumento.trim() || null,
            razonSocial: data.razonSocial.trim() || null,
            condicionIva: (data.condicionIva || null) as never,
            estadoSocio: 'activo',
          },
        });
    }

    // 4. Create membership linking socio to this guardería.
    // El pre-check de arriba garantiza que NO hay membership existente en
    // esta guardería, así que el insert debe tener éxito sí o sí.
    await db.insert(memberships).values({
      userId: profileId,
      guarderiaId: gId,
      rol: 'socio',
      status: 'active',
    });

    // 4. Create embarcación if provided
    if (data.embarcacionNombre.trim()) {
      await db.insert(embarcaciones).values({
        guarderiaId: gId,
        profileId,
        nombre: data.embarcacionNombre.trim(),
        matricula: data.matricula.trim() || null,
        modelo: data.modelo.trim() || null,
        seguro: data.seguro.trim() || null,
      });
    }

    revalidatePath('/usuarios');
    return { socioId: profileId };
  } catch {
    // Clean up orphaned auth user if DB writes fail
    await admin.auth.admin.deleteUser(profileId).catch(() => null);
    return { error: 'Error al registrar el socio. Intentá de nuevo.' };
  }
}

export type UpdateSocioData = {
  socioId: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  tipoDocumento: string;
  numeroDocumento: string;
  direccion: string;
  razonSocial: string;
  condicionIva: string;
};

export async function updateSocioAction(data: UpdateSocioData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;

  // Verificar que el socio pertenezca a la guardería activa.
  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, data.socioId),
        eq(memberships.guarderiaId, gId),
        eq(memberships.rol, 'socio'),
      ),
    )
    .limit(1);
  if (!membership) return { error: 'Socio no pertenece a esta guardería.' };

  const newEmail = data.email.toLowerCase().trim();
  if (!newEmail) return { error: 'El email es obligatorio.' };

  // Si el email cambió, actualizar también en Supabase Auth (es el username de login).
  const [current] = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, data.socioId))
    .limit(1);

  const emailChanged = current && current.email.toLowerCase() !== newEmail;

  if (emailChanged) {
    const admin = createAdminClient();
    const { error: authErr } = await admin.auth.admin.updateUserById(data.socioId, {
      email: newEmail,
      email_confirm: true,
    });
    if (authErr) {
      return { error: translateInviteError(authErr.message) };
    }
  }

  try {
    await db
      .update(profiles)
      .set({
        nombre: data.nombre.trim() || null,
        apellido: data.apellido.trim() || null,
        email: newEmail,
        telefono: data.telefono.trim() || null,
        tipoDocumento: (data.tipoDocumento || null) as never,
        numeroDocumento: data.numeroDocumento.trim() || null,
        direccion: data.direccion.trim() || null,
        razonSocial: data.razonSocial.trim() || null,
        condicionIva: (data.condicionIva || null) as never,
      })
      .where(eq(profiles.id, data.socioId));

    revalidatePath(`/usuarios/${data.socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar los datos.' };
  }
}

// ─── Eliminar socio (soft delete) ────────────────────────────────────────────

/**
 * Soft delete: marca la membership del socio como 'removed' para esta guardería.
 * El listado de socios filtra por status='active', así que desaparece de la UI.
 * Se conserva todo el historial (movimientos, facturas, embarcaciones) intacto.
 */
export async function deleteSocioAction(socioId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;

  try {
    await db
      .update(memberships)
      .set({ status: 'removed' })
      .where(
        and(
          eq(memberships.userId, socioId),
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
        ),
      );

    revalidatePath('/usuarios');
    return {};
  } catch {
    return { error: 'Error al eliminar el socio.' };
  }
}

// ─── Subir documento de un socio ────────────────────────────────────────────

const TIPOS_DOC_ADJUNTO = ['carnet_nautico', 'matricula', 'seguro'] as const;
type TipoDocAdjunto = (typeof TIPOS_DOC_ADJUNTO)[number];
const BUCKET_DOCUMENTOS = 'documentos';

export type UploadDocumentoResult = { error?: string; id?: string };

/**
 * Sube un documento adjunto de un socio al bucket de Supabase Storage y
 * registra la fila en `documentos`. Valida que el socio pertenezca a la
 * guardería activa. Usa el admin client (service_role) para bypassear RLS,
 * porque el admin web sube a nombre del socio (no del admin).
 */
export async function uploadSocioDocumentoAction(
  formData: FormData,
): Promise<UploadDocumentoResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const socioId = String(formData.get('socioId') ?? '');
  const tipo = String(formData.get('tipo') ?? '') as TipoDocAdjunto | '';
  const file = formData.get('file');

  if (!socioId) return { error: 'Falta el socio.' };
  if (!(file instanceof File)) return { error: 'Archivo inválido.' };
  if (file.size === 0) return { error: 'El archivo está vacío.' };
  if (!TIPOS_DOC_ADJUNTO.includes(tipo as TipoDocAdjunto)) {
    return { error: 'Tipo de documento inválido.' };
  }

  // Validar que el socio pertenezca a la guardería activa.
  const guarderiaId = ctx.activeMembership.guarderiaId;
  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, socioId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!membership) return { error: 'Socio no pertenece a esta guardería.' };

  const admin = createAdminClient();

  // Path: {socioId}/{timestamp}-{nombre-archivo}
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${socioId}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await admin.storage.from(BUCKET_DOCUMENTOS).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (uploadErr) {
    return { error: `Error subiendo archivo: ${uploadErr.message}` };
  }

  try {
    const [row] = await db
      .insert(documentos)
      .values({
        profileId: socioId,
        nombre: file.name,
        tipo: tipo as TipoDocAdjunto,
        // Guardamos el path del storage (no una URL pública). Se genera
        // signed URL al momento de mostrar el documento.
        documentoUrl: path,
      })
      .returning({ id: documentos.id });

    return { id: row.id };
  } catch (err) {
    // Si la inserción falla, intentamos limpiar el archivo ya subido
    // para no dejar huérfanos.
    await admin.storage
      .from(BUCKET_DOCUMENTOS)
      .remove([path])
      .catch(() => null);
    return { error: err instanceof Error ? err.message : 'Error al guardar el documento.' };
  }
}

// ─── Eliminar documento de un socio ──────────────────────────────────────────

/**
 * Borra una fila de `documentos` y el archivo del bucket. Valida que el
 * documento pertenezca a un socio de la guardería activa.
 */
export async function deleteSocioDocumentoAction(documentoId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // El documento pertenece a un socio de esta guardería?
  const [doc] = await db
    .select({ id: documentos.id, profileId: documentos.profileId, url: documentos.documentoUrl })
    .from(documentos)
    .innerJoin(memberships, eq(memberships.userId, documentos.profileId))
    .where(and(eq(documentos.id, documentoId), eq(memberships.guarderiaId, guarderiaId)))
    .limit(1);
  if (!doc) return { error: 'Documento no pertenece a esta guardería.' };

  const admin = createAdminClient();

  try {
    await db.delete(documentos).where(eq(documentos.id, documentoId));
  } catch {
    return { error: 'Error al eliminar el documento.' };
  }

  // Borrar el archivo del storage. Si es una URL externa (legacy), no hay
  // path que limpiar — la fila ya se borró y listo.
  if (doc.url && !/^https?:\/\//i.test(doc.url)) {
    await admin.storage
      .from(BUCKET_DOCUMENTOS)
      .remove([doc.url])
      .catch(() => null);
  }

  if (doc.profileId) revalidatePath(`/usuarios/${doc.profileId}`);
  return {};
}
