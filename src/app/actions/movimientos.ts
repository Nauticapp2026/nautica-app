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

export type MarcarPagadasData = {
  ids: string[];
  socioId: string;
  formaDePago: string;
  datosPago?: Record<string, unknown>;
};

export async function marcarPagadasAction(data: MarcarPagadasData): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden registrar pagos.' };
  if (!data.ids.length) return { error: 'No hay movimientos seleccionados.' };

  // Scope multi-tenant: validar que TODOS los movimientos pertenezcan a un socio
  // de la guardería activa antes de mutar. movimientos_cuenta_corriente no tiene
  // guarderia_id, así que se ata vía la membership del socio. Sin esto, un admin
  // podría marcar pagados movimientos de otra guardería (IDOR). RLS no cubre esto:
  // Drizzle usa el pooler y no propaga la sesión de auth.
  const validos = await db
    .select({ id: movimientosCuentaCorriente.id })
    .from(movimientosCuentaCorriente)
    .innerJoin(memberships, eq(memberships.userId, movimientosCuentaCorriente.socioId))
    .where(
      and(
        inArray(movimientosCuentaCorriente.id, data.ids),
        eq(memberships.guarderiaId, ctx.activeMembership.guarderiaId),
      ),
    );
  if (validos.length !== data.ids.length) {
    return { error: 'Movimientos inválidos.' };
  }

  const setData: Record<string, unknown> = {
    estado: 'pagado',
    formaDePago: data.formaDePago,
    datosPago: data.datosPago ?? null,
  };

  // Para métodos con importe explícito, comparar contra el total de los items
  // seleccionados y generar un movimiento ajuste si hay diferencia.
  const methodsWithAmount = ['cheque', 'transferencia', 'mercado_pago'];
  let importePagado = 0;
  if (methodsWithAmount.includes(data.formaDePago) && data.datosPago?.importe) {
    importePagado = parseFloat(String(data.datosPago.importe));
  }

  try {
    await db
      .update(movimientosCuentaCorriente)
      .set(setData as never)
      .where(inArray(movimientosCuentaCorriente.id, data.ids));

    if (methodsWithAmount.includes(data.formaDePago) && importePagado > 0) {
      const items = await db
        .select({ debe: movimientosCuentaCorriente.debe })
        .from(movimientosCuentaCorriente)
        .where(inArray(movimientosCuentaCorriente.id, data.ids));
      const totalDebe = items.reduce((acc, m) => acc + parseFloat(m.debe ?? '0'), 0);
      const diff = importePagado - totalDebe;

      if (Math.abs(diff) >= 0.01) {
        let conceptoBase = '';
        switch (data.formaDePago) {
          case 'cheque': {
            const nro = data.datosPago?.numeroCheque ? ` #${data.datosPago.numeroCheque}` : '';
            conceptoBase = `Cheque${nro}`;
            break;
          }
          case 'transferencia': {
            const op = data.datosPago?.nroOperacion ? ` Op. ${data.datosPago.nroOperacion}` : '';
            conceptoBase = `Transferencia${op}`;
            break;
          }
          case 'mercado_pago':
            conceptoBase = 'Mercado Pago';
            break;
        }

        if (diff > 0) {
          const importe = diff.toFixed(2);
          await db.insert(movimientosCuentaCorriente).values({
            socioId: data.socioId,
            concepto: `Saldo a favor — ${conceptoBase}`,
            tipo: 'otro',
            estado: 'pagado',
            debe: '0',
            haber: importe,
            importeSigned: `-${importe}`,
            fecha: new Date(),
            createdBy: ctx.user.id,
          });
        } else {
          const importe = Math.abs(diff).toFixed(2);
          await db.insert(movimientosCuentaCorriente).values({
            socioId: data.socioId,
            concepto: `Saldo pendiente — ${conceptoBase} no cubre el total`,
            tipo: 'otro',
            estado: 'no_pagado',
            debe: importe,
            haber: '0',
            importeSigned: importe,
            fecha: new Date(),
            createdBy: ctx.user.id,
          });
        }
      }
    }

    revalidatePath(`/usuarios/${data.socioId}`);
    return {};
  } catch {
    return { error: 'Error al actualizar los movimientos.' };
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
