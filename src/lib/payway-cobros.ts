/**
 * Cobros recurrentes MIT vía Payway.
 *
 * Se invoca desde el cron diario (api/cron/mensuales) después de
 * generar los movimientos mensuales. Para cada guardería procesada hoy:
 *  1. Obtiene los socios con token Payway activo.
 *  2. Suma todos sus movimientos no pagados (debe > 0).
 *  3. Si hay saldo, cobra vía sdk.payment() MIT (payment_type: 'recurrente').
 *  4. Registra el resultado en payway_cobros.
 *  5. Si el cobro es aprobado, marca los movimientos como pagados.
 */

import { and, eq, gt, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/lib/db';
import {
  guarderias,
  movimientosCuentaCorriente,
  paywayCobros,
  paywayTokens,
} from '@/lib/db/schema';
import { formatPaywayError } from '@/lib/payway/format-error';

const sdkModulo = require('sdk-node-payway');

function makePaywaySdk(ambient: string, publicKey: string, privateKey: string) {
  return new sdkModulo.sdk(ambient, publicKey, privateKey, 'NauticaApp', 'sistema') as {
    payment: (
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

export type PaywayChargesResult = {
  guarderias: number;
  socios: number;
  cobrosAprobados: number;
  cobrosRechazados: number;
  cobrosError: number;
  montoTotal: number; // pesos
};

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

  // Credenciales Payway para todas las guarderías procesadas hoy.
  const guarderiaRows = await db
    .select({
      id: guarderias.id,
      publicKey: guarderias.paywayPublicKey,
      privateKey: guarderias.paywayPrivateKey,
    })
    .from(guarderias)
    .where(inArray(guarderias.id, guarderiaIds));

  for (const g of guarderiaRows) {
    if (!g.publicKey || !g.privateKey) continue;

    // Tokens activos para esta guardería.
    const tokens = await db
      .select({
        socioId: paywayTokens.socioId,
        customerToken: paywayTokens.customerToken,
        paymentMethodId: paywayTokens.paymentMethodId,
        bin: paywayTokens.bin,
      })
      .from(paywayTokens)
      .where(and(eq(paywayTokens.guarderiaId, g.id), eq(paywayTokens.activo, true)));

    if (!tokens.length) continue;

    const sdk = makePaywaySdk(ambient, g.publicKey, g.privateKey);

    for (const token of tokens) {
      // Movimientos no pagados del socio.
      const movimientos = await db
        .select({
          id: movimientosCuentaCorriente.id,
          debe: movimientosCuentaCorriente.debe,
        })
        .from(movimientosCuentaCorriente)
        .where(
          and(
            eq(movimientosCuentaCorriente.socioId, token.socioId),
            eq(movimientosCuentaCorriente.estado, 'no_pagado'),
            gt(movimientosCuentaCorriente.debe, '0'),
          ),
        );

      if (!movimientos.length) continue;

      const totalPesos = movimientos.reduce((acc, m) => acc + parseFloat(m.debe ?? '0'), 0);
      if (totalPesos < 0.01) continue;

      result.socios++;

      const siteTransactionId = randomUUID();
      const movimientosIds = movimientos.map((m) => m.id);

      // Insertar cobro en estado pendiente antes de llamar a Payway.
      const [cobro] = await db
        .insert(paywayCobros)
        .values({
          guarderiaId: g.id,
          socioId: token.socioId,
          monto: Math.round(totalPesos * 100), // centavos para auditoría
          siteTransactionId,
          estado: 'pendiente',
          movimientosIds,
        })
        .returning({ id: paywayCobros.id });

      let paywayResult: Record<string, unknown>;
      try {
        paywayResult = await paymentAsync(sdk, {
          site_transaction_id: siteTransactionId,
          token: token.customerToken,
          user_id: token.socioId,
          payment_method_id: token.paymentMethodId,
          bin: token.bin,
          amount: Math.round(totalPesos * 100), // Payway en centavos
          currency: 'ARS',
          installments: 1,
          description: 'Cuota mensual — NauticaApp',
          payment_type: 'recurrente',
          sub_payments: [],
          store_credential: true,
          fraud_detection: { send_to_cs: false },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[payway-cobros] SDK error socio=${token.socioId}`, err);
        await db
          .update(paywayCobros)
          .set({ estado: 'error', errorMensaje: msg })
          .where(eq(paywayCobros.id, cobro.id));
        result.cobrosError++;
        continue;
      }

      const approved = paywayResult.status === 'approved';
      const paywayPaymentId = paywayResult.id != null ? String(paywayResult.id) : null;

      if (approved) {
        // Marcar movimientos como pagados.
        await db
          .update(movimientosCuentaCorriente)
          .set({ estado: 'pagado', formaDePago: 'debito_automatico' })
          .where(inArray(movimientosCuentaCorriente.id, movimientosIds));

        await db
          .update(paywayCobros)
          .set({ estado: 'aprobado', paywayPaymentId })
          .where(eq(paywayCobros.id, cobro.id));

        result.cobrosAprobados++;
        result.montoTotal += totalPesos;
      } else {
        console.error(
          `[payway-cobros] Payway no aprobó socio=${token.socioId}`,
          JSON.stringify(paywayResult),
        );
        const msg = formatPaywayError(paywayResult);
        await db
          .update(paywayCobros)
          .set({ estado: 'rechazado', paywayPaymentId, errorMensaje: msg })
          .where(eq(paywayCobros.id, cobro.id));
        result.cobrosRechazados++;
      }
    }
  }

  return result;
}
