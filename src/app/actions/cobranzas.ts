'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, count, eq, inArray, isNull, like, notLike, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  guarderias,
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

// Tipos de comprobante que entran a la cobranza: facturas fiscales, notas de
// débito (deuda nueva del socio, se cobran igual que una factura) y recibos
// internos. Se excluyen explícitamente las notas de crédito.
const TIPOS_COBRABLES = [
  'factura_a',
  'factura_b',
  'factura_c',
  'nota_debito_a',
  'nota_debito_b',
  'nota_debito_c',
  'recibo',
] as const;

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

  // Se listan TODOS los comprobantes cobrables del socio, incluso los que ya
  // figuran cobrados o cubiertos por pagos vía FIFO (pedido del cliente
  // 2026-07-30: antes se ocultaban y el club no los veía). El club decide qué
  // cobrar; un doble cobro queda como saldo a favor y el recibo se puede
  // anular. Solo quedan afuera los anulados y los rechazados por ARCA, que no
  // son deuda válida. El estado viaja para que la UI etiquete "Cobrada".
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
        inArray(facturacion.tipoFactura, [...TIPOS_COBRABLES]),
        eq(facturacion.anulada, false),
        eq(facturacion.rechazada, false),
        // Los recibos de cobranza (RC-) también son tipo 'recibo' pero
        // documentan un pago pasado, no deuda: nunca son cobrables.
        or(isNull(facturacion.codigo), notLike(facturacion.codigo, 'RC-%')),
      ),
    )
    .orderBy(facturacion.emision);

  return {
    tarjeta,
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
    return { error: 'El monto a cobrar debe ser mayor a 0.' };

  // La suma de las formas tiene que dar el monto a pagar (no se confía en el cliente).
  const sumaFormas = data.formas.reduce((acc, f) => acc + (parseFloat(f.monto) || 0), 0);
  if (Math.abs(sumaFormas - montoAPagar) > 0.01)
    return { error: 'La suma de las formas de pago no coincide con el monto a cobrar.' };

  const gId = ctx.activeMembership.guarderiaId;

  const m = await assertSocioEnGuarderia(ctx, data.socioId);
  if (!m) return { error: 'El socio no pertenece a esta guardería.' };

  // Comprobantes seleccionados, ordenados del más viejo al más nuevo (FIFO).
  const comprobantes = await db
    .select({
      id: facturacion.id,
      importe: facturacion.importe,
      movimientoId: facturacion.movimientoId,
      tipoFactura: facturacion.tipoFactura,
    })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.guarderiaId, gId),
        eq(facturacion.socioId, data.socioId),
        inArray(facturacion.id, data.comprobanteIds),
        // Sin filtro de estado: se puede cobrar también un comprobante que ya
        // figura cobrado (decisión del cliente 2026-07-30 — el doble cobro
        // queda como saldo a favor y el recibo se puede anular). Se excluyen
        // anulados, rechazados y los recibos de cobranza RC- (documentan un
        // pago pasado, no deuda).
        inArray(facturacion.tipoFactura, [...TIPOS_COBRABLES]),
        eq(facturacion.anulada, false),
        eq(facturacion.rechazada, false),
        or(isNull(facturacion.codigo), notLike(facturacion.codigo, 'RC-%')),
      ),
    )
    .orderBy(asc(facturacion.emision));

  if (comprobantes.length !== data.comprobanteIds.length) {
    return {
      error: 'Algún comprobante ya no está disponible para cobrar. Refrescá e intentá de nuevo.',
    };
  }

  // Un recibo no puede mezclar comprobantes fiscales (factura_a/b/c) con
  // internos (recibo/CM-/CL-) — son circuitos separados.
  const tiposEnSeleccion = new Set(
    comprobantes.map((c) => (c.tipoFactura === 'recibo' ? 'interno' : 'fiscal')),
  );
  if (tiposEnSeleccion.size > 1) {
    return { error: 'No se pueden cobrar juntos comprobantes fiscales e internos.' };
  }
  const tipoRecibo = tiposEnSeleccion.has('interno') ? 'interno' : 'fiscal';

  // Comprobantes internos solo se cobran con los medios que el club habilitó
  // en Mi Perfil → Datos Impositivos → Configuración de cobranzas. Efectivo
  // en dólares cuenta como Efectivo; 'otro' no es un medio configurable.
  if (tipoRecibo === 'interno') {
    const [g] = await db
      .select({ medios: guarderias.mediosCobroInternos })
      .from(guarderias)
      .where(eq(guarderias.id, gId))
      .limit(1);
    const medios = g?.medios ?? [];
    if (medios.length === 0) {
      return {
        error:
          'Los comprobantes internos están deshabilitados. Habilitá al menos un medio de pago en Mi Perfil → Datos Impositivos → Configuración de cobranzas.',
      };
    }
    const noPermitida = data.formas.find(
      (f) => !medios.includes(f.tipo === 'efectivo_usd' ? 'efectivo' : f.tipo),
    );
    if (noPermitida) {
      return {
        error:
          'Alguna forma de pago no está habilitada para comprobantes internos. Revisá la Configuración de cobranzas en Mi Perfil.',
      };
    }
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
        tipoRecibo,
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

// Incluye las ND: su cargo nace 'facturado' (tiene comprobante fiscal propio),
// igual que el de una factura.
const TIPOS_FISCALES = [
  'factura_a',
  'factura_b',
  'factura_c',
  'nota_debito_a',
  'nota_debito_b',
  'nota_debito_c',
];

// Anular = deshacer el cobro: revierte el pago con un CONTRAASIENTO (el haber
// original queda visible en la cuenta corriente y se agrega un debe
// 'anulacion_recibo' por el mismo monto), devuelve los comprobantes cobrados a
// 'pendiente' y sus cargos al estado previo (fiscal → 'facturado', recibo
// interno → 'no_pagado'), y marca el recibo anulado con fecha. No genera
// comprobante. Siempre por el total.
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
      importe: facturacion.importe,
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
      // Marcar anulado PRIMERO, con guarda atómica: si otra request (doble
      // click, dos admins) ya lo anuló, acá no matchea ninguna fila y se
      // aborta — sin esto se insertarían dos contraasientos.
      const marcado = await tx
        .update(facturacion)
        .set({ anulada: true, anuladaAt: new Date(), updatedAt: new Date() })
        .where(and(eq(facturacion.id, reciboId), eq(facturacion.anulada, false)))
        .returning({ id: facturacion.id });
      if (marcado.length === 0) throw new Error('YA_ANULADO');

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

      // Revertir el pago SIN borrarlo: la cobranza original queda visible en
      // la cuenta corriente y se agrega un contraasiento (debe) por el mismo
      // monto que la anula. El par pago+contraasiento se excluye del pool
      // FIFO de cobertura (ver reconciliar-cuenta.ts) para que esa plata no
      // cubra otros cargos.
      if (recibo.movimientoId) {
        // Sin fallback al importe del recibo: si el haber del pago ya no
        // existe, no hay nada que revertir — un contraasiento sin su par
        // generaría deuda fantasma.
        const [pago] = await tx
          .select({ haber: movimientosCuentaCorriente.haber })
          .from(movimientosCuentaCorriente)
          .where(eq(movimientosCuentaCorriente.id, recibo.movimientoId))
          .limit(1);
        const monto = parseFloat(pago?.haber ?? '0');
        if (recibo.socioId && monto > 0.001) {
          await tx.insert(movimientosCuentaCorriente).values({
            socioId: recibo.socioId,
            concepto: `Anulación recibo ${recibo.codigo}`,
            tipo: 'anulacion_recibo',
            estado: 'pagado',
            debe: monto.toFixed(2),
            haber: '0',
            importeSigned: monto.toFixed(2),
            fecha: new Date(),
          });
        }
      }
    });

    if (recibo.socioId) revalidatePath(`/usuarios/${recibo.socioId}`);
    revalidatePath('/ventas');
    revalidatePath('/cobranzas');
    return {};
  } catch (err) {
    if (err instanceof Error && err.message === 'YA_ANULADO') {
      return { error: 'El recibo ya está anulado.' };
    }
    return { error: 'Error al anular la cobranza.' };
  }
}
