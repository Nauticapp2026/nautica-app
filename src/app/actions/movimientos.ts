'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { memberships, movimientosCuentaCorriente } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { and, eq, inArray } from 'drizzle-orm';

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return ctx.profile.isSuperAdmin || ctx.activeMembership.rol === 'administrador_general';
}

export type AddMovimientoData = {
  socioId: string;
  servicioId: string;
  concepto: string;
  monto: string;
  fecha: string;
};

export type MarcarPagadasData = {
  ids: string[];
  socioId: string;
  formaDePago: string;
  // Transferencia
  bancoTransferencia?: string;
  clienteTransferencia?: string;
  cbuAliasTransferencia?: string;
  montoTransferencia?: string;
  fechaTransferencia?: string;
  numeroOperacionTransferencia?: string;
  observacionesTransferencia?: string;
  // Cheque
  numeroCheque?: string;
  bancoEmisorCheque?: string;
  sucursalCheque?: string;
  cuitCuilCheque?: string;
  titularCheque?: string;
  importeCheque?: string;
  tipoCheque?: string;
  monedaCheque?: string;
  cuentaCheque?: string;
  observacionesCheque?: string;
};

export async function addMovimientoAction(data: AddMovimientoData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };

  try {
    await db.insert(movimientosCuentaCorriente).values({
      socioId: data.socioId,
      servicioId: data.servicioId || null,
      concepto: data.concepto.trim() || null,
      tipo: 'otro',
      estado: 'no_pagado',
      debe: data.monto || '0',
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
    });
    revalidatePath(`/usuarios/${data.socioId}`);
    return {};
  } catch {
    return { error: 'Error al agregar el movimiento.' };
  }
}

export async function marcarPagadasAction(data: MarcarPagadasData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!data.ids.length) return { error: 'No hay movimientos seleccionados.' };

  const setData: Record<string, unknown> = {
    estado: 'pagado',
    formaDePago: data.formaDePago,
  };

  if (data.formaDePago === 'transferencia') {
    Object.assign(setData, {
      bancoTransferencia: data.bancoTransferencia || null,
      clienteTransferencia: data.clienteTransferencia || null,
      cbuAliasTransferencia: data.cbuAliasTransferencia || null,
      montoTransferencia: data.montoTransferencia || null,
      fechaTransferencia: data.fechaTransferencia ? new Date(data.fechaTransferencia) : null,
      numeroOperacionTransferencia: data.numeroOperacionTransferencia || null,
      observacionesTransferencia: data.observacionesTransferencia || null,
    });
  } else if (data.formaDePago === 'cheque') {
    Object.assign(setData, {
      numeroCheque: data.numeroCheque || null,
      bancoEmisorCheque: data.bancoEmisorCheque || null,
      sucursalCheque: data.sucursalCheque || null,
      cuitCuilCheque: data.cuitCuilCheque || null,
      titularCheque: data.titularCheque || null,
      importeCheque: data.importeCheque || null,
      tipoCheque: data.tipoCheque || null,
      monedaCheque: data.monedaCheque || null,
      cuentaCheque: data.cuentaCheque || null,
      observacionesCheque: data.observacionesCheque || null,
    });
  }

  try {
    await db
      .update(movimientosCuentaCorriente)
      .set(setData as never)
      .where(inArray(movimientosCuentaCorriente.id, data.ids));
    revalidatePath(`/usuarios/${data.socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar los movimientos.' };
  }
}

// Informar un pago a cuenta del socio. Crea un movimiento con `haber > 0`
// (es un crédito que reduce el saldo pendiente) y estado 'pagado' (porque
// ES un pago, no algo por cobrar). El concepto guarda lo que el admin
// escriba en el modal (descripción + forma de pago, libre).
export type InformarPagoData = {
  socioId: string;
  concepto: string;
  monto: string;
  fecha: string;
};

export async function informarPagoAction(data: InformarPagoData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden informar pagos.' };

  const concepto = data.concepto.trim();
  if (!concepto) return { error: 'El concepto es obligatorio.' };

  const monto = parseFloat(data.monto);
  if (!Number.isFinite(monto) || monto <= 0) return { error: 'El monto debe ser mayor a 0.' };

  // Verificar que el socio pertenezca a la guarderia activa.
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

  try {
    const importe = monto.toFixed(2);
    await db.insert(movimientosCuentaCorriente).values({
      socioId: data.socioId,
      concepto,
      tipo: 'otro',
      estado: 'pagado',
      debe: '0',
      haber: importe,
      // importeSigned negativo: convención del esquema (haber descuenta del saldo).
      importeSigned: `-${importe}`,
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
    });
    revalidatePath(`/usuarios/${data.socioId}`);
    return {};
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

  // Verificar que el socio pertenezca a la guarderia activa (multi-tenancy).
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
