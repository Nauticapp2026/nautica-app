'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, count, eq, inArray, isNull, like, ne, notLike, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

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
import { getPendientePorComprobante } from '@/lib/cobranza-cobertura';
import { fechaCalendariaArg } from '@/lib/dates';
import { getEstadoFifo } from '@/lib/reconciliar-cuenta';

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

// Saldo a favor disponible del socio: el mismo "poolRestante" que ya usa
// reconciliar-cuenta.ts para decidir qué cargos están saldados — NO es el
// saldo neto crudo (haber − debe de TODO), que da $0 en cuanto hay más deuda
// pendiente que crédito aunque ese crédito siga sin usar (pedido 2026-08-06).
// excluirAdelantos: un adelanto sin comprobante no saldó nada solo (pedido
// 2026-08-11) — sigue entero disponible hasta que ESTA acción lo aplique.
async function getSaldoAFavorDisponible(socioId: string): Promise<number> {
  const { poolRestante } = await getEstadoFifo(socioId, { excluirAdelantos: true });
  return poolRestante;
}

export async function getSaldoAFavorAction(
  socioId: string,
): Promise<{ error?: string; disponible?: number }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  const m = await assertSocioEnGuarderia(ctx, socioId);
  if (!m) return { error: 'El socio no pertenece a esta guardería.' };
  return { disponible: await getSaldoAFavorDisponible(socioId) };
}

// Toda nota de crédito se aplica A MANO en Cobranzas — relacionada a una
// factura o no, total o parcial, sin ningún caso automático (decisión del
// cliente 2026-08-28). La relación con la factura original es documental. La
// interna (NCI-) también entra: anula un comprobante interno sin ARCA.
const TIPOS_NC_APLICABLES = [
  'nota_credito_a',
  'nota_credito_b',
  'nota_credito_c',
  'nota_credito_interna',
] as const;

/** Nota de crédito pendiente, disponible para aplicar en una cobranza. */
export type NotaCreditoSuelta = {
  id: string;
  codigo: string | null;
  tipoFactura: string | null;
  importe: string;
  emision: string | null;
  descripcion: string | null;
  // Código de la factura a la que se emitió relacionada (referencia
  // documental; no ata la aplicación — puede usarse en cualquier factura).
  facturaOriginalCodigo: string | null;
};

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
  notasCredito?: NotaCreditoSuelta[];
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
  // afuera los 'pagada', los anulados y los rechazados por ARCA. El saldo
  // pendiente descuenta cobros parciales (recibos targeted), NC asociadas y
  // cargos ya cobrados por otra vía (ej. débito automático Payway en un
  // comprobante interno mixto) — ver getPendientePorComprobante.
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
        or(isNull(facturacion.estado), ne(facturacion.estado, 'pagada')),
        // Los recibos de cobranza (RC-/CI-) también son tipo 'recibo' pero
        // documentan un pago pasado, no deuda: nunca son cobrables.
        or(
          isNull(facturacion.codigo),
          and(notLike(facturacion.codigo, 'RC-%'), notLike(facturacion.codigo, 'CI-%')),
        ),
      ),
    )
    .orderBy(facturacion.emision);

  const pendientes = await getPendientePorComprobante(
    socioId,
    ctx.activeMembership.guarderiaId,
    rows,
  );

  // Notas de crédito SUELTAS sin juntar: crédito emitido que todavía no está
  // asignado a ninguna factura. Se ofrecen como línea que RESTA para que el club
  // elija con qué factura las junta (pedido cliente 2026-08-19). No entran por
  // TIPOS_COBRABLES no las incluye (una NC no es deuda): van en su propia
  // lista. Entran TODAS las pendientes, relacionadas o no — el self-join trae
  // el código de la factura original solo como referencia visual.
  const facturaOriginal = alias(facturacion, 'factura_original');
  const ncPendientes = await db
    .select({
      id: facturacion.id,
      codigo: facturacion.codigo,
      tipoFactura: facturacion.tipoFactura,
      importe: facturacion.importe,
      estado: facturacion.estado,
      emision: facturacion.emision,
      vencimiento: facturacion.vencimiento,
      descripcion: facturacion.descripcion,
      facturaOriginalCodigo: facturaOriginal.codigo,
    })
    .from(facturacion)
    .leftJoin(facturaOriginal, eq(facturaOriginal.id, facturacion.facturaOriginalId))
    .where(
      and(
        eq(facturacion.guarderiaId, ctx.activeMembership.guarderiaId),
        eq(facturacion.socioId, socioId),
        inArray(facturacion.tipoFactura, [...TIPOS_NC_APLICABLES]),
        eq(facturacion.estado, 'pendiente'),
        eq(facturacion.anulada, false),
        eq(facturacion.rechazada, false),
      ),
    )
    .orderBy(facturacion.emision);

  return {
    tarjeta,
    notasCredito: ncPendientes.map((n) => ({
      id: n.id,
      codigo: n.codigo,
      tipoFactura: n.tipoFactura,
      importe: n.importe ?? '0',
      emision: n.emision ? n.emision.toISOString() : null,
      descripcion: n.descripcion,
      facturaOriginalCodigo: n.facturaOriginalCodigo,
    })),
    comprobantes: rows.flatMap((r) => {
      const importe = parseFloat(r.importe ?? '0');
      const pendiente = pendientes.get(r.id) ?? importe;
      // Cubierto entero por otras vías (aunque el estado todavía no diga
      // 'pagada'): no hay nada que cobrar.
      if (pendiente <= 0.005) return [];
      return [
        {
          id: r.id,
          codigo: r.codigo,
          tipoFactura: r.tipoFactura,
          importe: r.importe ?? '0',
          importePendiente: pendiente.toFixed(2),
          cobradoParcial: pendiente < importe - 0.005,
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
  // Plata REAL a cobrar (la que respaldan las formas de pago) — puede ser 0
  // si el saldo a favor cubre el total solo.
  montoAPagar: string;
  formas: FormaCobranzaInput[];
  // Sin comprobantes seleccionados (adelanto) no hay de dónde derivar el
  // canal: lo dice el modal. Con comprobantes, manda el tipo de los elegidos.
  canal?: 'fiscal' | 'interno';
  // Reparto explícito elegido por el club cuando hay 2+ comprobantes: cuánto
  // del pago va a cada uno. Si viene, manda sobre el FIFO por antigüedad (el
  // pedido del cliente 2026-08-05). Ausente = reparto automático del más viejo
  // al más nuevo (caso de un solo comprobante o adelanto).
  aplicaciones?: { comprobanteId: string; monto: string }[];
  // Cuánto del saldo a favor del socio se aplica en esta cobranza, además de
  // `montoAPagar` (pedido 2026-08-06). No es plata nueva: no se suma al haber
  // del movimiento (eso duplicaría el crédito) — solo amplía lo que el recibo
  // declara cubierto en `aplicaciones`. Requiere 1+ comprobantes seleccionados.
  montoSaldoAFavor?: string;
  // Notas de crédito sueltas que se usan en esta cobranza. NO se atan a una
  // factura puntual: como el saldo a favor, su importe amplía lo que el recibo
  // declara cubierto y se reparte entre los comprobantes seleccionados con el
  // mismo criterio que la plata (el reparto del club, o FIFO). Tampoco es plata
  // nueva: no suma al haber del movimiento, porque el haber de la NC ya existe
  // en la cuenta corriente.
  notasCredito?: string[];
};

export async function registrarCobranzaAction(data: RegistrarCobranzaData): Promise<{
  error?: string;
  movimientoId?: string;
  importe?: string;
}> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores pueden registrar cobranzas.' };

  const montoAPagar = parseFloat(data.montoAPagar);
  if (!Number.isFinite(montoAPagar) || montoAPagar < 0)
    return { error: 'El monto a cobrar no puede ser negativo.' };

  const montoSaldoAFavor = parseFloat(data.montoSaldoAFavor ?? '0');
  if (!Number.isFinite(montoSaldoAFavor) || montoSaldoAFavor < 0) {
    return { error: 'El saldo a favor a aplicar no puede ser negativo.' };
  }
  if (montoSaldoAFavor > 0 && (data.comprobanteIds ?? []).length === 0) {
    return { error: 'El saldo a favor solo se puede aplicar a comprobantes seleccionados.' };
  }

  // Lo que el recibo declara cubierto: plata real + saldo a favor + (más abajo)
  // las notas de crédito usadas. El chequeo de "algo tiene que pasar en esta
  // cobranza" se hace después de validar las notas, porque una nota que cubre la
  // factura entera es una cobranza válida aunque no entre un peso.
  let montoTotalAplicar = montoAPagar + montoSaldoAFavor;

  // Formas de pago solo son obligatorias si hay plata real de por medio — si
  // el saldo a favor cubre el total, no hace falta ninguna.
  if (montoAPagar > 0.005) {
    if (!data.formas?.length) return { error: 'Cargá al menos una forma de pago.' };
    // La suma de las formas tiene que dar la plata real a cobrar (no se
    // confía en el cliente).
    const sumaFormas = data.formas.reduce((acc, f) => acc + (parseFloat(f.monto) || 0), 0);
    if (Math.abs(sumaFormas - montoAPagar) > 0.01)
      return { error: 'La suma de las formas de pago no coincide con el monto a cobrar.' };
  }

  const gId = ctx.activeMembership.guarderiaId;

  const m = await assertSocioEnGuarderia(ctx, data.socioId);
  if (!m) return { error: 'El socio no pertenece a esta guardería.' };

  if (montoSaldoAFavor > 0.005) {
    const disponible = await getSaldoAFavorDisponible(data.socioId);
    if (montoSaldoAFavor > disponible + 0.01) {
      return {
        error: `El saldo a favor disponible es $${disponible.toFixed(2)}, no se puede aplicar más que eso.`,
      };
    }
  }

  // ── Notas de crédito sueltas que se juntan en esta cobranza ────────────────
  // Se validan contra la DB (no se confía en el cliente): que sean del socio y
  // la guardería, que sigan sueltas y pendientes, y que la factura elegida esté
  // entre las seleccionadas.
  const notasPedidas = [...new Set(data.notasCredito ?? [])];
  let montoNotasCredito = 0;
  // Las NC usadas se guardan en datosPago para que la anulación del recibo
  // pueda devolverlas a 'pendiente' (sin esto su crédito moría con el recibo).
  let notasUsadas: { id: string; importe: string | null }[] = [];

  if (notasPedidas.length > 0) {
    if ((data.comprobanteIds ?? []).length === 0) {
      return {
        error: 'Una nota de crédito solo se puede aplicar a comprobantes seleccionados.',
      };
    }

    const notasDb = await db
      .select({ id: facturacion.id, importe: facturacion.importe })
      .from(facturacion)
      .where(
        and(
          eq(facturacion.guarderiaId, gId),
          eq(facturacion.socioId, data.socioId),
          inArray(facturacion.id, notasPedidas),
          inArray(facturacion.tipoFactura, [...TIPOS_NC_APLICABLES]),
          eq(facturacion.estado, 'pendiente'),
          eq(facturacion.anulada, false),
          eq(facturacion.rechazada, false),
        ),
      );
    if (notasDb.length !== notasPedidas.length) {
      return {
        error: 'Alguna nota de crédito ya fue usada o no está disponible. Recargá la página.',
      };
    }
    for (const n of notasDb) {
      const importe = parseFloat(n.importe ?? '0');
      if (!(importe > 0)) return { error: 'La nota de crédito no tiene importe.' };
      montoNotasCredito += importe;
    }
    notasUsadas = notasDb;
  }

  // El importe de las notas se suma a lo aplicable: se reparte entre los
  // comprobantes elegidos igual que la plata. Así una nota que cubre la factura
  // entera la deja saldada sin que entre un peso.
  montoTotalAplicar += montoNotasCredito;

  if (montoTotalAplicar <= 0) {
    return { error: 'El monto a cobrar debe ser mayor a 0.' };
  }

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

  // El monto se aplica SOLO a los comprobantes seleccionados y puede cubrir un
  // comprobante en parte (pago parcial): esa parte queda registrada como
  // aplicación targeted sobre ESE comprobante — nunca "sobra" hacia
  // comprobantes no seleccionados (ver cobranza-cobertura.ts). Solo los
  // cubiertos enteros (contando cobros parciales previos y cargos ya
  // debitados) pasan a 'pagada'. El excedente queda como saldo a favor.
  //
  // Reparto: si el club mandó `aplicaciones` (elige a mano cuánto va a cada
  // comprobante cuando tildó 2+), se respeta ese reparto; si no, se aplica del
  // más viejo al más nuevo (FIFO) — caso de un solo comprobante.
  const pendientePrevio = comprobantes.length
    ? await getPendientePorComprobante(data.socioId, gId, comprobantes)
    : new Map<string, number>();

  const restanteDe = (c: (typeof comprobantes)[number]) =>
    pendientePrevio.get(c.id) ?? parseFloat(c.importe ?? '0');

  const aplicaciones: { comprobanteId: string; monto: string }[] = [];
  const pagados: typeof comprobantes = [];

  if (data.aplicaciones?.length) {
    const porComp = new Map(
      data.aplicaciones.map((a) => [a.comprobanteId, parseFloat(a.monto) || 0]),
    );
    // Toda aplicación tiene que referir a un comprobante de la selección.
    for (const compId of porComp.keys()) {
      if (!comprobantes.some((c) => c.id === compId)) {
        return { error: 'Reparto inválido: refrescá la página y volvé a intentar.' };
      }
    }
    let sumaAplicada = 0;
    for (const c of comprobantes) {
      const monto = porComp.get(c.id) ?? 0;
      if (monto < 0) return { error: 'Los montos por comprobante no pueden ser negativos.' };
      if (monto <= 0.005) continue;
      const restante = restanteDe(c);
      if (monto > restante + 0.01) {
        return {
          error: 'No se puede cobrar más de lo que debe un comprobante. Revisá los montos.',
        };
      }
      aplicaciones.push({ comprobanteId: c.id, monto: monto.toFixed(2) });
      sumaAplicada += monto;
      if (monto >= restante - 0.005) pagados.push(c);
    }
    if (sumaAplicada > montoTotalAplicar + 0.01) {
      return { error: 'La suma de los montos por comprobante supera el monto a cobrar.' };
    }
  } else {
    let remaining = montoTotalAplicar;
    for (const c of comprobantes) {
      if (remaining <= 0.005) break;
      const restante = restanteDe(c);
      if (restante <= 0.005) continue;
      const aplicar = Math.min(remaining, restante);
      aplicaciones.push({ comprobanteId: c.id, monto: aplicar.toFixed(2) });
      remaining -= aplicar;
      if (aplicar >= restante - 0.005) pagados.push(c);
    }
  }
  // El recibo guarda TODOS los comprobantes a los que aplicó algo (enteros o
  // parciales) — el PDF los muestra y la anulación los revierte.
  const aplicadosIds = aplicaciones.map((a) => a.comprobanteId);
  const pagadosIds = pagados.map((c) => c.id);

  // Con NC sueltas adjuntas no puede quedar excedente sin aplicar. El excedente
  // de plata real es un adelanto legítimo (vuelve como saldo a favor vía el
  // pool), pero el de una NC se perdería en silencio: la nota se consume entera
  // (pasa a 'pagada') y su crédito queda excluido del pool (nc-cobertura.ts).
  // Caso real: RC-000003 del club IVA (2026-08-24) — factura de $2,42 cubierta
  // entera en efectivo + NC de $1,00 adjunta → $1 quemado sin aplicarse a nada.
  if (montoNotasCredito > 0.005) {
    const sumaAplicada = aplicaciones.reduce((acc, a) => acc + parseFloat(a.monto), 0);
    const sobrante = montoTotalAplicar - sumaAplicada;
    if (sobrante > 0.01) {
      return {
        error: `Entre lo cobrado y la nota de crédito sobran $${sobrante.toFixed(2)} que no se aplican a ningún comprobante, y el resto de una nota de crédito no queda como saldo a favor: se perdería. Bajá el efectivo o sumá comprobantes hasta cubrir la diferencia.`,
      };
    }
  }

  // El recibo declara cubierto el TOTAL aplicado (plata real + saldo a favor);
  // el movimiento de cuenta corriente (haber real) solo refleja la plata que
  // realmente entró hoy — así no se duplica el crédito ya cobrado antes (ver
  // getSaldoAFavorDisponible: es una suma cruda de debe/haber, y el crédito
  // usado ya estaba contado en el haber de un pago viejo).
  const haberReal = montoAPagar.toFixed(2);
  const importe = montoTotalAplicar.toFixed(2);
  const fecha = data.fecha ? fechaCalendariaArg(data.fecha) : new Date();
  const medioPago = data.formas?.length ? (medioPagoDeFormas(data.formas) as never) : null;
  const datosPago = {
    montoAPagar: haberReal,
    montoSaldoAFavor: montoSaldoAFavor > 0 ? montoSaldoAFavor.toFixed(2) : undefined,
    formas: data.formas ?? [],
    aplicaciones,
    // Qué NC sueltas consumió este recibo: la anulación las devuelve a
    // 'pendiente'. Recibos anteriores a 2026-08-24 no traen este campo.
    notasCredito: notasUsadas.length
      ? notasUsadas.map((n) => ({ id: n.id, importe: n.importe }))
      : undefined,
  };
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
          haber: haberReal,
          importeSigned: `-${haberReal}`,
          fecha,
          formaDePago: medioPago,
          datosPago,
          createdBy: ctx.user.id,
          esAdelanto,
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

      // 3.bis Marcar como usadas las notas de crédito aplicadas. NO se les pone
      // `facturaOriginalId`: no se atan a una factura puntual, su crédito ya
      // quedó declarado en las `aplicaciones` de este recibo y se reparte como
      // la plata. Su movimiento sigue fuera del pool genérico (ver
      // nc-cobertura: las NC sueltas se excluyen siempre), así que el crédito no
      // se cuenta dos veces.
      //
      // El WHERE repite las condiciones de disponibilidad para que dos cobranzas
      // simultáneas no usen la misma nota: la que llega segunda no afecta filas.
      for (const notaId of notasPedidas) {
        const usada = await tx
          .update(facturacion)
          .set({ estado: 'pagada' })
          .where(
            and(
              eq(facturacion.id, notaId),
              eq(facturacion.guarderiaId, gId),
              eq(facturacion.socioId, data.socioId),
              eq(facturacion.estado, 'pendiente'),
            ),
          )
          .returning({ id: facturacion.id });
        if (usada.length === 0) {
          // Otra cobranza se la llevó mientras armábamos esta: abortar todo.
          throw new Error('NOTA_YA_APLICADA');
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
  } catch (err) {
    if (err instanceof Error && err.message === 'NOTA_YA_APLICADA') {
      return {
        error: 'Una nota de crédito se aplicó en otra cobranza mientras tanto. Recargá la página.',
      };
    }
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
          .select({
            haber: movimientosCuentaCorriente.haber,
            datosPago: movimientosCuentaCorriente.datosPago,
          })
          .from(movimientosCuentaCorriente)
          .where(eq(movimientosCuentaCorriente.id, recibo.movimientoId))
          .limit(1);

        // Revivir las NC sueltas que este recibo consumió (datosPago.notasCredito,
        // registrado desde 2026-08-24): su crédito vuelve a estar disponible para
        // otra cobranza. Sin esto, anular el recibo devolvía la deuda pero la NC
        // quedaba 'pagada' para siempre — el crédito moría con el recibo. Los
        // recibos anteriores no registraban qué NC usaron: esos no se pueden
        // revertir automáticamente. Ojo: esto puede correr aunque el haber sea 0
        // (cobranza cubierta enteramente por la NC no genera contraasiento).
        const dp = pago?.datosPago as { notasCredito?: { id: string }[] } | null;
        const ncIds = (dp?.notasCredito ?? []).map((n) => n.id).filter(Boolean);
        if (ncIds.length > 0) {
          await tx
            .update(facturacion)
            .set({ estado: 'pendiente', updatedAt: new Date() })
            .where(
              and(
                eq(facturacion.guarderiaId, gId),
                inArray(facturacion.id, ncIds),
                inArray(facturacion.tipoFactura, [...TIPOS_NC_APLICABLES]),
                eq(facturacion.anulada, false),
              ),
            );
        }

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
