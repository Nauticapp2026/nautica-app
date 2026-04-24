'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateAuthError } from '@/lib/auth/errors';
import { db } from '@/lib/db';
import { guarderias, memberships, horariosDia } from '@/lib/db/schema';
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
  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { nombre: data.nombre, apellido: data.apellido },
  });

  if (createErr) return { error: translateAuthError(createErr.message) };
  if (!created.user) return { error: 'No se pudo crear el usuario' };

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: data.email,
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

// Step 3 — detalles (descripción + horarios)
export async function updateDetallesStep(
  guarderiaId: string,
  data: {
    descripcion: string;
    horarios: Record<string, { apertura: string; cierre: string; activo: boolean }>;
  },
): Promise<ActionResult> {
  await db
    .update(guarderias)
    .set({ descripcion: data.descripcion })
    .where(eq(guarderias.id, guarderiaId));

  const dias = Object.entries(data.horarios).map(([dia, h]) => ({
    guarderiaId,
    dia: dia as 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo',
    apertura: h.apertura,
    cierre: h.cierre,
    activo: h.activo,
  }));

  if (dias.length > 0) {
    await db.insert(horariosDia).values(dias).onConflictDoNothing();
  }

  return {};
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

// Step 7 — plan
export async function selectPlanStep(
  guarderiaId: string,
  plan: 'classic' | 'plus' | 'platinum',
): Promise<ActionResult> {
  await db.update(guarderias).set({ plan }).where(eq(guarderias.id, guarderiaId));
  return {};
}
