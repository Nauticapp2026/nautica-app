'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateAuthError } from '@/lib/auth/errors';
import { db } from '@/lib/db';
import { guarderias, memberships, profiles } from '@/lib/db/schema';
import { geocodeAddress } from '@/lib/geocoding';
import { recordPlanChange } from '@/lib/pricing/plan-historial';
import { sendEmail } from '@/lib/email/resend';
import { onboardingClubAvanzoEmail } from '@/lib/email/templates/onboarding-club-avanzo';
import { eq } from 'drizzle-orm';

function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export type ActionResult = { error?: string };

// Step 1 — crear cuenta
// Usamos admin.createUser con email_confirm:true para saltearnos el mail de
// verificación (el admin que se da de alta debe poder completar TODO el
// onboarding en una sesión, sin trabarse esperando a confirmar por mail).
// Después iniciamos sesión con la misma password para que los pasos
// siguientes del onboarding tengan contexto autenticado.
export async function signUpStep(data: {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  password: string;
}): Promise<ActionResult & { userId?: string }> {
  // Supabase guarda los emails en minúscula: normalizamos para que comparar
  // contra la sesión actual no falle por un "Juan@" vs "juan@".
  const email = data.email.trim().toLowerCase();
  const supabase = await createClient();

  // Idempotente a propósito. Si el admin vuelve del paso 2 al paso 1 (por
  // ejemplo para leer los términos) y avanza de nuevo, este paso se ejecuta
  // una segunda vez con el mismo email. Antes eso llamaba a createUser otra
  // vez y Supabase respondía "ya existe una cuenta con ese email", dejándolo
  // trabado sin poder seguir (reporte del cliente 2026-09-17). La cuenta ya
  // creada es la suya: seguimos con la sesión que tiene.
  const {
    data: { user: sesionActual },
  } = await supabase.auth.getUser();
  if (sesionActual?.email?.toLowerCase() === email) {
    return { userId: sesionActual.id };
  }

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
    user_metadata: { nombre: data.nombre, apellido: data.apellido, telefono: data.telefono },
  });

  if (createErr) {
    // El email ya existe pero esta sesión no es la suya (se reabrió el
    // navegador, se limpiaron las cookies, otra pestaña). Si la contraseña
    // coincide es la misma persona retomando el alta, así que la dejamos
    // seguir; es exactamente lo que haría iniciando sesión. Si no coincide,
    // el email es de otro y hay que decirlo con todas las letras.
    const { data: signedIn, error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (signInErr || !signedIn.user) {
      return {
        error:
          'Ya existe una cuenta con ese email. Si es tuya, ingresá la misma contraseña para retomar el alta; si no, usá otro email.',
      };
    }
    return { userId: signedIn.user.id };
  }

  if (!created.user) return { error: 'No se pudo crear el usuario' };

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: data.password,
  });
  if (signInErr) return { error: translateAuthError(signInErr.message) };

  return { userId: created.user.id };
}

// Step 2 — crear guardería + membership
export async function createGuarderiaStep(data: {
  nombre: string;
  cuit: string;
  tipo: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  telefono: string;
  email: string;
  instagram: string;
  facebook: string;
}): Promise<ActionResult & { guarderiaId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'No autenticado' };

  const baseSlug = toSlug(data.nombre);
  let slug = baseSlug;
  let attempt = 0;

  while (attempt < 10) {
    const existing = await db
      .select({ id: guarderias.id })
      .from(guarderias)
      .where(eq(guarderias.slug, slug))
      .limit(1);

    if (existing.length === 0) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  // Geocoding automático (Nominatim) — usado por la app móvil para Clima.
  // Si falla, queda en NULL y la app móvil cae a su fallback.
  const coords = await geocodeAddress({
    direccion: data.direccion,
    ciudad: data.ciudad,
    provincia: data.provincia,
  });

  const [guarderia] = await db
    .insert(guarderias)
    .values({
      nombre: data.nombre,
      slug,
      cuit: data.cuit,
      tipo: data.tipo,
      direccion: data.direccion,
      ciudad: data.ciudad,
      provincia: data.provincia,
      codigoPostal: data.codigoPostal,
      telefono: data.telefono,
      email: data.email,
      instagram: data.instagram || null,
      facebook: data.facebook || null,
      latitud: coords ? coords.lat.toFixed(6) : null,
      longitud: coords ? coords.lng.toFixed(6) : null,
    })
    .returning({ id: guarderias.id });

  await db.insert(memberships).values({
    userId: user.id,
    guarderiaId: guarderia.id,
    rol: 'administrador_general',
    status: 'active',
  });

  return { guarderiaId: guarderia.id };
}

// Step 6 — feature flags
export async function updateFeaturesStep(
  guarderiaId: string,
  features: {
    activarNotificaciones: boolean;
    activarClimaYMareas: boolean;
    activarReservasOnline: boolean;
    activarPagosOnline: boolean;
    activarMenuGastronomico: boolean;
  },
): Promise<ActionResult> {
  await db
    .update(guarderias)
    .set({
      activarNotificaciones: features.activarNotificaciones,
      activarClimaYMareas: features.activarClimaYMareas,
      activarReservasOnline: features.activarReservasOnline,
      activarPagosOnline: features.activarPagosOnline,
      activarMenuGastronomico: features.activarMenuGastronomico,
    })
    .where(eq(guarderias.id, guarderiaId));

  return {};
}

// Step 5 — configuración de espacios. No persiste la cantidad (el club la
// termina de definir de verdad en /espacios) — este paso solo dispara un mail
// interno a NauticApp para poder contactar al club si no llega a completar la
// reunión que agenda por Calendly más adelante en el wizard (pedido cliente
// 2026-08-12). Se manda una sola vez por guardería (flag en `guarderias`); si
// el mail falla no bloquea el onboarding, solo se loguea.
export async function notificarAvanceOnboardingStep(guarderiaId: string): Promise<ActionResult> {
  const [guarderiaRow] = await db
    .select({
      nombre: guarderias.nombre,
      cuit: guarderias.cuit,
      direccion: guarderias.direccion,
      ciudad: guarderias.ciudad,
      telefono: guarderias.telefono,
      email: guarderias.email,
      yaEnviado: guarderias.onboardingNotificacionEnviada,
    })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  if (!guarderiaRow || guarderiaRow.yaEnviado) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profileRow] = user
    ? await db
        .select({
          nombre: profiles.nombre,
          apellido: profiles.apellido,
          telefono: profiles.telefono,
        })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1)
    : [undefined];

  try {
    const { subject, html } = onboardingClubAvanzoEmail({
      nombreClub: guarderiaRow.nombre,
      cuit: guarderiaRow.cuit,
      direccion: guarderiaRow.direccion,
      ciudad: guarderiaRow.ciudad,
      telefonoClub: guarderiaRow.telefono,
      emailClub: guarderiaRow.email,
      adminNombre: profileRow?.nombre ?? null,
      adminApellido: profileRow?.apellido ?? null,
      adminEmail: user?.email ?? '—',
      adminTelefono: profileRow?.telefono ?? null,
    });
    const res = await sendEmail({ to: 'hola@nauticapp.club', subject, html });
    if (!res.ok) console.error('[notificarAvanceOnboardingStep] mail error', res.error);
  } catch (err) {
    console.error('[notificarAvanceOnboardingStep] mail error', err);
  }

  await db
    .update(guarderias)
    .set({ onboardingNotificacionEnviada: true })
    .where(eq(guarderias.id, guarderiaId));

  return {};
}

// Step 7 — plan
export async function selectPlanStep(
  guarderiaId: string,
  plan: 'esencial' | 'premium' | 'elite',
): Promise<ActionResult> {
  await db.update(guarderias).set({ plan }).where(eq(guarderias.id, guarderiaId));
  await recordPlanChange({ guarderiaId, planSlug: plan });
  return {};
}
