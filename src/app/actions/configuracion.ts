'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guarderias, horariosDia, memberships, profiles } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateInviteError } from '@/lib/auth/errors';
import { geocodeAddress } from '@/lib/geocoding';
import { recordPlanChange } from '@/lib/pricing/plan-historial';
import {
  administrarPuntoVenta,
  solicitarCertificadoEnlace,
  toTusFecha,
} from '@/lib/tusfacturas/client';
import { CONDICION_IVA_API } from '@/lib/tusfacturas/mappers';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
type Dia = (typeof DIAS)[number];

const TIPOS = [
  'club_nautico',
  'marina_privada',
  'guarderia_nautica',
  'puerto_deportivo',
  'otro',
] as const;
type Tipo = (typeof TIPOS)[number];

export type HorarioInput = {
  dia: Dia;
  horarios: string | null;
  cerrado: boolean;
};

export type UpdateGuarderiaGeneralData = {
  nombre: string;
  cuit: string;
  tipo: Tipo;
  direccion: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  telefono: string;
  email: string;
  horarios: HorarioInput[];
  imagenes: string[];
  diaFacturacion: number;
};

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo'
  );
}

export async function updateGuarderiaGeneralAction(
  data: UpdateGuarderiaGeneralData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const nombre = data.nombre.trim();
  if (!nombre) return { error: 'El nombre es obligatorio.' };
  if (!data.cuit.trim()) return { error: 'El CUIT es obligatorio.' };
  if (!TIPOS.includes(data.tipo)) return { error: 'Tipo de establecimiento inválido.' };
  if (
    !Number.isInteger(data.diaFacturacion) ||
    data.diaFacturacion < 1 ||
    data.diaFacturacion > 28
  ) {
    return { error: 'El día de facturación debe ser un entero entre 1 y 28.' };
  }

  // Geocoding automático (Nominatim) — convierte direccion+ciudad+provincia
  // en lat/long que la app móvil usa para Clima/mapa de viento. Si falla,
  // dejamos las coordenadas anteriores intactas.
  const coords = await geocodeAddress({
    direccion: data.direccion.trim(),
    ciudad: data.ciudad.trim(),
    provincia: data.provincia.trim(),
  });

  await db
    .update(guarderias)
    .set({
      nombre,
      cuit: data.cuit.trim(),
      tipo: data.tipo,
      direccion: data.direccion.trim(),
      ciudad: data.ciudad.trim(),
      provincia: data.provincia.trim(),
      codigoPostal: data.codigoPostal.trim(),
      telefono: data.telefono.trim(),
      email: data.email.trim(),
      imagenes: data.imagenes,
      diaFacturacion: data.diaFacturacion,
      ...(coords
        ? {
            latitud: coords.lat.toFixed(6),
            longitud: coords.lng.toFixed(6),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(guarderias.id, guarderiaId));

  for (let i = 0; i < data.horarios.length; i++) {
    const h = data.horarios[i];
    if (!DIAS.includes(h.dia)) continue;

    const existing = await db
      .select({ id: horariosDia.id })
      .from(horariosDia)
      .where(and(eq(horariosDia.guarderiaId, guarderiaId), eq(horariosDia.dia, h.dia)))
      .limit(1);

    const payload = {
      guarderiaId,
      dia: h.dia,
      horarios: h.cerrado ? null : (h.horarios ?? null),
      cerrado: h.cerrado,
      orden: i,
    };

    if (existing.length === 0) {
      await db.insert(horariosDia).values(payload);
    } else {
      await db
        .update(horariosDia)
        .set({ horarios: payload.horarios, cerrado: payload.cerrado, orden: payload.orden })
        .where(eq(horariosDia.id, existing[0].id));
    }
  }

  revalidatePath('/configuracion');
  return {};
}

// =============================================================================
// FEATURE FLAGS / NOTIFICACIONES
// =============================================================================

export type GuarderiaFeatures = {
  activarNotificaciones: boolean;
  activarClimaYMareas: boolean;
  activarReservasOnline: boolean;
  activarPagosOnline: boolean;
  activarMenuGastronomico: boolean;
};

export async function updateGuarderiaFeaturesAction(
  features: GuarderiaFeatures,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  await db
    .update(guarderias)
    .set({
      activarNotificaciones: features.activarNotificaciones,
      activarClimaYMareas: features.activarClimaYMareas,
      activarReservasOnline: features.activarReservasOnline,
      activarPagosOnline: features.activarPagosOnline,
      activarMenuGastronomico: features.activarMenuGastronomico,
      updatedAt: new Date(),
    })
    .where(eq(guarderias.id, ctx.activeMembership.guarderiaId));

  revalidatePath('/configuracion');
  return {};
}

// =============================================================================
// PUNTO DE VENTA / TUSFACTURAS
// =============================================================================

const CONDICIONES_IVA = [
  'consumidor_final',
  'responsable_inscripto',
  'monotributo',
  'exento',
  'cliente_exterior',
  'iva_no_alcanzado',
] as const;
type CondicionIva = (typeof CONDICIONES_IVA)[number];

/**
 * Construye la URL del webhook de tusfacturas para este deployment.
 * - Devuelve undefined si falta TUSFACTURAS_WEBHOOK_SECRET o NEXT_PUBLIC_APP_URL.
 * - tusfacturas exige HTTPS, así que en dev (http://localhost) no se setea.
 */
function buildTusFacturasWebhookUrl(): string | undefined {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  const secret = process.env.TUSFACTURAS_WEBHOOK_SECRET;
  if (!appUrl || !secret) return undefined;
  if (!appUrl.startsWith('https://')) return undefined;
  return `${appUrl}/api/webhooks/tusfacturas?secret=${encodeURIComponent(secret)}`;
}

export type SavePuntoVentaData = {
  puntoDeVenta: number;
  razonSocial: string;
  condicionIva: CondicionIva;
  rubro: string;
  fechaInicio: string; // 'YYYY-MM-DD' (del input date)
};

export async function savePuntoVentaAction(data: SavePuntoVentaData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar la configuración.' };

  if (!Number.isInteger(data.puntoDeVenta) || data.puntoDeVenta <= 0) {
    return { error: 'El punto de venta debe ser un número entero positivo.' };
  }
  if (!data.razonSocial.trim()) return { error: 'La razón social es obligatoria.' };
  if (!CONDICIONES_IVA.includes(data.condicionIva)) return { error: 'Condición IVA inválida.' };
  if (!data.rubro.trim()) return { error: 'El rubro es obligatorio.' };
  if (!data.fechaInicio) return { error: 'La fecha de inicio es obligatoria.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [guarderia] = await db
    .select({
      direccion: guarderias.direccion,
      cuit: guarderias.cuit,
      email: guarderias.email,
      iibb: guarderias.iibb,
      puntoDeVentaActual: guarderias.puntoDeVenta,
    })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  if (!guarderia) return { error: 'Guardería no encontrada.' };
  if (!guarderia.direccion || !guarderia.cuit || !guarderia.email) {
    return {
      error: 'Completá dirección, CUIT y email en Información general antes de configurar el POS.',
    };
  }

  if (guarderia.puntoDeVentaActual != null) {
    return {
      error: 'Ya tenés un punto de venta configurado. No se puede volver a agregar.',
    };
  }

  const ivaCode = CONDICION_IVA_API[data.condicionIva];
  if (!ivaCode) return { error: 'No se pudo mapear la condición IVA.' };

  const webhookUrl = buildTusFacturasWebhookUrl();

  let tusResponse;
  try {
    tusResponse = await administrarPuntoVenta({
      operacion: 'A',
      punto_venta: String(data.puntoDeVenta),
      direccion: guarderia.direccion,
      razon_social: data.razonSocial.trim(),
      cuit: guarderia.cuit,
      iva_condicion: ivaCode,
      iva_emails: guarderia.email,
      ...(guarderia.iibb ? { iibb: guarderia.iibb } : {}),
      fecha_inicio: toTusFecha(data.fechaInicio),
      factura_afip: 'S',
      es_agente_retencion: 'N',
      esta_activo: 'S',
      es_predeterminado: 'S',
      conceptos_tipo: 'PS',
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error al sincronizar con TusFacturas.',
    };
  }

  await db
    .update(guarderias)
    .set({
      puntoDeVenta: data.puntoDeVenta,
      razonSocial: data.razonSocial.trim(),
      condicionIva: data.condicionIva,
      rubro: data.rubro.trim(),
      fechaInicio: new Date(data.fechaInicio),
      tusfacturasApikey: tusResponse.apikey != null ? String(tusResponse.apikey) : null,
      tusfacturasApitoken: tusResponse.apitoken ?? null,
      tusfacturasUsertoken: tusResponse.usertoken ?? null,
      updatedAt: new Date(),
    })
    .where(eq(guarderias.id, guarderiaId));

  revalidatePath('/configuracion');
  return {};
}

// Marca el certificado AFIP como instalado/confirmado por el admin.
// Después de "Solicitar certificado AFIP" tusfacturas manda instrucciones
// al mail del admin de la cuenta TF. Una vez que las sigue (instala el
// certificado en TF/AFIP) vuelve y clickea "Confirmar instalación", que
// dispara esta action y desbloquea la facturación.
export async function confirmarCertificadoAfipAction(ok: boolean): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden confirmar el certificado.' };

  await db
    .update(guarderias)
    .set({ certificadoAfipOk: ok, updatedAt: new Date() })
    .where(eq(guarderias.id, ctx.activeMembership.guarderiaId));

  revalidatePath('/configuracion');
  return {};
}

// Solicita el certificado de enlace con AFIP para el POS de la guarderia
// activa. Tusfacturas genera el certificado y manda instrucciones al mail
// del admin. Loggeamos el response crudo la primera vez para entender
// qué devuelve.
export async function solicitarCertificadoAfipAction(): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden solicitar el certificado.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  const [g] = await db
    .select({
      puntoDeVenta: guarderias.puntoDeVenta,
      apikey: guarderias.tusfacturasApikey,
      apitoken: guarderias.tusfacturasApitoken,
      usertoken: guarderias.tusfacturasUsertoken,
    })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  if (!g || g.puntoDeVenta == null || !g.apikey || !g.apitoken || !g.usertoken) {
    return {
      error: 'Primero configurá los datos de facturación (POS) antes de solicitar el certificado.',
    };
  }

  try {
    const res = await solicitarCertificadoEnlace({
      apikey: g.apikey,
      apitoken: g.apitoken,
      usertoken: g.usertoken,
    });
    console.log('[certificado-afip] response', { guarderiaId, res });
    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error al solicitar el certificado.',
    };
  }
}

// =============================================================================
// EQUIPO
// =============================================================================

const ROLES = [
  'super_admin',
  'administrador_general',
  'administrativo',
  'operario',
  'contable',
  'mantenimiento',
  'comunicaciones',
  'restaurantes',
  'socio',
  'invitado',
  'proveedor',
  'seguridad',
] as const;
type Rol = (typeof ROLES)[number];

export type CreateMiembroEquipoData = {
  nombre: string;
  apellido: string;
  email: string;
  rol: Rol;
  dni: string;
  telefono: string;
  sede: string;
};

// =============================================================================
// PLAN DEL CLUB
// =============================================================================

const PLANES = ['esencial', 'club', 'elite'] as const;
type Plan = (typeof PLANES)[number];

export async function updateGuarderiaPlanAction(plan: Plan): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden cambiar el plan.' };
  if (!PLANES.includes(plan)) return { error: 'Plan inválido.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  await db
    .update(guarderias)
    .set({ plan, updatedAt: new Date() })
    .where(eq(guarderias.id, guarderiaId));

  await recordPlanChange({
    guarderiaId,
    planSlug: plan,
    createdBy: ctx.profile.id,
  });

  revalidatePath('/configuracion');
  return {};
}

export type UpdateMiembroEquipoData = {
  profileId: string;
  nombre: string;
  apellido: string;
  rol: Rol;
  dni: string;
  telefono: string;
  sede: string;
};

export async function updateMiembroEquipoAction(
  data: UpdateMiembroEquipoData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar miembros.' };

  const nombre = data.nombre.trim();
  const apellido = data.apellido.trim();
  if (!nombre || !apellido) return { error: 'Nombre y apellido son obligatorios.' };
  if (!ROLES.includes(data.rol)) return { error: 'Rol inválido.' };
  // super_admin no se asigna desde el panel de la guardería — eso solo va
  // por /super-admin/usuarios. Evita que un admin de club promueva a alguien
  // a super admin de plataforma.
  if (data.rol === 'super_admin') {
    return { error: 'No se puede asignar el rol Super Admin desde Configuración.' };
  }

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // Validar que el miembro pertenezca a esta guardería antes de editarlo.
  // Multi-tenancy: sin esto un admin podría editar miembros de otro club.
  const [membership] = await db
    .select({ id: memberships.id, rol: memberships.rol })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, data.profileId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!membership) return { error: 'El miembro no pertenece a esta guardería.' };

  // Si el admin se está editando a sí mismo, no permitir cambiarse a un rol
  // que no sea admin (queda afuera del panel).
  const isSelf = data.profileId === ctx.profile.id;
  if (isSelf && data.rol !== 'administrador_general' && data.rol !== 'administrativo') {
    return { error: 'No te podés cambiar a un rol no administrativo (te quedarías sin acceso).' };
  }

  await db
    .update(profiles)
    .set({
      nombre,
      apellido,
      telefono: data.telefono.trim() || null,
      numeroDocumento: data.dni.trim() || null,
      tipoDocumento: data.dni.trim() ? 'dni' : null,
      sede: data.sede.trim() || null,
    })
    .where(eq(profiles.id, data.profileId));

  if (membership.rol !== data.rol) {
    await db
      .update(memberships)
      .set({ rol: data.rol, updatedAt: new Date() })
      .where(eq(memberships.id, membership.id));
  }

  revalidatePath('/configuracion');
  return {};
}

export async function deleteMiembroEquipoAction(profileId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden eliminar miembros.' };

  if (profileId === ctx.profile.id) {
    return { error: 'No te podés eliminar a vos mismo.' };
  }

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // Validar que el target pertenezca a esta guardería (multi-tenancy).
  const [target] = await db
    .select({
      membershipId: memberships.id,
      isSuperAdmin: profiles.isSuperAdmin,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.userId, profileId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!target) return { error: 'El miembro no pertenece a esta guardería.' };
  if (target.isSuperAdmin) {
    return { error: 'No se puede eliminar a un Super Admin desde Configuración.' };
  }

  // Borrar la cuenta de auth: el cascade desde auth.users borra profiles +
  // memberships en todas las guarderías + datos asociados. Es destructivo;
  // la UI debe pedir confirm.
  const admin = createAdminClient();
  const { error: deleteErr } = await admin.auth.admin.deleteUser(profileId);
  if (deleteErr) {
    console.error('[deleteMiembroEquipoAction] deleteUser error', { profileId, deleteErr });
    return { error: `No se pudo eliminar la cuenta: ${deleteErr.message}` };
  }

  revalidatePath('/configuracion');
  return {};
}

export async function createMiembroEquipoAction(
  data: CreateMiembroEquipoData,
): Promise<{ error?: string; profileId?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden agregar miembros.' };

  const nombre = data.nombre.trim();
  const apellido = data.apellido.trim();
  const email = data.email.toLowerCase().trim();
  if (!nombre || !apellido || !email) {
    return { error: 'Nombre, apellido y email son obligatorios.' };
  }
  if (!ROLES.includes(data.rol)) return { error: 'Rol inválido.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/crear-cuenta`,
  });

  if (inviteError) {
    console.error('[createMiembroEquipoAction] inviteError', { email, inviteError });
    return { error: translateInviteError(inviteError.message) };
  }

  const profileId = inviteData.user.id;

  try {
    await db
      .insert(profiles)
      .values({
        id: profileId,
        email,
        nombre,
        apellido,
        telefono: data.telefono.trim() || null,
        numeroDocumento: data.dni.trim() || null,
        tipoDocumento: data.dni.trim() ? 'dni' : null,
        sede: data.sede.trim() || null,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          email,
          nombre,
          apellido,
          telefono: data.telefono.trim() || null,
          numeroDocumento: data.dni.trim() || null,
          tipoDocumento: data.dni.trim() ? 'dni' : null,
          sede: data.sede.trim() || null,
        },
      });

    await db
      .insert(memberships)
      .values({
        userId: profileId,
        guarderiaId,
        rol: data.rol,
        status: 'active',
      })
      .onConflictDoNothing();

    revalidatePath('/configuracion');
    return { profileId };
  } catch {
    await admin.auth.admin.deleteUser(profileId).catch(() => null);
    return { error: 'Error al registrar el miembro. Intentá de nuevo.' };
  }
}

// =============================================================================
// IMAGENES DE LA GUARDERIA
// =============================================================================

const BUCKET_GUARDERIA_FOTOS = 'guarderia-fotos';
const MAX_IMAGEN_BYTES = 8 * 1024 * 1024; // 8 MB
const TIPOS_IMAGEN_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function ensureGuarderiaFotosBucket(
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_GUARDERIA_FOTOS);
  if (!exists) {
    await admin.storage.createBucket(BUCKET_GUARDERIA_FOTOS, { public: true });
  }
}

// Sube una imagen de la guarderia al bucket publico y devuelve la URL.
// La persistencia del array `imagenes` la hace updateGuarderiaGeneralAction
// cuando el admin guarda el form — esta action solo se encarga del upload.
export async function uploadGuarderiaImagenAction(
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden subir imágenes.' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'Archivo inválido.' };
  if (file.size === 0) return { error: 'El archivo está vacío.' };
  if (file.size > MAX_IMAGEN_BYTES) return { error: 'La imagen supera el tamaño máximo (8 MB).' };
  if (file.type && !TIPOS_IMAGEN_ACEPTADOS.includes(file.type)) {
    return { error: 'Formato no soportado. Usá JPG, PNG, WebP o GIF.' };
  }

  const admin = createAdminClient();
  await ensureGuarderiaFotosBucket(admin);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${ctx.activeMembership.guarderiaId}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET_GUARDERIA_FOTOS)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (uploadErr) return { error: `Error subiendo imagen: ${uploadErr.message}` };

  const { data: urlData } = admin.storage.from(BUCKET_GUARDERIA_FOTOS).getPublicUrl(path);
  return { url: urlData.publicUrl };
}
