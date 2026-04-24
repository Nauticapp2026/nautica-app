'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { translateAuthError } from '@/lib/auth/errors';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, 'Nombre requerido'),
});

export type ActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function login(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return { error: translateAuthError(error.message) };

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signup(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) return { error: translateAuthError(error.message) };

  return { error: undefined };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * Devuelve el contexto de acceso del usuario actual para decidir a dónde
 * mandarlo después de setear su contraseña.
 * - 'web': rol con acceso al dashboard (admin_general / operario / super_admin)
 * - 'mobile': rol que opera desde la app mobile (socio, invitado, etc)
 * - 'no_membership': cuenta sin membership activa
 * - 'no_session': no hay usuario autenticado
 */
export async function getPostSignupAccess(): Promise<
  { kind: 'web' } | { kind: 'mobile' } | { kind: 'no_membership' } | { kind: 'no_session' }
> {
  const { getActiveMarina, getCurrentUser } = await import('@/lib/auth/session');
  const user = await getCurrentUser();
  if (!user) return { kind: 'no_session' };

  const active = await getActiveMarina();
  if (!active) return { kind: 'no_membership' };

  const webRoles = new Set(['administrador_general', 'operario']);
  if (active.profile.isSuperAdmin || webRoles.has(active.activeMembership.rol)) {
    return { kind: 'web' };
  }
  return { kind: 'mobile' };
}
