'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { memberships, profiles } from '@/lib/db/schema';
import { requireSuperAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEMBERSHIP_ROLES } from '@/config/roles';

const uuidSchema = z.string().uuid('ID inválido.');
const rolSchema = z.enum(MEMBERSHIP_ROLES);

function revalidate() {
  revalidatePath('/super-admin/usuarios');
}

export async function deleteUserAction(userId: string): Promise<{ error?: string }> {
  const { profile: actor } = await requireSuperAdmin();

  const parsed = uuidSchema.safeParse(userId);
  if (!parsed.success) return { error: 'ID inválido.' };
  if (parsed.data === actor.id) return { error: 'No podés eliminar tu propia cuenta.' };

  // El delete en auth.users cascadea a profiles (FK on delete cascade) y de
  // ahí a memberships, así que con esto alcanza.
  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(parsed.data);
  if (error) return { error: error.message };

  revalidate();
  return {};
}

const toggleSuperAdminSchema = z.object({
  userId: uuidSchema,
  value: z.boolean(),
});

export async function toggleSuperAdminAction(input: {
  userId: string;
  value: boolean;
}): Promise<{ error?: string }> {
  const { profile: actor } = await requireSuperAdmin();

  const parsed = toggleSuperAdminSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos.' };
  if (parsed.data.userId === actor.id && parsed.data.value === false) {
    return { error: 'No podés quitarte el flag de super admin a vos mismo.' };
  }

  await db
    .update(profiles)
    .set({ isSuperAdmin: parsed.data.value, updatedAt: new Date() })
    .where(eq(profiles.id, parsed.data.userId));

  revalidate();
  return {};
}

const updateRolSchema = z.object({
  membershipId: uuidSchema,
  rol: rolSchema,
});

export async function updateMembershipRolAction(input: {
  membershipId: string;
  rol: string;
}): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = updateRolSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  await db
    .update(memberships)
    .set({ rol: parsed.data.rol, updatedAt: new Date() })
    .where(eq(memberships.id, parsed.data.membershipId));

  revalidate();
  return {};
}

export async function removeMembershipAction(membershipId: string): Promise<{ error?: string }> {
  await requireSuperAdmin();

  const parsed = uuidSchema.safeParse(membershipId);
  if (!parsed.success) return { error: 'ID inválido.' };

  await db.delete(memberships).where(eq(memberships.id, parsed.data));

  revalidate();
  return {};
}
