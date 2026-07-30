/**
 * Cobros recurrentes MIT vía Payway.
 *
 * Se invoca desde el cron diario (api/cron/mensuales) después de la emisión
 * mensual. Para cada guardería procesada hoy:
 *  1. Toma los socios con token Payway activo Y adhesión al Cobro Automático
 *     (memberships.cobro_automatico_payway — tilde en Datos Impositivos).
 *  2. Selecciona los cargos pendientes que salieron de Servicios Contratados
 *     con el tilde de débito automático (socio_servicios.debito_automatico).
 *     Cargos sueltos (consumos, ND, legacy sin contrato) quedan afuera: se
 *     cobran a mano desde Cobranzas.
 *  3. Separa por canal: fiscal siempre; interno SOLO si el club habilitó
 *     'debito_automatico' en su Configuración de cobranzas (Mi Perfil).
 *     Nunca se mezclan los dos canales en un mismo pago.
 *  4. Descuenta el crédito FIFO sobrante del socio (pagos previos que cubren
 *     parcialmente el cargo más viejo) para no cobrar de más.
 *  5. Si el cobro es aprobado, marca esos cargos como pagados y salda los
 *     comprobantes que quedaron 100% cubiertos.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/lib/db';
import {
  facturacion,
  facturacionItemMovimientos,
  facturacionItems,
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  paywayCobros,
  paywayTokens,
  profiles,
  socioServicios,
} from '@/lib/db/schema';
import { formatPaywayError } from '@/lib/payway/format-error';
import { getEstadoFifo, marcarComprobantesSaldados } from '@/lib/reconciliar-cuenta';

const sdkModulo = require('sdk-node-payway');

function makePaywaySdk(ambient: string, publicKey: string, privateKey: string) {
  return new sdkModulo.sdk(ambient, publicKey, privateKey, 'NauticaApp', 'sistema') as {
    payment: (
      args: Record<string, unknown>,
      cb: (result: Record<string, unknown>, err: unknown) => void,
    ) => void;
    tokens: (
      args: Record<string, unknown>,
      cb: (result: Record<string, unknown>, err: unknown) => void,
    ) => void;
  };
}

function paymentAsync(
  sdk: ReturnType<typeof makePaywaySdk>,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    sdk.payment(args, (result, err) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Re-tokeniza el customer_token guardado (MIT, sin CVV) y devuelve un token de
// pago fresco. Payway NO acepta el customer_token directo en /payments (devuelve
// "OperationResource not found"): hay que pedir un token nuevo en /tokens y cobrar
// con ese. El token vence a los ~15 min, así que se genera justo antes del cobro.
function tokensAsync(
  sdk: ReturnType<typeof makePaywaySdk>,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    sdk.tokens(args, (result, err) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export type PaywayChargesResult = {
  guarderias: number;
  socios: number;
  cobrosAprobados: number;
  cobrosRechazados: number;
  cobrosError: number;
  montoTotal: number; // pesos
};

export type TokenRow = {
  socioId: string;
  customerToken: string;
  paymentMethodId: number;
  bin: string;
  email: string;
};

type CargoACobrar = { id: string; monto: number };

export type DebitoSocioOutcome = {
  // Cuántos pagos se intentaron (0 = el socio no tenía cargos habilitados).
  intentos: number;
  aprobados: number;
  ultimoError: string | null;
};

// Un pago Payway por (socio, canal): cobra el total de los cargos y, si
// aprueba, registra el haber, marca los cargos pagados y salda comprobantes.
async function cobrarCargos(args: {
  sdk: ReturnType<typeof makePaywaySdk>;
  guarderiaId: string;
  token: TokenRow;
  canal: 'fiscal' | 'interno';
  cargos: CargoACobrar[];
  result: PaywayChargesResult;
  descripcion: string;
}): Promise<{ ok: boolean; msg: string | null }> {
  const { sdk, guarderiaId, token, canal, cargos, result, descripcion } = args;

  const totalPesos = Math.round(cargos.reduce((acc, c) => acc + c.monto, 0) * 100) / 100;
  if (totalPesos < 0.01) return { ok: false, msg: null };

  const siteTransactionId = randomUUID();

  // Insertar cobro en estado pendiente antes de llamar a Payway.
  const [cobro] = await db
    .insert(paywayCobros)
    .values({
      guarderiaId,
      socioId: token.socioId,
      monto: Math.round(totalPesos * 100), // centavos para auditoría
      siteTransactionId,
      estado: 'pendiente',
      movimientosIds: cargos.map((c) => c.id),
    })
    .returning({ id: paywayCobros.id });

  let paywayResult: Record<string, unknown>;
  try {
    // Paso 1: re-tokenizar el customer_token para obtener un token de pago
    // fresco (MIT, sin CVV). Sin esto Payway responde "OperationResource not found".
    const tokenResult = await tokensAsync(sdk, { token: token.customerToken });
    const freshToken = tokenResult.id as string | undefined;
    if (!freshToken) {
      throw new Error(`Payway no devolvió token de pago: ${JSON.stringify(tokenResult)}`);
    }
    // Paso 2: cobrar con el token fresco. payment_type debe ser 'single'
    // ('recurrente' es inválido en Decidir; los valores válidos son single/distributed).
    paywayResult = await paymentAsync(sdk, {
      site_transaction_id: siteTransactionId,
      token: freshToken,
      user_id: token.socioId,
      payment_method_id: token.paymentMethodId,
      bin: token.bin,
      amount: Math.round(totalPesos * 100), // Payway en centavos
      currency: 'ARS',
      installments: 1,
      description: descripcion,
      payment_type: 'single',
      sub_payments: [],
      establishment_name: 'NauticaApp',
      fraud_detection: { send_to_cs: false },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[payway-cobros] SDK error socio=${token.socioId} canal=${canal}`, err);
    await db
      .update(paywayCobros)
      .set({ estado: 'error', errorMensaje: msg })
      .where(eq(paywayCobros.id, cobro.id));
    result.cobrosError++;
    return { ok: false, msg: 'Error al conectar con Payway. Intentá de nuevo.' };
  }

  const approved = paywayResult.status === 'approved';
  const paywayPaymentId = paywayResult.id != null ? String(paywayResult.id) : null;

  if (approved) {
    // Asiento del pago (haber) por el total del canal.
    await db.insert(movimientosCuentaCorriente).values({
      socioId: token.socioId,
      concepto: 'Pago — Débito automático',
      tipo: 'otro',
      estado: 'pagado',
      debe: '0',
      haber: totalPesos.toFixed(2),
      importeSigned: `-${totalPesos.toFixed(2)}`,
      fecha: new Date(),
      formaDePago: 'debito_automatico',
      datosPago: null,
      comprobanteInterno: canal === 'interno',
    });

    // Los cargos cobrados quedan pagados: se cobró exactamente su resto (el
    // descuento del crédito FIFO previo los deja cubiertos enteros). Después,
    // saldar los comprobantes que quedaron 100% cubiertos — para el canal
    // interno eso incluye los comprobantes internos (tipo 'recibo'), que acá
    // no pasan por Cobranza. Si falla, no abortar (el cobro ya está aprobado).
    try {
      await db
        .update(movimientosCuentaCorriente)
        .set({ estado: 'pagado' })
        .where(
          inArray(
            movimientosCuentaCorriente.id,
            cargos.map((c) => c.id),
          ),
        );
      await marcarComprobantesSaldados(token.socioId, guarderiaId, canal === 'interno');
    } catch (err) {
      console.error(`[payway-cobros] reconciliación falló socio=${token.socioId}`, err);
    }

    await db
      .update(paywayCobros)
      .set({ estado: 'aprobado', paywayPaymentId })
      .where(eq(paywayCobros.id, cobro.id));

    result.cobrosAprobados++;
    result.montoTotal += totalPesos;
    return { ok: true, msg: null };
  } else {
    console.error(
      `[payway-cobros] Payway no aprobó socio=${token.socioId} canal=${canal}`,
      JSON.stringify(paywayResult),
    );
    const msg = formatPaywayError(paywayResult);
    await db
      .update(paywayCobros)
      .set({ estado: 'rechazado', paywayPaymentId, errorMensaje: msg })
      .where(eq(paywayCobros.id, cobro.id));
    result.cobrosRechazados++;
    return { ok: false, msg };
  }
}

/**
 * Débito automático de UN socio bajo las reglas de los 3 niveles: cargos de
 * contratos con tilde, separados por canal, con el crédito FIFO descontado.
 * Lo usan el cron (runPaywayCharges) y el botón Reintentar de Cobranzas —
 * un reintento es simplemente volver a correr el débito del socio hoy.
 */
export async function cobrarDebitoSocio(args: {
  ambient: string;
  guarderia: { id: string; publicKey: string; privateKey: string; mediosInternos: string[] };
  token: TokenRow;
  result: PaywayChargesResult;
  descripcion?: string;
}): Promise<DebitoSocioOutcome> {
  const { ambient, guarderia: g, token, result } = args;
  const descripcion = args.descripcion ?? 'Cuota mensual — NauticaApp';
  const outcome: DebitoSocioOutcome = { intentos: 0, aprobados: 0, ultimoError: null };

  // Contratos del socio incluidos en el débito automático.
  const scRows = await db
    .select({ id: socioServicios.id })
    .from(socioServicios)
    .where(
      and(
        eq(socioServicios.guarderiaId, g.id),
        eq(socioServicios.socioId, token.socioId),
        eq(socioServicios.debitoAutomatico, true),
      ),
    );
  if (!scRows.length) return outcome;
  const scSet = new Set(scRows.map((r) => r.id));

  // Estado FIFO de la cuenta: qué cargos ya están cubiertos por pagos
  // previos, cuánto crédito sobra sin asignar, y qué cobertura parcial de NC
  // targeted ya está acreditada (no debe volver a cobrarse).
  const { saldados, poolRestante, ncParcial } = await getEstadoFifo(token.socioId);

  const movimientos = await db
    .select({
      id: movimientosCuentaCorriente.id,
      tipo: movimientosCuentaCorriente.tipo,
      debe: movimientosCuentaCorriente.debe,
      comprobanteInterno: movimientosCuentaCorriente.comprobanteInterno,
      socioServicioId: movimientosCuentaCorriente.socioServicioId,
    })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.socioId, token.socioId))
    .orderBy(asc(movimientosCuentaCorriente.fecha), asc(movimientosCuentaCorriente.createdAt));

  // Cargos cuya factura fiscal quedó RECHAZADA por ARCA: bloqueados hasta que
  // el club la reenvíe (misma regla que Cobranzas) — no se debitan sin
  // comprobante válido. Se resuelven por las dos vías de vínculo (directo +
  // M:N de items).
  const bloqueados = new Set<string>();
  const rechazadas = await db
    .select({ id: facturacion.id, movimientoId: facturacion.movimientoId })
    .from(facturacion)
    .where(
      and(
        eq(facturacion.guarderiaId, g.id),
        eq(facturacion.socioId, token.socioId),
        eq(facturacion.rechazada, true),
      ),
    );
  if (rechazadas.length > 0) {
    for (const r of rechazadas) if (r.movimientoId) bloqueados.add(r.movimientoId);
    const items = await db
      .select({ id: facturacionItems.id })
      .from(facturacionItems)
      .where(
        inArray(
          facturacionItems.facturacionId,
          rechazadas.map((r) => r.id),
        ),
      );
    if (items.length > 0) {
      const links = await db
        .select({ movimientoId: facturacionItemMovimientos.movimientoId })
        .from(facturacionItemMovimientos)
        .where(
          inArray(
            facturacionItemMovimientos.facturacionItemId,
            items.map((i) => i.id),
          ),
        );
      for (const l of links) bloqueados.add(l.movimientoId);
    }
  }

  // Los contraasientos de anulación no son cargos cobrables (su debe ya está
  // descontado del pool) — se excluyen para que no se roben el descuento del
  // pool sobrante.
  const noCubiertos = movimientos.filter(
    (m) =>
      m.tipo !== 'anulacion_recibo' && parseFloat(m.debe ?? '0') > 0.001 && !saldados.has(m.id),
  );
  // El pool sobrante cubre parcialmente SOLO al no cubierto más viejo (si
  // alcanzara para más, esos cargos ya estarían saldados). Si ese cargo entra
  // al débito se le descuenta; si no, el crédito queda reservado para él y
  // acá no se usa.
  const primerNoCubiertoId = noCubiertos[0]?.id ?? null;

  const elegibles: (CargoACobrar & { interno: boolean })[] = noCubiertos
    .filter((m) => m.socioServicioId && scSet.has(m.socioServicioId) && !bloqueados.has(m.id))
    .map((m) => ({
      id: m.id,
      interno: m.comprobanteInterno,
      // Al debe se le descuenta la cobertura parcial de NC ya acreditada y,
      // solo para el no cubierto más viejo, el pool sobrante.
      monto:
        parseFloat(m.debe ?? '0') -
        (ncParcial.get(m.id) ?? 0) -
        (m.id === primerNoCubiertoId ? poolRestante : 0),
    }))
    .filter((c) => c.monto >= 0.01);

  const fiscales = elegibles.filter((c) => !c.interno);
  // Canal interno: solo si el club habilitó 'debito_automatico' como medio
  // para comprobantes internos (habilitación explícita de los 3 niveles).
  // Sin eso, el tilde de un contrato Interno no tiene efecto.
  const internos = g.mediosInternos.includes('debito_automatico')
    ? elegibles.filter((c) => c.interno)
    : [];

  if (!fiscales.length && !internos.length) return outcome;

  const sdk = makePaywaySdk(ambient, g.publicKey, g.privateKey);

  // Un pago por canal — interno y fiscal nunca comparten un mismo cobro.
  for (const [canal, cargos] of [
    ['fiscal', fiscales],
    ['interno', internos],
  ] as const) {
    if (!cargos.length) continue;
    outcome.intentos++;
    const r = await cobrarCargos({
      sdk,
      guarderiaId: g.id,
      token,
      canal,
      cargos,
      result,
      descripcion,
    });
    if (r.ok) outcome.aprobados++;
    else if (r.msg) outcome.ultimoError = r.msg;
  }

  return outcome;
}

export async function runPaywayCharges(guarderiaIds: string[]): Promise<PaywayChargesResult> {
  if (!guarderiaIds.length) {
    return {
      guarderias: 0,
      socios: 0,
      cobrosAprobados: 0,
      cobrosRechazados: 0,
      cobrosError: 0,
      montoTotal: 0,
    };
  }

  // Sandbox se activa en dev local o cuando PAYWAY_SANDBOX=1.
  // La env var permite forzar sandbox en una preview o prod para pruebas
  // puntuales sin reescribir el codigo.
  const useSandbox = process.env.NODE_ENV !== 'production' || process.env.PAYWAY_SANDBOX === '1';
  const ambient = useSandbox ? 'developer' : 'production';

  const result: PaywayChargesResult = {
    guarderias: guarderiaIds.length,
    socios: 0,
    cobrosAprobados: 0,
    cobrosRechazados: 0,
    cobrosError: 0,
    montoTotal: 0,
  };

  // Credenciales Payway + config de cobranzas de las guarderías de hoy.
  const guarderiaRows = await db
    .select({
      id: guarderias.id,
      publicKey: guarderias.paywayPublicKey,
      privateKey: guarderias.paywayPrivateKey,
      mediosInternos: guarderias.mediosCobroInternos,
    })
    .from(guarderias)
    .where(inArray(guarderias.id, guarderiaIds));

  for (const g of guarderiaRows) {
    if (!g.publicKey || !g.privateKey) continue;

    // Tokens activos de socios ADHERIDOS al cobro automático (tilde en Datos
    // Impositivos). Tener tarjeta ya no alcanza: la adhesión es explícita.
    const tokens: TokenRow[] = await db
      .select({
        socioId: paywayTokens.socioId,
        customerToken: paywayTokens.customerToken,
        paymentMethodId: paywayTokens.paymentMethodId,
        bin: paywayTokens.bin,
        email: profiles.email,
      })
      .from(paywayTokens)
      .innerJoin(profiles, eq(profiles.id, paywayTokens.socioId))
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, paywayTokens.socioId),
          eq(memberships.guarderiaId, paywayTokens.guarderiaId),
          eq(memberships.rol, 'socio'),
        ),
      )
      .where(
        and(
          eq(paywayTokens.guarderiaId, g.id),
          eq(paywayTokens.activo, true),
          eq(memberships.cobroAutomaticoPayway, true),
          // Socios dados de baja del club no se debitan más, aunque hayan
          // quedado con adhesión y token activos.
          eq(memberships.status, 'active'),
        ),
      );

    if (!tokens.length) continue;

    for (const token of tokens) {
      const outcome = await cobrarDebitoSocio({
        ambient,
        guarderia: {
          id: g.id,
          publicKey: g.publicKey,
          privateKey: g.privateKey,
          mediosInternos: g.mediosInternos,
        },
        token,
        result,
      });
      if (outcome.intentos > 0) result.socios++;
    }
  }

  return result;
}
