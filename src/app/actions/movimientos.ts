'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { memberships, movimientosCuentaCorriente } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { fechaCalendariaArg } from '@/lib/dates';
import { and, eq } from 'drizzle-orm';

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo' ||
    ctx.activeMembership.rol === 'contable'
  );
}

export type AddMovimientoData = {
  socioId: string;
  servicioId: string;
  concepto: string;
  monto: string;
  fecha: string;
  estado?: 'no_pagado' | 'pagado';
  formaDePago?: string;
  datosPago?: Record<string, unknown>;
};

export async function addMovimientoAction(data: AddMovimientoData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  const estado = data.estado ?? 'no_pagado';

  try {
    await db.insert(movimientosCuentaCorriente).values({
      socioId: data.socioId,
      servicioId: data.servicioId || null,
      concepto: data.concepto.trim() || null,
      tipo: 'otro',
      estado,
      debe: data.monto || '0',
      fecha: data.fecha ? fechaCalendariaArg(data.fecha) : new Date(),
      createdBy: ctx.user.id,
      ...(estado === 'pagado' && data.formaDePago
        ? {
            formaDePago: data.formaDePago as never,
            datosPago: data.datosPago ?? null,
          }
        : {}),
    });
    revalidatePath(`/usuarios/${data.socioId}`);
    return {};
  } catch {
    return { error: 'Error al agregar el movimiento.' };
  }
}

// Anular un pago a cuenta. Admin only. Solo se puede borrar movimientos
// que sean efectivamente pagos (haber > 0) — no toca cargos ni movimientos
// que ya fueron facturados.
export async function eliminarPagoAction(movimientoId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden anular pagos.' };

  const [mov] = await db
    .select({
      id: movimientosCuentaCorriente.id,
      socioId: movimientosCuentaCorriente.socioId,
      haber: movimientosCuentaCorriente.haber,
      debe: movimientosCuentaCorriente.debe,
    })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.id, movimientoId))
    .limit(1);

  if (!mov) return { error: 'El pago no existe o ya fue eliminado.' };
  if (parseFloat(mov.haber ?? '0') <= 0 || parseFloat(mov.debe ?? '0') > 0) {
    return { error: 'Solo se pueden anular pagos a cuenta.' };
  }

  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, mov.socioId),
        eq(memberships.guarderiaId, ctx.activeMembership.guarderiaId),
      ),
    );
  if (!m) return { error: 'El pago no pertenece a esta guardería.' };

  try {
    await db
      .delete(movimientosCuentaCorriente)
      .where(eq(movimientosCuentaCorriente.id, movimientoId));
    revalidatePath(`/usuarios/${mov.socioId}`);
    return {};
  } catch {
    return { error: 'Error al anular el pago.' };
  }
}
