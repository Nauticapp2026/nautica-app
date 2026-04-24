'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { translateAuthError } from '@/lib/auth/errors';
import { db } from '@/lib/db';
import { guarderias, memberships, horariosDia, profiles } from '@/lib/db/schema';
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

// Subir fotos de la guardería en el paso 3.
// Guardamos los URLs públicos en guarderias.imagenes (text[]). Usa el bucket
// "guarderia-fotos" (lo creamos on-demand si no existe — las fotos son de
// consumo público, bucket público).
const BUCKET_GUARDERIA_FOTOS = 'guarderia-fotos';

async function ensureGuarderiaFotosBucket(
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_GUARDERIA_FOTOS);
  if (!exists) {
    await admin.storage.createBucket(BUCKET_GUARDERIA_FOTOS, { public: true });
  }
}

export async function uploadGuarderiaFotoStep(
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  const guarderiaId = String(formData.get('guarderiaId') ?? '');
  const file = formData.get('file');

  if (!guarderiaId) return { error: 'Falta el id de la guardería.' };
  if (!(file instanceof File)) return { error: 'Archivo inválido.' };
  if (file.size === 0) return { error: 'El archivo está vacío.' };

  const admin = createAdminClient();
  await ensureGuarderiaFotosBucket(admin);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${guarderiaId}/${Date.now()}-${safeName}`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET_GUARDERIA_FOTOS)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (uploadErr) return { error: `Error subiendo foto: ${uploadErr.message}` };

  const { data: urlData } = admin.storage.from(BUCKET_GUARDERIA_FOTOS).getPublicUrl(path);
  const url = urlData.publicUrl;

  // Append al array imagenes de la guardería
  const [current] = await db
    .select({ imagenes: guarderias.imagenes })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  const nueva = [...(current?.imagenes ?? []), url];
  await db.update(guarderias).set({ imagenes: nueva }).where(eq(guarderias.id, guarderiaId));

  return { url };
}

// Step 3 — detalles (descripción + horarios)
// La tabla horarios_dia tiene columnas: dia (enum), horarios (text "HH:MM - HH:MM"),
// cerrado (bool), orden (int). NO tiene apertura/cierre/activo separados como pensaba
// el código viejo — ese insert silenciosamente fallaba y por eso los horarios no se
// veían en Configuración.
type Dia = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
const DIAS_ORDEN: Dia[] = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
];

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

  // Borramos horarios previos (onboarding es la primera vez; si fuera un re-run,
  // igual conviene pisar).
  await db.delete(horariosDia).where(eq(horariosDia.guarderiaId, guarderiaId));

  const dias = DIAS_ORDEN.map((dia, orden) => {
    const h = data.horarios[dia];
    if (!h) return null;
    const cerrado = !h.activo;
    return {
      guarderiaId,
      dia,
      horarios: cerrado ? null : `${h.apertura} - ${h.cierre}`,
      cerrado,
      orden,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  if (dias.length > 0) {
    await db.insert(horariosDia).values(dias);
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

// Step 4 — invitar miembros del equipo (opcional)
// Por cada miembro recibimos nombre/apellido/email/rol/telefono/sede y los
// creamos como profile + membership en la guardería. El usuario recibe mail
// de invitación para definir su contraseña (mismo patrón que createMiembroEquipoAction).
const TEAM_ROLES = [
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
type TeamRol = (typeof TEAM_ROLES)[number];

export type TeamMemberInput = {
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  telefono: string;
  sede: string;
};

export async function inviteTeamMembersStep(
  guarderiaId: string,
  miembros: TeamMemberInput[],
): Promise<ActionResult & { creados?: number; errores?: string[] }> {
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const errores: string[] = [];
  let creados = 0;

  for (const m of miembros) {
    const email = m.email.trim().toLowerCase();
    const nombre = m.nombre.trim();
    const apellido = m.apellido.trim();
    if (!email || !nombre) {
      errores.push(`Fila sin email o nombre — saltada`);
      continue;
    }
    if (!TEAM_ROLES.includes(m.rol as TeamRol)) {
      errores.push(`${email}: rol inválido`);
      continue;
    }

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${appUrl}/auth/callback?next=/crear-cuenta` },
    );

    if (inviteError) {
      const msg = inviteError.message.toLowerCase();
      if (msg.includes('already been registered') || msg.includes('already exists')) {
        errores.push(`${email}: ya tiene cuenta`);
      } else {
        errores.push(`${email}: ${inviteError.message}`);
      }
      continue;
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
          telefono: m.telefono.trim() || null,
          sede: m.sede.trim() || null,
        })
        .onConflictDoUpdate({
          target: profiles.id,
          set: {
            email,
            nombre,
            apellido,
            telefono: m.telefono.trim() || null,
            sede: m.sede.trim() || null,
          },
        });

      await db
        .insert(memberships)
        .values({
          userId: profileId,
          guarderiaId,
          rol: m.rol as TeamRol,
          status: 'active',
        })
        .onConflictDoNothing();

      creados++;
    } catch (err) {
      errores.push(`${email}: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    }
  }

  return { creados, errores: errores.length > 0 ? errores : undefined };
}

// Step 7 — plan
export async function selectPlanStep(
  guarderiaId: string,
  plan: 'classic' | 'plus' | 'platinum',
): Promise<ActionResult> {
  await db.update(guarderias).set({ plan }).where(eq(guarderias.id, guarderiaId));
  return {};
}
