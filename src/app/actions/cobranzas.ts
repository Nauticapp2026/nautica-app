'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, count, eq, inArray, like } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  memberships,
  movimientosCuentaCorriente,
  paywayTokens,
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

// Mapeo de la forma de cobranza (UI) al enum medio_pago de la DB. Las formas que
// no mapean 1:1 (dólares → efectivo) o no existen en el enum (otro) caen a null.
// En un pago combinado (más de una forma) se guarda null y el detalle va en datos_pago.
const FORMA_TO_MEDIO: Record<string, string | null> = {
  efectivo: 'efectivo',
  efectivo_usd: 'efectivo',
  tarjeta_credito: 'tarjeta_credito',
  tarjeta_debito: 'tarjeta_debito',
  transferencia: 'transferencia',
  cheque: 'cheque',
  mercado_pago: 'mercado_pago',
  otro: null,
};

function medioPagoDeFormas(formas: { tipo: string }[]): string | null {
  if (formas.length === 1) return FORMA_TO_MEDIO[formas[0].tipo] ?? null;
  return null; // pago combinado
}

const MARCA_TARJETA: Record<string, string> = { '1': 'Visa', '2': 'Mastercard', '65': 'Amex' };

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

export async function getComprobantesPendientesAction(socioId: string): Promise<{
  error?: string;
  comprobantes?: ComprobantePendiente[];
  tarjeta?: { marca: string; lastFour: string } | null;
}> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden registrar cobranzas.' };

  const m = await assertSocioEnGuarderia(ctx, socioId);
  if (!m) return { error: 'El socio no pertenece a esta guardería.' };

  // Tarjeta guardada del socio (token Payway) — para "usar la que tiene cargada".
  const [tok] = await db
    .select({
      paymentMethodId: paywayTokens.paymentMethodId,
      lastFour: paywayTokens.lastFour,
    })
    .from(paywayTokens)
    .where(
      and(
        eq(paywayTokens.socioId, socioId),
        eq(paywayTokens.guarderiaId, ctx.activeMembership.guarderiaId),
        eq(paywayTokens.activo, true),
      ),
    )
    .limit(1);
  const tarjeta = tok
    ? { marca: MARCA_TARJETA[String(tok.paymentMethodId)] ?? 'Tarjeta', lastFour: tok.lastFour }
    : null;

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

  if (rows.length === 0) return { comprobantes: [], tarjeta };

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
    tarjeta,
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
    if (debe <= 0) continue;
    if (m.estado === 'pagado') {
      // Ya pagado: consume su parte del pool (su haber está comprometido), igual
      // que calcularSaldoYEstado, para no inflar la cobertura de otros cargos.
      pagados.add(m.id);
      pool -= debe;
      continue;
    }
    if (pool >= debe - 0.001) {
      pool -= debe;
      pagados.add(m.id);
    }
  }

  return pagados;
}

// ─── Registrar una cobranza ────────────────────────────────────────────────────

export type FormaCobranzaInput = {
  tipo: string;
  monto: string; // pesos
  datos: Record<string, string>;
};

export type RegistrarCobranzaData = {
  socioId: string;
  comprobanteIds: string[];
  fecha: string;
  montoAPagar: string;
  formas: FormaCobranzaInput[];
};

export async function registrarCobranzaAction(data: RegistrarCobranzaData): Promise<{
  error?: string;
  movimientoId?: string;
  importe?: string;
}> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden registrar cobranzas.' };
  if (!data.formas?.length) return { error: 'Cargá al menos una forma de pago.' };
  if (!data.comprobanteIds?.length) return { error: 'Seleccioná al menos un comprobante.' };

  const montoAPagar = parseFloat(data.montoAPagar);
  if (!Number.isFinite(montoAPagar) || montoAPagar <= 0)
    return { error: 'El monto a pagar debe ser mayor a 0.' };

  // La suma de las formas tiene que dar el monto a pagar (no se confía en el cliente).
  const sumaFormas = data.formas.reduce((acc, f) => acc + (parseFloat(f.monto) || 0), 0);
  if (Math.abs(sumaFormas - montoAPagar) > 0.01)
    return { error: 'La suma de las formas de pago no coincide con el monto a pagar.' };

  const gId = ctx.activeMembership.guarderiaId;

  const m = await assertSocioEnGuarderia(ctx, data.socioId);
  if (!m) return { error: 'El socio no pertenece a esta guardería.' };

  // Comprobantes seleccionados, ordenados del más viejo al más nuevo (FIFO).
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
    )
    .orderBy(asc(facturacion.emision));

  if (comprobantes.length !== data.comprobanteIds.length) {
    return {
      error: 'Algún comprobante ya no está disponible para cobrar. Refrescá e intentá de nuevo.',
    };
  }

  // FIFO: el monto cubre los comprobantes del más viejo al más nuevo. Solo los que
  // se cubren ENTEROS quedan pagados; el primero que no alcanza (y el resto) sigue
  // pendiente. El excedente (si pagó de más) queda como saldo a favor.
  let remaining = montoAPagar;
  const pagados: typeof comprobantes = [];
  for (const c of comprobantes) {
    const imp = parseFloat(c.importe ?? '0');
    if (remaining >= imp - 0.001) {
      remaining -= imp;
      pagados.push(c);
    } else {
      break;
    }
  }
  const pagadosIds = pagados.map((c) => c.id);

  const importe = montoAPagar.toFixed(2);
  const fecha = data.fecha ? fechaCalendariaArg(data.fecha) : new Date();
  const medioPago = medioPagoDeFormas(data.formas) as never;
  const datosPago = { montoAPagar: importe, formas: data.formas };

  try {
    const movimientoId = await db.transaction(async (tx) => {
      // 1. Numerar el recibo de cobranza (RC-NNNNNN), distinto de los RB- de cargo.
      const [{ n }] = await tx
        .select({ n: count() })
        .from(facturacion)
        .where(
          and(
            eq(facturacion.guarderiaId, gId),
            eq(facturacion.tipoFactura, 'recibo'),
            like(facturacion.codigo, 'RC-%'),
          ),
        );
      const codigo = `RC-${String(Number(n) + 1).padStart(6, '0')}`;

      // 2. Movimiento de pago (haber) por el monto pagado.
      const [pago] = await tx
        .insert(movimientosCuentaCorriente)
        .values({
          socioId: data.socioId,
          concepto: `Cobranza ${codigo}`,
          tipo: 'otro',
          estado: 'pagado',
          debe: '0',
          haber: importe,
          importeSigned: `-${importe}`,
          fecha,
          formaDePago: medioPago,
          datosPago,
          createdBy: ctx.user.id,
        })
        .returning({ id: movimientosCuentaCorriente.id });

      // 3. Marcar como pagados solo los comprobantes cubiertos enteros (FIFO).
      if (pagadosIds.length > 0) {
        await tx
          .update(facturacion)
          .set({ estado: 'pagada', medioPago, updatedAt: new Date() })
          .where(inArray(facturacion.id, pagadosIds));

        // Propagar 'pagado' a los cargos vinculados (link directo + M:N).
        const directMovIds = pagados
          .map((c) => c.movimientoId)
          .filter((id): id is string => Boolean(id));

        const items = await tx
          .select({ id: facturacionItems.id })
          .from(facturacionItems)
          .where(inArray(facturacionItems.facturacionId, pagadosIds));

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
      }

      // 4. Crear el recibo de cobranza (guarda las formas y los comprobantes pagados).
      await tx.insert(facturacion).values({
        guarderiaId: gId,
        socioId: data.socioId,
        tipoFactura: 'recibo',
        estado: 'pagada',
        importe,
        descripcion: 'Cobranza',
        medioPago,
        emision: fecha,
        movimientoId: pago.id,
        codigo,
        cobranzaComprobanteIds: pagadosIds,
      });

      return pago.id;
    });

    revalidatePath(`/usuarios/${data.socioId}`);
    revalidatePath('/ventas');
    revalidatePath('/cobranzas');
    return { movimientoId, importe };
  } catch {
    return { error: 'Error al registrar la cobranza.' };
  }
}

// ─── Anular un recibo de cobranza (reversa total) ──────────────────────────────

const TIPOS_FISCALES = ['factura_a', 'factura_b', 'factura_c'];

// Anular = deshacer el cobro: revierte el pago (borra el haber), devuelve los
// comprobantes cobrados a 'pendiente' y sus cargos al estado previo (fiscal →
// 'facturado', recibo interno → 'no_pagado'), y marca el recibo anulado con
// fecha. No genera comprobante. Siempre por el total.
export async function anularCobranzaAction(reciboId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden anular cobranzas.' };

  const gId = ctx.activeMembership.guarderiaId;

  const [recibo] = await db
    .select({
      id: facturacion.id,
      socioId: facturacion.socioId,
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
      movimientoId: facturacion.movimientoId,
      anulada: facturacion.anulada,
      cobranzaComprobanteIds: facturacion.cobranzaComprobanteIds,
    })
    .from(facturacion)
    .where(and(eq(facturacion.id, reciboId), eq(facturacion.guarderiaId, gId)))
    .limit(1);

  if (!recibo) return { error: 'Recibo no encontrado.' };
  if (recibo.tipoFactura !== 'recibo' || !recibo.codigo?.startsWith('RC-')) {
    return { error: 'Solo se pueden anular recibos de cobranza.' };
  }
  if (recibo.anulada) return { error: 'El recibo ya está anulado.' };

  const comprobanteIds = recibo.cobranzaComprobanteIds ?? [];

  try {
    await db.transaction(async (tx) => {
      if (comprobanteIds.length > 0) {
        // Comprobantes cobrados + su tipo, para saber a qué estado volver el cargo.
        const comps = await tx
          .select({
            id: facturacion.id,
            tipoFactura: facturacion.tipoFactura,
            movimientoId: facturacion.movimientoId,
          })
          .from(facturacion)
          .where(inArray(facturacion.id, comprobanteIds));

        // Cargos por las dos vías de enlace (directo + M:N).
        const items = await tx
          .select({ id: facturacionItems.id, facturacionId: facturacionItems.facturacionId })
          .from(facturacionItems)
          .where(inArray(facturacionItems.facturacionId, comprobanteIds));
        const itemToFac = new Map(items.map((i) => [i.id, i.facturacionId]));
        const links = items.length
          ? await tx
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
        for (const c of comps) {
          const s = new Set<string>();
          if (c.movimientoId) s.add(c.movimientoId);
          cargosPorComprobante.set(c.id, s);
        }
        for (const l of links) {
          const facId = itemToFac.get(l.facturacionItemId);
          if (facId) cargosPorComprobante.get(facId)?.add(l.movimientoId);
        }

        const cargosAFacturado: string[] = [];
        const cargosANoPagado: string[] = [];
        for (const c of comps) {
          const cargos = [...(cargosPorComprobante.get(c.id) ?? [])];
          if (TIPOS_FISCALES.includes(c.tipoFactura ?? '')) cargosAFacturado.push(...cargos);
          else cargosANoPagado.push(...cargos);
        }

        if (cargosAFacturado.length > 0) {
          await tx
            .update(movimientosCuentaCorriente)
            .set({ estado: 'facturado' })
            .where(inArray(movimientosCuentaCorriente.id, cargosAFacturado));
        }
        if (cargosANoPagado.length > 0) {
          await tx
            .update(movimientosCuentaCorriente)
            .set({ estado: 'no_pagado' })
            .where(inArray(movimientosCuentaCorriente.id, cargosANoPagado));
        }

        // Comprobantes vuelven a pendiente.
        await tx
          .update(facturacion)
          .set({ estado: 'pendiente', updatedAt: new Date() })
          .where(inArray(facturacion.id, comprobanteIds));
      }

      // Revertir el pago: borrar el haber de la cobranza.
      if (recibo.movimientoId) {
        await tx
          .delete(movimientosCuentaCorriente)
          .where(eq(movimientosCuentaCorriente.id, recibo.movimientoId));
      }

      // Marcar el recibo anulado.
      await tx
        .update(facturacion)
        .set({ anulada: true, anuladaAt: new Date(), updatedAt: new Date() })
        .where(eq(facturacion.id, reciboId));
    });

    if (recibo.socioId) revalidatePath(`/usuarios/${recibo.socioId}`);
    revalidatePath('/ventas');
    revalidatePath('/cobranzas');
    return {};
  } catch {
    return { error: 'Error al anular la cobranza.' };
  }
}
