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

import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/lib/db';
import {
  guarderias,
  movimientosCuentaCorriente,
  paywayCobros,
  paywayTokens,
  profiles,
} from '@/lib/db/schema';
import { formatPaywayError } from '@/lib/payway/format-error';

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
        email: profiles.email,
      })
      .from(paywayTokens)
      .innerJoin(profiles, eq(profiles.id, paywayTokens.socioId))
      .where(and(eq(paywayTokens.guarderiaId, g.id), eq(paywayTokens.activo, true)));

    if (!tokens.length) continue;

    const sdk = makePaywaySdk(ambient, g.publicKey, g.privateKey);

    for (const token of tokens) {
      // El monto a cobrar es el SALDO NETO del socio: SUM(debe) - SUM(haber)
      // sobre TODOS sus movimientos (misma fórmula que las cards de saldo en
      // socio-detail). NO la suma de cargos pendientes: eso ignoraría los pagos
      // ya registrados (movimientos de haber) y cobraría de más.
      const movimientos = await db
        .select({
          debe: movimientosCuentaCorriente.debe,
          haber: movimientosCuentaCorriente.haber,
        })
        .from(movimientosCuentaCorriente)
        .where(eq(movimientosCuentaCorriente.socioId, token.socioId));

      const sumDebe = movimientos.reduce((acc, m) => acc + parseFloat(m.debe ?? '0'), 0);
      const sumHaber = movimientos.reduce((acc, m) => acc + parseFloat(m.haber ?? '0'), 0);
      const totalPesos = Math.round((sumDebe - sumHaber) * 100) / 100;
      // Si no debe nada (o tiene saldo a favor), no se cobra.
      if (totalPesos < 0.01) continue;

      result.socios++;

      const siteTransactionId = randomUUID();

      // Insertar cobro en estado pendiente antes de llamar a Payway.
      const [cobro] = await db
        .insert(paywayCobros)
        .values({
          guarderiaId: g.id,
          socioId: token.socioId,
          monto: Math.round(totalPesos * 100), // centavos para auditoría
          siteTransactionId,
          estado: 'pendiente',
          // Pago neto del saldo: no mapea 1:1 a movimientos puntuales.
          movimientosIds: [],
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
          description: 'Cuota mensual — NauticaApp',
          payment_type: 'single',
          sub_payments: [],
          establishment_name: 'NauticaApp',
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
        // Registrar el cobro como un movimiento de pago (haber), igual que
        // informarPagoAction. Lleva el saldo del socio a 0 sin marcar cargos
        // puntuales (el monto es el neto, no mapea 1:1 a movimientos). Mantiene
        // consistencia con el flujo manual de "Registrar pago".
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
        });

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
