'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { memberships, movimientosCuentaCorriente } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { fechaCalendariaArg } from '@/lib/dates';
import { and, eq, inArray } from 'drizzle-orm';

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo' ||
    ctx.activeMembership.rol === 'contable'
  );
}

const FORMAS_PAGO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
  debito_automatico: 'Débito automático',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  mercado_pago: 'Mercado Pago',
};

function conceptoFromPago(formaDePago: string, datosPago?: Record<string, unknown>): string {
  const label = FORMAS_PAGO_LABEL[formaDePago] ?? 'Pago';
  switch (formaDePago) {
    case 'transferencia': {
      const banco = datosPago?.banco ? ` ${datosPago.banco}` : '';
      const nro = datosPago?.nroOperacion ? ` Op. ${datosPago.nroOperacion}` : '';
      return `Pago — Transferencia${banco}${nro}`;
    }
    case 'cheque': {
      const nro = datosPago?.numeroCheque ? ` #${datosPago.numeroCheque}` : '';
      return `Pago — Cheque${nro}`;
    }
    case 'mercado_pago': {
      const nro = datosPago?.nroOperacion ? ` Op. ${datosPago.nroOperacion}` : '';
      return `Pago — Mercado Pago${nro}`;
    }
    default:
      return `Pago — ${label}`;
  }
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

export type InformarPagoData = {
  socioId: string;
  monto: string;
  fecha: string;
  formaDePago: string;
  datosPago?: Record<string, unknown>;
};

export async function informarPagoAction(
  data: InformarPagoData,
): Promise<{ error?: string; movimientoId?: string; concepto?: string; importe?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden informar pagos.' };
  if (!data.formaDePago) return { error: 'La forma de pago es obligatoria.' };

  const monto = parseFloat(data.monto);
  if (!Number.isFinite(monto) || monto <= 0) return { error: 'El monto debe ser mayor a 0.' };

  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, data.socioId),
        eq(memberships.guarderiaId, ctx.activeMembership.guarderiaId),
        eq(memberships.status, 'active'),
      ),
    );
  if (!m) return { error: 'El socio no pertenece a esta guardería.' };

  const concepto = conceptoFromPago(data.formaDePago, data.datosPago);

  try {
    const importe = monto.toFixed(2);
    const [inserted] = await db
      .insert(movimientosCuentaCorriente)
      .values({
        socioId: data.socioId,
        concepto,
        tipo: 'otro',
        estado: 'pagado',
        debe: '0',
        haber: importe,
        importeSigned: `-${importe}`,
        fecha: data.fecha ? fechaCalendariaArg(data.fecha) : new Date(),
        formaDePago: data.formaDePago as never,
        datosPago: data.datosPago ?? null,
        createdBy: ctx.user.id,
      })
      .returning({ id: movimientosCuentaCorriente.id });
    revalidatePath(`/usuarios/${data.socioId}`);
    return { movimientoId: inserted.id, concepto, importe };
  } catch {
    return { error: 'Error al registrar el pago.' };
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

export async function updateMovimientoAction(data: {
  movimientoId: string;
  concepto: string;
  fecha: string;
}): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden editar movimientos.' };

  const [mov] = await db
    .select({ id: movimientosCuentaCorriente.id, socioId: movimientosCuentaCorriente.socioId })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.id, data.movimientoId))
    .limit(1);

  if (!mov) return { error: 'El movimiento no existe.' };

  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, mov.socioId),
        eq(memberships.guarderiaId, ctx.activeMembership.guarderiaId),
      ),
    );
  if (!membership) return { error: 'El movimiento no pertenece a esta guardería.' };

  try {
    await db
      .update(movimientosCuentaCorriente)
      .set({
        concepto: data.concepto.trim() || null,
        fecha: fechaCalendariaArg(data.fecha),
      })
      .where(eq(movimientosCuentaCorriente.id, data.movimientoId));

    revalidatePath(`/usuarios/${mov.socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar el movimiento.' };
  }
}
