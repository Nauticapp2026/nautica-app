'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { invitations, memberships } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireUser, getActiveMarina, ACTIVE_MARINA_COOKIE } from '@/lib/auth/session';
import { ROLES, type Role } from '@/config/roles';

const inviteSchema = z.object({
  email: z.string().email('Email inválido'),
  role: z.enum([ROLES.MARINA_ADMIN, ROLES.OPERATOR, ROLES.MEMBER, ROLES.PROVIDER, ROLES.GUEST]),
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

  // Autorización: solo marina_admin o super_admin pueden invitar
  const canInvite = ctx.profile.isSuperAdmin || ctx.activeMembership.role === ROLES.MARINA_ADMIN;
  if (!canInvite) return { error: 'No autorizado' };

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const token = randomBytes(32).toString('base64url');

  await db.insert(invitations).values({
    marinaId: ctx.activeMembership.marinaId,
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role as Role,
    token,
    invitedBy: user.id,
  });

  // TODO Fase 3: enviar email con Resend
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`;

  revalidatePath('/dashboard/team');
  return { success: { inviteUrl } };
}

/**
 * Cambia la guardería activa del usuario. Valida que tenga membership.
 */
export async function switchMarina(marinaId: string) {
  const user = await requireUser();

  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.marinaId, marinaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new Error('No tenés acceso a esta guardería');
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_MARINA_COOKIE, marinaId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 año
  });

  revalidatePath('/', 'layout');
}
