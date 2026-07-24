import { eq } from 'drizzle-orm';

import { translateInviteError } from '@/lib/auth/errors';
import { db } from '@/lib/db';
import { equipoInvitacionesPendientes, memberships, profiles, rolEnum } from '@/lib/db/schema';
import { createAdminClient } from '@/lib/supabase/admin';

type Rol = (typeof rolEnum.enumValues)[number];

export type MiembroEquipoInvitacion = {
  nombre: string;
  apellido: string;
  email: string;
  rol: Rol;
  telefono: string | null;
  sede: string | null;
};

// Crea el auth user, envía el mail de invitación (el invitado define su
// contraseña en /crear-cuenta) y persiste profile + membership.
// Devuelve un mensaje de error, o null si salió bien.
export async function enviarInvitacionEquipo(
  guarderiaId: string,
  m: MiembroEquipoInvitacion,
): Promise<string | null> {
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL no configurado');

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    m.email,
    { redirectTo: `${appUrl}/auth/callback?next=/crear-cuenta` },
  );
  if (inviteError) {
    console.error('[enviarInvitacionEquipo] inviteError', m.email, inviteError);
    return translateInviteError(inviteError.message);
  }

  const profileId = inviteData.user.id;

  try {
    await db
      .insert(profiles)
      .values({
        id: profileId,
        email: m.email,
        nombre: m.nombre,
        apellido: m.apellido,
        telefono: m.telefono,
        sede: m.sede,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          email: m.email,
          nombre: m.nombre,
          apellido: m.apellido,
          telefono: m.telefono,
          sede: m.sede,
        },
      });

    await db
      .insert(memberships)
      .values({ userId: profileId, guarderiaId, rol: m.rol, status: 'active' })
      .onConflictDoNothing();
  } catch (err) {
    console.error('[enviarInvitacionEquipo] DB error', m.email, err);
    return err instanceof Error ? err.message : 'Error desconocido';
  }

  return null;
}

// Envía las invitaciones que quedaron encoladas mientras la guardería estaba
// pendiente de alta. Las que salen bien se borran de la cola; las que fallan
// quedan (se reintentan si la guardería se vuelve a activar).
export async function despacharInvitacionesPendientes(
  guarderiaId: string,
): Promise<{ enviadas: number; errores: string[] }> {
  const pendientes = await db
    .select()
    .from(equipoInvitacionesPendientes)
    .where(eq(equipoInvitacionesPendientes.guarderiaId, guarderiaId));

  let enviadas = 0;
  const errores: string[] = [];

  for (const p of pendientes) {
    const err = await enviarInvitacionEquipo(guarderiaId, {
      nombre: p.nombre,
      apellido: p.apellido,
      email: p.email,
      rol: p.rol,
      telefono: p.telefono,
      sede: p.sede,
    });
    if (err) {
      errores.push(`${p.email}: ${err}`);
      continue;
    }
    await db.delete(equipoInvitacionesPendientes).where(eq(equipoInvitacionesPendientes.id, p.id));
    enviadas++;
  }

  return { enviadas, errores };
}
