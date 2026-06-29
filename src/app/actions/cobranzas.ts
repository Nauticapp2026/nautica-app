'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, eq, inArray } from 'drizzle-orm';

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
      movimientoId: facturacion.movimientoId,
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

  if (rows.length === 0) return { comprobantes: [] };

  // Un comprobante puede figurar 'pendiente' en facturacion pero estar ya cubierto
  // por un pago neto (haber) vía el FIFO de la cuenta corriente — la cuenta corriente
  // lo muestra "Pagado". No hay que ofrecerlo para cobrar de nuevo. Calculamos qué
  // cargos están saldados (mismo criterio que calcularSaldoYEstado en el display) y
  // ocultamos los comprobantes cuyos cargos ya estén todos cubiertos.
  const cargosPagados = await getCargosPagadosFifo(socioId);

  // Mapear cada comprobante a sus cargos: link directo (recibos internos) + M:N (facturas).
  const facIds = rows.map((r) => r.id);
  const items = await db
    .select({ id: facturacionItems.id, facturacionId: facturacionItems.facturacionId })
    .from(facturacionItems)
    .where(inArray(facturacionItems.facturacionId, facIds));
  const itemToFac = new Map(items.map((i) => [i.id, i.facturacionId]));
  const links = items.length
    ? await db
        .select({
          facturacionItemId: facturacionItemMovimientos.facturacionItemId,
          movimientoId: facturacionItemMovimientos.movimientoId,
        })
        .from(facturacionItemMovimientos)
        .where(
          inArray(
            facturacionItemMovimientos.facturacionItemId,
            items.map((i) => i.id),
          ),
        )
    : [];

  const cargosPorComprobante = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = new Set<string>();
    if (r.movimientoId) s.add(r.movimientoId);
    cargosPorComprobante.set(r.id, s);
  }
  for (const l of links) {
    const facId = itemToFac.get(l.facturacionItemId);
    if (facId) cargosPorComprobante.get(facId)?.add(l.movimientoId);
  }

  // Mostrar el comprobante salvo que TODOS sus cargos estén saldados. Si no tiene
  // cargos vinculados, no podemos inferir cobertura → se muestra.
  const visibles = rows.filter((r) => {
    const cargos = cargosPorComprobante.get(r.id);
    if (!cargos || cargos.size === 0) return true;
    for (const c of cargos) if (!cargosPagados.has(c)) return true;
    return false;
  });

  return {
    comprobantes: visibles.map((r) => ({
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

// Conjunto de ids de cargos (movimientos con debe>0) que están saldados para el
// socio: los ya `pagado`, más los cubiertos por el pool de haberes vía FIFO (del
// más viejo al más nuevo). Mismo criterio que `calcularSaldoYEstado` en el display.
async function getCargosPagadosFifo(socioId: string): Promise<Set<string>> {
  const movs = await db
    .select({
      id: movimientosCuentaCorriente.id,
      debe: movimientosCuentaCorriente.debe,
      haber: movimientosCuentaCorriente.haber,
      estado: movimientosCuentaCorriente.estado,
    })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.socioId, socioId))
    .orderBy(asc(movimientosCuentaCorriente.fecha), asc(movimientosCuentaCorriente.createdAt));

  let pool = movs.reduce((acc, m) => acc + parseFloat(m.haber ?? '0'), 0);
  const pagados = new Set<string>();

  for (const m of movs) {
    const debe = parseFloat(m.debe ?? '0');
    if (m.estado === 'pagado') {
      if (debe > 0) pagados.add(m.id);
      continue;
    }
    if (debe <= 0) continue;
    if (pool >= debe - 0.001) {
      pool -= debe;
      pagados.add(m.id);
    }
  }

  return pagados;
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
