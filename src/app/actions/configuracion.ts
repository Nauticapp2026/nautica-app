'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guarderias, horariosDia, memberships, profiles } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateInviteError } from '@/lib/auth/errors';
import { administrarPuntoVenta, toTusFecha } from '@/lib/tusfacturas/client';
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
};

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
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
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Error al sincronizar con tusfacturas.app',
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

// =============================================================================
// EQUIPO
// =============================================================================

const ROLES = [
  'super_admin',
  'administrador_general',
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
