'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { ADMIN_ROLES } from '@/config/roles';
import { getActiveMarina } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { alertas, porteria } from '@/lib/db/schema';

export async function marcarAlertaResueltaAction(alertaId: string) {
  const ctx = await getActiveMarina();
  if (!ctx) return { ok: false, error: 'Sin sesión.' };

  const gId = ctx.activeMembership.guarderiaId;

  const result = await db
    .update(alertas)
    .set({
      estado: 'resuelta',
      resolvedAt: new Date(),
      resolvedBy: ctx.user.id,
    })
    .where(and(eq(alertas.id, alertaId), eq(alertas.guarderiaId, gId)))
    .returning({ id: alertas.id });

  if (result.length === 0) {
    return { ok: false, error: 'Alerta no encontrada.' };
  }

  revalidatePath('/dashboard');
  return { ok: true };
}

export async function cerrarPorteriaAction(porteriaId: string) {
  const ctx = await getActiveMarina();
  if (!ctx) return { ok: false, error: 'Sin sesión.' };

  const rol = ctx.activeMembership.rol as string;
  if (!ctx.profile.isSuperAdmin && !ADMIN_ROLES.includes(rol as (typeof ADMIN_ROLES)[number])) {
    return { ok: false, error: 'Sin permisos.' };
  }

  const gId = ctx.activeMembership.guarderiaId;

  const result = await db
    .update(porteria)
    .set({ arribadaEn: new Date() })
    .where(and(eq(porteria.id, porteriaId), eq(porteria.guarderiaId, gId)))
    .returning({ id: porteria.id });

  if (result.length === 0) {
    return { ok: false, error: 'Salida no encontrada.' };
  }

  revalidatePath('/dashboard');
  return { ok: true };
}
