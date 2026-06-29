'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  memberships,
  movimientosCuentaCorriente,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { fechaCalendariaArg } from '@/lib/dates';

type Ctx = NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>;

function isAdmin(ctx: Ctx): boolean {
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

// Mismo criterio de concepto que informarPagoAction (movimientos.ts).
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

// Tipos de comprobante que entran a la cobranza: facturas fiscales + recibos
// internos. Se excluyen explícitamente las notas de crédito.
const TIPOS_COBRABLES = ['factura_a', 'factura_b', 'factura_c', 'recibo'] as const;

export type ComprobantePendiente = {
  id: string;
  codigo: string | null;
  tipoFactura: string | null;
  importe: string;
  estado: string | null;
  emision: string | null;
  vencimiento: string | null;
  descripcion: string | null;
};

// Valida que el socio pertenezca a la guardería activa. Devuelve el membership.
async function assertSocioEnGuarderia(ctx: Ctx, socioId: string) {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, socioId),
        eq(memberships.guarderiaId, ctx.activeMembership.guarderiaId),
        eq(memberships.status, 'active'),
      ),
    );
  return m ?? null;
}

// ─── Comprobantes pendientes de cobro de un socio ──────────────────────────────

export async function getComprobantesPendientesAction(
  socioId: string,
): Promise<{ error?: string; comprobantes?: ComprobantePendiente[] }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden registrar cobranzas.' };

  const m = await assertSocioEnGuarderia(ctx, socioId);
  if (!m) return { error: 'El socio no pertenece a esta guardería.' };

  const rows = await db
    .select({
      id: facturacion.id,
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
      importe: facturacion.importe,
      estado: facturacion.estado,
      emision: facturacion.emision,
      vencimiento: facturacion.vencimiento,
      descripcion: facturacion.descripcion,
    })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.guarderiaId, ctx.activeMembership.guarderiaId),
        eq(facturacion.socioId, socioId),
        inArray(facturacion.estado, ['pendiente', 'vencida']),
        inArray(facturacion.tipoFactura, [...TIPOS_COBRABLES]),
      ),
    )
    .orderBy(facturacion.emision);

  return {
    comprobantes: rows.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      tipoFactura: r.tipoFactura,
      importe: r.importe ?? '0',
      estado: r.estado,
      emision: r.emision ? r.emision.toISOString() : null,
      vencimiento: r.vencimiento ? r.vencimiento.toISOString() : null,
      descripcion: r.descripcion,
    })),
  };
}

// ─── Registrar una cobranza ────────────────────────────────────────────────────

export type RegistrarCobranzaData = {
  socioId: string;
  comprobanteIds: string[];
  fecha: string;
  formaDePago: string;
  datosPago?: Record<string, unknown>;
};

export async function registrarCobranzaAction(data: RegistrarCobranzaData): Promise<{
  error?: string;
  movimientoId?: string;
  concepto?: string;
  importe?: string;
}> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden registrar cobranzas.' };
  if (!data.formaDePago) return { error: 'La forma de pago es obligatoria.' };
  if (!data.comprobanteIds?.length) return { error: 'Seleccioná al menos un comprobante.' };

  const gId = ctx.activeMembership.guarderiaId;

  const m = await assertSocioEnGuarderia(ctx, data.socioId);
  if (!m) return { error: 'El socio no pertenece a esta guardería.' };

  // Traer los comprobantes seleccionados, validando que sean del socio + guardería
  // y que sigan pendientes/vencidos. El total se recalcula acá (no se confía en el cliente).
  const comprobantes = await db
    .select({
      id: facturacion.id,
      importe: facturacion.importe,
      movimientoId: facturacion.movimientoId,
    })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.guarderiaId, gId),
        eq(facturacion.socioId, data.socioId),
        inArray(facturacion.id, data.comprobanteIds),
        inArray(facturacion.estado, ['pendiente', 'vencida']),
        inArray(facturacion.tipoFactura, [...TIPOS_COBRABLES]),
      ),
    );

  if (comprobantes.length !== data.comprobanteIds.length) {
    return {
      error: 'Algún comprobante ya no está disponible para cobrar. Refrescá e intentá de nuevo.',
    };
  }

  const total = comprobantes.reduce((acc, c) => acc + parseFloat(c.importe ?? '0'), 0);
  if (!Number.isFinite(total) || total <= 0)
    return { error: 'El total a cobrar debe ser mayor a 0.' };

  const importe = total.toFixed(2);
  const concepto = conceptoFromPago(data.formaDePago, data.datosPago);
  const fecha = data.fecha ? fechaCalendariaArg(data.fecha) : new Date();
  const medioPago = data.formaDePago as never;
  const facturaIds = comprobantes.map((c) => c.id);

  try {
    const movimientoId = await db.transaction(async (tx) => {
      // 1. Movimiento de pago (haber) por el total cobrado.
      const [pago] = await tx
        .insert(movimientosCuentaCorriente)
        .values({
          socioId: data.socioId,
          concepto,
          tipo: 'otro',
          estado: 'pagado',
          debe: '0',
          haber: importe,
          importeSigned: `-${importe}`,
          fecha,
          formaDePago: medioPago,
          datosPago: data.datosPago ?? null,
          createdBy: ctx.user.id,
        })
        .returning({ id: movimientosCuentaCorriente.id });

      // 2. Marcar los comprobantes como pagados.
      await tx
        .update(facturacion)
        .set({ estado: 'pagada', medioPago, updatedAt: new Date() })
        .where(inArray(facturacion.id, facturaIds));

      // 3. Propagar 'pagado' a los cargos vinculados — por las dos vías de enlace:
      //    a) link directo facturacion.movimiento_id (recibos internos de un cargo).
      const directMovIds = comprobantes
        .map((c) => c.movimientoId)
        .filter((id): id is string => Boolean(id));

      //    b) relación M:N facturacion_items → facturacion_item_movimientos (facturas).
      const items = await tx
        .select({ id: facturacionItems.id })
        .from(facturacionItems)
        .where(inArray(facturacionItems.facturacionId, facturaIds));

      let linkMovIds: string[] = [];
      if (items.length > 0) {
        const links = await tx
          .select({ movimientoId: facturacionItemMovimientos.movimientoId })
          .from(facturacionItemMovimientos)
          .where(
            inArray(
              facturacionItemMovimientos.facturacionItemId,
              items.map((i) => i.id),
            ),
          );
        linkMovIds = links.map((l) => l.movimientoId);
      }

      const movIds = Array.from(new Set([...directMovIds, ...linkMovIds]));
      if (movIds.length > 0) {
        await tx
          .update(movimientosCuentaCorriente)
          .set({ estado: 'pagado' })
          .where(inArray(movimientosCuentaCorriente.id, movIds));
      }

      return pago.id;
    });

    revalidatePath(`/usuarios/${data.socioId}`);
    revalidatePath('/facturacion');
    revalidatePath('/cobranzas');
    return { movimientoId, concepto, importe };
  } catch {
    return { error: 'Error al registrar la cobranza.' };
  }
}
