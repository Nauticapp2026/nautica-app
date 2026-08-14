'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import {
  cargosPendientes,
  documentos,
  embarcaciones,
  guarderias,
  memberships,
  paywayTokens,
  profiles,
  servicios,
  socioServicios,
  socioServiciosCancelados,
} from '@/lib/db/schema';
import { todayArg } from '@/lib/dates';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateInviteError } from '@/lib/auth/errors';
import { and, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

async function nextNumeroSocio(guarderiaId: string): Promise<number> {
  const [row] = await db
    .select({ max: max(memberships.numeroSocio) })
    .from(memberships)
    .where(and(eq(memberships.guarderiaId, guarderiaId), eq(memberships.rol, 'socio')));
  return (Number(row?.max) || 0) + 1;
}

export type CreateSocioData = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  direccion: string;
  direccionNumero: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  contactoEmergencia: string;
  tipoDocumento: string;
  numeroDocumento: string;
  razonSocial: string;
  cuit: string;
  direccionFiscal: string;
  direccionFiscalNumero: string;
  ciudadFiscal: string;
  provinciaFiscal: string;
  condicionIva: string;
  condicionIvaPersonal: string;
  condicionIibb: string;
  emailFacturacion: string;
  embarcacionNombre: string;
  matricula: string;
  astillero: string;
  modelo: string;
  esloraM: string;
  facturaFiscal: boolean;
  // Default del toggle Interno/Fiscal al cargarle servicios (Datos Impositivos).
  comprobanteInterno: boolean;
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL no configurado');
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
          direccionNumero: data.direccionNumero.trim() || null,
          ciudad: data.ciudad.trim() || null,
          provincia: data.provincia.trim() || null,
          codigoPostal: data.codigoPostal.trim() || null,
          contactoEmergencia: data.contactoEmergencia.trim() || null,
          tipoDocumento: (data.tipoDocumento || null) as never,
          numeroDocumento: data.numeroDocumento.trim() || null,
          razonSocial: data.razonSocial.trim() || null,
          cuit: data.cuit.trim() || null,
          direccionFiscal: data.direccionFiscal.trim() || null,
          direccionFiscalNumero: data.direccionFiscalNumero.trim() || null,
          ciudadFiscal: data.ciudadFiscal.trim() || null,
          provinciaFiscal: data.provinciaFiscal.trim() || null,
          condicionIva: (data.condicionIva || null) as never,
          condicionIvaPersonal: (data.condicionIvaPersonal || null) as never,
          condicionIibb: (data.condicionIibb || null) as never,
          emailFacturacion: data.emailFacturacion.trim() || null,
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
            direccionNumero: data.direccionNumero.trim() || null,
            ciudad: data.ciudad.trim() || null,
            provincia: data.provincia.trim() || null,
            codigoPostal: data.codigoPostal.trim() || null,
            contactoEmergencia: data.contactoEmergencia.trim() || null,
            tipoDocumento: (data.tipoDocumento || null) as never,
            numeroDocumento: data.numeroDocumento.trim() || null,
            razonSocial: data.razonSocial.trim() || null,
            cuit: data.cuit.trim() || null,
            direccionFiscal: data.direccionFiscal.trim() || null,
            direccionFiscalNumero: data.direccionFiscalNumero.trim() || null,
            ciudadFiscal: data.ciudadFiscal.trim() || null,
            provinciaFiscal: data.provinciaFiscal.trim() || null,
            condicionIva: (data.condicionIva || null) as never,
            condicionIvaPersonal: (data.condicionIvaPersonal || null) as never,
            condicionIibb: (data.condicionIibb || null) as never,
            emailFacturacion: data.emailFacturacion.trim() || null,
            estadoSocio: 'activo',
          },
        });
    }

    // 4. Create membership linking socio to this guardería.
    // El pre-check de arriba garantiza que NO hay membership existente en
    // esta guardería, así que el insert debe tener éxito sí o sí.
    const numSocio = await nextNumeroSocio(gId);
    await db.insert(memberships).values({
      userId: profileId,
      guarderiaId: gId,
      rol: 'socio',
      status: 'active',
      numeroSocio: numSocio,
      facturaFiscal: data.facturaFiscal,
      comprobanteInterno: data.comprobanteInterno,
    });

    // 4. Create embarcación if provided
    if (data.embarcacionNombre.trim()) {
      const esloraNum = parseFloat(data.esloraM);
      await db.insert(embarcaciones).values({
        guarderiaId: gId,
        profileId,
        nombre: data.embarcacionNombre.trim(),
        matricula: data.matricula.trim() || null,
        astillero: data.astillero.trim() || null,
        modelo: data.modelo.trim() || null,
        esloraM: isNaN(esloraNum) ? null : esloraNum.toFixed(2),
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
  direccionNumero: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  contactoEmergencia: string;
  razonSocial: string;
  cuit: string;
  direccionFiscal: string;
  direccionFiscalNumero: string;
  ciudadFiscal: string;
  provinciaFiscal: string;
  condicionIva: string;
  condicionIvaPersonal: string;
  condicionIibb: string;
  emailFacturacion: string;
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
        direccionNumero: data.direccionNumero.trim() || null,
        ciudad: data.ciudad.trim() || null,
        provincia: data.provincia.trim() || null,
        codigoPostal: data.codigoPostal.trim() || null,
        contactoEmergencia: data.contactoEmergencia.trim() || null,
        razonSocial: data.razonSocial.trim() || null,
        cuit: data.cuit.trim() || null,
        direccionFiscal: data.direccionFiscal.trim() || null,
        direccionFiscalNumero: data.direccionFiscalNumero.trim() || null,
        ciudadFiscal: data.ciudadFiscal.trim() || null,
        provinciaFiscal: data.provinciaFiscal.trim() || null,
        condicionIva: (data.condicionIva || null) as never,
        condicionIvaPersonal: (data.condicionIvaPersonal || null) as never,
        condicionIibb: (data.condicionIibb || null) as never,
        emailFacturacion: data.emailFacturacion.trim() || null,
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
const TIPOS_MIME_DOC = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

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
  if (!file.type || !TIPOS_MIME_DOC.includes(file.type)) {
    return { error: 'Formato no soportado. Usá PDF, JPG, PNG o WebP.' };
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

// ─── Cambiar número de socio ─────────────────────────────────────────────────

const updateNumeroSocioSchema = z.object({
  socioId: z.string().uuid(),
  numeroSocio: z.number().int().positive().nullable(),
});

export async function updateNumeroSocioAction(
  socioId: string,
  numeroSocio: number | null,
): Promise<{ error?: string }> {
  const parsed = updateNumeroSocioSchema.safeParse({ socioId, numeroSocio });
  if (!parsed.success) return { error: 'Número inválido.' };

  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;

  // Verificar duplicado antes de intentar el update.
  if (parsed.data.numeroSocio !== null) {
    const [duplicate] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
          eq(memberships.numeroSocio, parsed.data.numeroSocio),
        ),
      )
      .limit(1);
    if (duplicate && duplicate.userId !== parsed.data.socioId) {
      return { error: `El Nº de Socio ${parsed.data.numeroSocio} ya está asignado a otro socio.` };
    }
  }

  try {
    await db
      .update(memberships)
      .set({ numeroSocio: parsed.data.numeroSocio })
      .where(
        and(
          eq(memberships.userId, parsed.data.socioId),
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
        ),
      );

    revalidatePath('/usuarios');
    revalidatePath(`/usuarios/${parsed.data.socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar el número de socio.' };
  }
}

// ─── Cambiar estado de membresía ─────────────────────────────────────────────

const updateStatusSchema = z.object({
  socioId: z.string().uuid(),
  status: z.enum(['active', 'inactivo']),
});

export async function updateSocioStatusAction(
  socioId: string,
  newStatus: 'active' | 'inactivo',
): Promise<{ error?: string }> {
  const parsed = updateStatusSchema.safeParse({ socioId, status: newStatus });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'Tu sesión expiró. Recargá la página e intentá de nuevo.' };

  const gId = ctx.activeMembership.guarderiaId;

  try {
    await db
      .update(memberships)
      .set({ status: parsed.data.status })
      .where(
        and(
          eq(memberships.userId, parsed.data.socioId),
          eq(memberships.guarderiaId, gId),
          eq(memberships.rol, 'socio'),
        ),
      );

    revalidatePath('/usuarios');
    revalidatePath(`/usuarios/${parsed.data.socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar el estado.' };
  }
}

// ─── Editar servicio contratado (fecha de inicio / fecha de baja) ──────────

function isAdminSocios(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo' ||
    ctx.activeMembership.rol === 'contable'
  );
}

const updateSocioServicioSchema = z.object({
  id: z.string().uuid(),
  fechaInicio: z.string(),
  fechaBaja: z.string().nullable(),
  concepto: z.string().nullable(),
  comprobanteInterno: z.boolean(),
  debitoAutomatico: z.boolean(),
  cobro: z.object({ monto: z.string(), concepto: z.string() }).nullable(),
});

export async function updateSocioServicioAction(input: unknown): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdminSocios(ctx))
    return { error: 'Solo administradores pueden editar servicios contratados.' };

  const parsed = updateSocioServicioSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos' };
  const { id, fechaInicio, fechaBaja, concepto, comprobanteInterno, cobro } = parsed.data;
  let { debitoAutomatico } = parsed.data;
  const guarderiaId = ctx.activeMembership.guarderiaId;

  if (!fechaInicio) {
    return { error: 'La fecha de inicio del servicio es obligatoria.' };
  }
  if (fechaBaja && fechaBaja < fechaInicio) {
    return { error: 'La fecha de baja no puede ser anterior a la fecha de inicio.' };
  }

  // Un contrato Interno solo entra al débito automático si el club habilitó
  // 'debito_automatico' en la Gestión de cobranza (comprobantes internos) —
  // misma regla que el tilde de la UI; acá se sanea por si llega igual.
  if (comprobanteInterno && debitoAutomatico) {
    const [g] = await db
      .select({ medios: guarderias.mediosCobroInternos })
      .from(guarderias)
      .where(eq(guarderias.id, guarderiaId))
      .limit(1);
    if (!g?.medios.includes('debito_automatico')) debitoAutomatico = false;
  }

  try {
    const [current] = await db
      .select({
        id: socioServicios.id,
        socioId: socioServicios.socioId,
        servicioId: socioServicios.servicioId,
        fechaBaja: socioServicios.fechaBaja,
        servicioPrecio: servicios.precio,
        servicioAlicuotaIva: servicios.alicuotaIva,
        servicioNombre: servicios.nombre,
      })
      .from(socioServicios)
      .innerJoin(servicios, eq(servicios.id, socioServicios.servicioId))
      .where(and(eq(socioServicios.id, id), eq(socioServicios.guarderiaId, guarderiaId)))
      .limit(1);
    if (!current) return { error: 'Servicio contratado no encontrado.' };

    const estabaAbierto = current.fechaBaja === null;
    const quedaCerrado = fechaBaja !== null;

    await db
      .update(socioServicios)
      .set({
        fechaInicio,
        fechaBaja,
        concepto: concepto?.trim() || null,
        comprobanteInterno,
        debitoAutomatico,
        updatedAt: new Date(),
      })
      .where(eq(socioServicios.id, id));

    if (quedaCerrado && estabaAbierto) {
      // Recién se está dando de baja: frenar la facturación recurrente vía
      // la tabla que ya lee el cron, y cobrar (si el admin lo eligió) el
      // monto sugerido por la política de baja anticipada de la tarifa.
      await db
        .insert(socioServiciosCancelados)
        .values({
          socioId: current.socioId,
          servicioId: current.servicioId,
          guarderiaId,
          fechaCancelacion: fechaBaja!,
        })
        .onConflictDoNothing();

      if (cobro) {
        // Modelo "los cargos nacen al emitir": el cobro por baja ya no va
        // directo a cuenta corriente — queda como ítem pendiente de facturar
        // y entra al próximo comprobante del socio (manual o automático).
        // El monto se valida server-side: numérico, > 0 y con techo en el
        // precio de un mes completo del tarifario (que ya es el precio final,
        // con IVA incluido — ver lib/iva.ts).
        const monto = Number.parseFloat(cobro.monto);
        const techo = current.servicioPrecio != null ? Number(current.servicioPrecio) : 0;
        if (!Number.isFinite(monto) || monto <= 0) {
          return { error: 'El monto del cobro por baja debe ser mayor a 0.' };
        }
        if (techo > 0 && monto > techo + 0.01) {
          return {
            error: 'El cobro por baja no puede superar el precio de un mes completo del servicio.',
          };
        }

        await db.insert(cargosPendientes).values({
          guarderiaId,
          socioId: current.socioId,
          servicioId: current.servicioId,
          socioServicioId: current.id,
          origen: 'baja_anticipada',
          concepto: cobro.concepto?.trim() || `Cobro por baja de ${current.servicioNombre}`,
          importe: monto.toFixed(2),
          alicuotaIva: current.servicioAlicuotaIva,
          comprobanteInterno,
          createdBy: ctx.profile.id,
        });
      }
    } else if (!quedaCerrado && !estabaAbierto) {
      // Se reabre: dejar que el cron vuelva a facturar de forma recurrente.
      await db
        .delete(socioServiciosCancelados)
        .where(
          and(
            eq(socioServiciosCancelados.socioId, current.socioId),
            eq(socioServiciosCancelados.servicioId, current.servicioId),
            eq(socioServiciosCancelados.guarderiaId, guarderiaId),
          ),
        );
    }

    revalidatePath(`/usuarios/${current.socioId}`);
    return {};
  } catch {
    return { error: 'Error al editar el servicio contratado.' };
  }
}

// ─── Toggle facturaFiscal ────────────────────────────────────────────────────

// Tilde "Comprobante interno" (Datos Impositivos): default del toggle
// Interno/Fiscal al cargar un servicio a este socio.
export async function toggleComprobanteInternoAction(socioId: string, value: boolean) {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  const guarderiaId = ctx.activeMembership.guarderiaId;
  try {
    // Gate de la Configuración de cobranzas: sin medios habilitados para
    // comprobantes internos, el tilde no se puede activar.
    if (value) {
      const [g] = await db
        .select({ medios: guarderias.mediosCobroInternos })
        .from(guarderias)
        .where(eq(guarderias.id, guarderiaId))
        .limit(1);
      if (!g || g.medios.length === 0) {
        return {
          error:
            'Los comprobantes internos están deshabilitados. Habilitá al menos un medio de pago en Mi Perfil → Datos Impositivos → Gestión de cobranza.',
        };
      }
    }
    await db
      .update(memberships)
      .set({ comprobanteInterno: value })
      .where(
        and(
          eq(memberships.userId, socioId),
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.rol, 'socio'),
        ),
      );
    revalidatePath(`/usuarios/${socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar.' };
  }
}

// Tilde "Cobro Automático Payway" (Datos Impositivos): adhesión general del
// socio al débito automático. Requiere tarjeta cargada (payway_tokens activo).
// Al destildar se guarda la fecha de baja; al re-tildar se blanquea (arranca
// un período nuevo de adhesión).
export async function toggleCobroAutomaticoPaywayAction(socioId: string, value: boolean) {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdminSocios(ctx)) return { error: 'Solo administradores pueden editar esta opción.' };
  const guarderiaId = ctx.activeMembership.guarderiaId;
  try {
    if (value) {
      const [token] = await db
        .select({ id: paywayTokens.id })
        .from(paywayTokens)
        .where(
          and(
            eq(paywayTokens.guarderiaId, guarderiaId),
            eq(paywayTokens.socioId, socioId),
            eq(paywayTokens.activo, true),
          ),
        )
        .limit(1);
      if (!token) {
        return {
          error:
            'El socio no tiene una tarjeta de crédito cargada. Cargala primero desde la pestaña Débito automático.',
        };
      }
    }
    await db
      .update(memberships)
      .set({
        cobroAutomaticoPayway: value,
        cobroAutomaticoBaja: value ? null : todayArg(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memberships.userId, socioId),
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.rol, 'socio'),
        ),
      );
    revalidatePath(`/usuarios/${socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar.' };
  }
}

export async function toggleFacturaFiscalAction(socioId: string, value: boolean) {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  const guarderiaId = ctx.activeMembership.guarderiaId;
  try {
    await db
      .update(memberships)
      .set({ facturaFiscal: value })
      .where(
        and(
          eq(memberships.userId, socioId),
          eq(memberships.guarderiaId, guarderiaId),
          eq(memberships.rol, 'socio'),
        ),
      );
    revalidatePath(`/usuarios/${socioId}`);
    revalidatePath('/ventas');
    return {};
  } catch {
    return { error: 'Error al actualizar.' };
  }
}
