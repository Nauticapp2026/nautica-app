'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guarderias, horariosDia, memberships, profiles } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

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
    const msg = inviteError.message.toLowerCase();
    if (msg.includes('already been registered') || msg.includes('already exists')) {
      return { error: 'Ya existe una cuenta con ese email.' };
    }
    return { error: 'Error al crear la cuenta. Verificá el email e intentá de nuevo.' };
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
