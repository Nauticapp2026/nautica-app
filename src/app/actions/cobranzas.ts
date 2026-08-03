'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, count, eq, inArray, isNull, like, ne, notLike, or } from 'drizzle-orm';

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
import { getAplicadoPorComprobante } from '@/lib/cobranza-cobertura';
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
  // Lo que falta cobrar: importe − pagos parciales aplicados − NC asociadas.
  // Es el monto que la cobranza puede aplicar a este comprobante.
  importePendiente: string;
  cobradoParcial: boolean;
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

  // Solo los comprobantes PENDIENTES de cobro, total o parcial (pedido del
  // cliente 2026-08-03: los ya cobrados enteros no se muestran). Quedan
  // afuera los 'pagada', los anulados y los rechazados por ARCA. De los que
  // tienen cobros parciales (recibos targeted) o NC asociadas se muestra el
  // saldo que falta cobrar.
  const [rows, aplicado] = await Promise.all([
    db
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
          or(isNull(facturacion.estado), ne(facturacion.estado, 'pagada')),
          // Los recibos de cobranza (RC-/CI-) también son tipo 'recibo' pero
          // documentan un pago pasado, no deuda: nunca son cobrables.
          or(
            isNull(facturacion.codigo),
            and(notLike(facturacion.codigo, 'RC-%'), notLike(facturacion.codigo, 'CI-%')),
          ),
        ),
      )
      .orderBy(facturacion.emision),
    getAplicadoPorComprobante(socioId, ctx.activeMembership.guarderiaId),
  ]);

  return {
    tarjeta,
    comprobantes: rows.flatMap((r) => {
      const importe = parseFloat(r.importe ?? '0');
      const cubierto = aplicado.get(r.id) ?? 0;
      const pendiente = importe - cubierto;
      // Cubierto entero por pagos parciales previos + NC (aunque el estado
      // todavía no diga 'pagada'): no hay nada que cobrar.
      if (pendiente <= 0.005) return [];
      return [
        {
          id: r.id,
          codigo: r.codigo,
          tipoFactura: r.tipoFactura,
          importe: r.importe ?? '0',
          importePendiente: pendiente.toFixed(2),
          cobradoParcial: cubierto > 0.005,
          estado: r.estado,
          emision: r.emision ? r.emision.toISOString() : null,
          vencimiento: r.vencimiento ? r.vencimiento.toISOString() : null,
          descripcion: r.descripcion,
        },
      ];
    }),
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
  // Sin comprobantes seleccionados (adelanto) no hay de dónde derivar el
  // canal: lo dice el modal. Con comprobantes, manda el tipo de los elegidos.
  canal?: 'fiscal' | 'interno';
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
  // Puede no haber ninguno: cobranza sin comprobante = adelanto, el monto
  // queda como saldo a favor en la cuenta corriente.
  const comprobanteIds = data.comprobanteIds ?? [];
  const comprobantes = comprobanteIds.length
    ? await db
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
            inArray(facturacion.id, comprobanteIds),
            // Solo comprobantes con saldo pendiente (los 'pagada' ya no se
            // cobran — pedido del cliente 2026-08-03). Se excluyen anulados,
            // rechazados y los recibos de cobranza RC-/CI- (documentan un
            // pago pasado, no deuda).
            inArray(facturacion.tipoFactura, [...TIPOS_COBRABLES]),
            eq(facturacion.anulada, false),
            eq(facturacion.rechazada, false),
            or(isNull(facturacion.estado), ne(facturacion.estado, 'pagada')),
            or(
              isNull(facturacion.codigo),
              and(notLike(facturacion.codigo, 'RC-%'), notLike(facturacion.codigo, 'CI-%')),
            ),
          ),
        )
        .orderBy(asc(facturacion.emision))
    : [];

  if (comprobantes.length !== comprobanteIds.length) {
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
  const tipoRecibo: 'fiscal' | 'interno' =
    comprobantes.length > 0
      ? tiposEnSeleccion.has('interno')
        ? 'interno'
        : 'fiscal'
      : (data.canal ?? 'fiscal');

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
          'Los comprobantes internos están deshabilitados. Habilitá al menos un medio de pago en Mi Perfil → Datos Impositivos → Gestión de cobranza.',
      };
    }
    const noPermitida = data.formas.find(
      (f) => !medios.includes(f.tipo === 'efectivo_usd' ? 'efectivo' : f.tipo),
    );
    if (noPermitida) {
      return {
        error:
          'Alguna forma de pago no está habilitada para comprobantes internos. Revisá la Gestión de cobranza en Mi Perfil.',
      };
    }
  }

  // El monto se aplica SOLO a los comprobantes seleccionados, del más viejo
  // al más nuevo, y puede cubrir el último en parte (pago parcial): esa parte
  // queda registrada como aplicación targeted sobre ESE comprobante — nunca
  // "sobra" hacia comprobantes no seleccionados (ver cobranza-cobertura.ts).
  // Solo los cubiertos enteros (contando cobros parciales previos) pasan a
  // 'pagada'. El excedente (si pagó de más) queda como saldo a favor.
  const aplicadoPrevio = comprobantes.length
    ? await getAplicadoPorComprobante(data.socioId, gId)
    : new Map<string, number>();

  let remaining = montoAPagar;
  const aplicaciones: { comprobanteId: string; monto: string }[] = [];
  const pagados: typeof comprobantes = [];
  for (const c of comprobantes) {
    if (remaining <= 0.005) break;
    const restante = parseFloat(c.importe ?? '0') - (aplicadoPrevio.get(c.id) ?? 0);
    if (restante <= 0.005) continue;
    const aplicar = Math.min(remaining, restante);
    aplicaciones.push({ comprobanteId: c.id, monto: aplicar.toFixed(2) });
    remaining -= aplicar;
    if (aplicar >= restante - 0.005) pagados.push(c);
  }
  // El recibo guarda TODOS los comprobantes a los que aplicó algo (enteros o
  // parciales) — el PDF los muestra y la anulación los revierte.
  const aplicadosIds = aplicaciones.map((a) => a.comprobanteId);
  const pagadosIds = pagados.map((c) => c.id);

  const importe = montoAPagar.toFixed(2);
  const fecha = data.fecha ? fechaCalendariaArg(data.fecha) : new Date();
  const medioPago = medioPagoDeFormas(data.formas) as never;
  const datosPago = { montoAPagar: importe, formas: data.formas, aplicaciones };
  const esAdelanto = comprobantes.length === 0;

  try {
    const movimientoId = await db.transaction(async (tx) => {
      // 1. Numerar el recibo de cobranza, distinto de los RB- de cargo. La
      // numeración es INDEPENDIENTE por canal: RC-NNNNNN para fiscales,
      // CI-NNNNNN para internos (pedido del cliente 2026-08-03).
      const prefijo = tipoRecibo === 'interno' ? 'CI' : 'RC';
      const [{ n }] = await tx
        .select({ n: count() })
        .from(facturacion)
        .where(
          and(
            eq(facturacion.guarderiaId, gId),
            eq(facturacion.tipoFactura, 'recibo'),
            like(facturacion.codigo, `${prefijo}-%`),
          ),
        );
      const codigo = `${prefijo}-${String(Number(n) + 1).padStart(6, '0')}`;

      // 2. Movimiento de pago (haber) por el monto pagado.
      const [pago] = await tx
        .insert(movimientosCuentaCorriente)
        .values({
          socioId: data.socioId,
          concepto: esAdelanto ? `Adelanto ${codigo}` : `Cobranza ${codigo}`,
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

      // 4. Crear el recibo de cobranza (guarda las formas y los comprobantes
      // a los que aplicó — enteros o parciales).
      await tx.insert(facturacion).values({
        guarderiaId: gId,
        socioId: data.socioId,
        tipoFactura: 'recibo',
        estado: 'pagada',
        importe,
        descripcion: esAdelanto ? 'Adelanto a cuenta' : 'Cobranza',
        medioPago,
        emision: fecha,
        movimientoId: pago.id,
        codigo,
        cobranzaComprobanteIds: aplicadosIds,
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
  const esReciboCobranza =
    recibo.codigo != null && (recibo.codigo.startsWith('RC-') || recibo.codigo.startsWith('CI-'));
  if (recibo.tipoFactura !== 'recibo' || !esReciboCobranza) {
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
