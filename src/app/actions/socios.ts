'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import {
  documentos,
  embarcaciones,
  memberships,
  movimientosCuentaCorriente,
  profiles,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
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

function nextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function createSocioAction(data: CreateSocioData): Promise<SocioResult> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const gId = ctx.activeMembership.guarderiaId;
  const admin = createAdminClient();
  const emailLower = data.email.toLowerCase().trim();

  // 1. Create auth user and send invite email for password setup
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    emailLower,
    { redirectTo: `${appUrl}/auth/callback?next=/crear-cuenta` },
  );

  if (inviteError) {
    if (
      inviteError.message.toLowerCase().includes('already been registered') ||
      inviteError.message.toLowerCase().includes('already exists')
    ) {
      return { error: 'Ya existe una cuenta con ese email.' };
    }
    return { error: 'Error al crear la cuenta del socio. Verificá el email e intentá de nuevo.' };
  }

  const profileId = inviteData.user.id;

  try {
    // 2. Upsert profile (in case Supabase trigger already created a minimal row)
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

    // 3. Create membership linking socio to this guardería
    await db
      .insert(memberships)
      .values({
        userId: profileId,
        guarderiaId: gId,
        rol: 'socio',
        status: 'active',
      })
      .onConflictDoNothing();

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

    // 5. Create first monthly billing movement
    await db.insert(movimientosCuentaCorriente).values({
      socioId: profileId,
      concepto: 'Cuota mensual',
      tipo: 'mensual',
      estado: 'no_pagado',
      fecha: new Date(),
      proximoPago: nextMonthStart(),
    });

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
  telefono: string;
  tipoDocumento: string;
  numeroDocumento: string;
  direccion: string;
  razonSocial: string;
  condicionIva: string;
};

export async function updateSocioAction(data: UpdateSocioData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  try {
    await db
      .update(profiles)
      .set({
        nombre: data.nombre.trim() || null,
        apellido: data.apellido.trim() || null,
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
