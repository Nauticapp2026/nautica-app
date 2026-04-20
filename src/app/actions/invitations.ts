'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { invitations, memberships } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireUser, getActiveMarina, ACTIVE_GUARDERIA_COOKIE } from '@/lib/auth/session';
import { ROLES, type Rol } from '@/config/roles';

const inviteSchema = z.object({
  email: z.string().email('Email inválido'),
  rol: z.enum([
    ROLES.ADMINISTRADOR_GENERAL,
    ROLES.OPERARIO,
    ROLES.CONTABLE,
    ROLES.MANTENIMIENTO,
    ROLES.COMUNICACIONES,
    ROLES.RESTAURANTES,
    ROLES.SOCIO,
    ROLES.INVITADO,
    ROLES.PROVEEDOR,
  ]),
});

export type InviteResult = {
  error?: string;
  success?: { inviteUrl: string };
  fieldErrors?: Record<string, string[]>;
};

export async function createInvitation(
  _: InviteResult | null,
  formData: FormData,
): Promise<InviteResult> {
  const user = await requireUser();
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No hay guardería activa' };

  const canInvite =
    ctx.profile.isSuperAdmin || ctx.activeMembership.rol === ROLES.ADMINISTRADOR_GENERAL;
  if (!canInvite) return { error: 'No autorizado' };

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    rol: formData.get('rol'),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const token = randomBytes(32).toString('base64url');

  await db.insert(invitations).values({
    guarderiaId: ctx.activeMembership.guarderiaId,
    email: parsed.data.email.toLowerCase(),
    rol: parsed.data.rol as Rol,
    token,
    invitedBy: user.id,
  });

  // TODO Fase 3: enviar email con Resend
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`;

  revalidatePath('/dashboard/team');
  return { success: { inviteUrl } };
}

export async function switchGuarderia(guarderiaId: string) {
  const user = await requireUser();

  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new Error('No tenés acceso a esta guardería');
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_GUARDERIA_COOKIE, guarderiaId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/', 'layout');
}
