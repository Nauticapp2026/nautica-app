import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/lib/db';
import { guarderias, movimientosCuentaCorriente, paywayTokens, profiles } from '@/lib/db/schema';

// ⚠️ ENDPOINT TEMPORAL DE DIAGNÓSTICO — BORRAR DESPUÉS DE USAR.
// Dispara el cobro Payway del saldo para un socio probando dos payloads
// (el actual con payment_type:'recurrente' y el mínimo de la doc oficial) y
// devuelve la respuesta cruda de Payway. NO escribe en la base.

export const dynamic = 'force-dynamic';

const sdkModulo = require('sdk-node-payway');

const DIAG_KEY = 'diag-2f9a7c41b8e34d56-payway-temp';
const SOCIO_EMAIL = 'tempo.360.contacto@gmail.com';

function makeSdk(ambient: string, pub: string, priv: string) {
  return new sdkModulo.sdk(ambient, pub, priv, 'NauticaApp', 'sistema') as {
    payment: (
      args: Record<string, unknown>,
      cb: (result: Record<string, unknown> | null, err: unknown) => void,
    ) => void;
  };
}

function paymentAsync(
  sdk: ReturnType<typeof makeSdk>,
  args: Record<string, unknown>,
): Promise<{ result: Record<string, unknown> | null; err: string | null }> {
  return new Promise((resolve) => {
    sdk.payment(args, (result, err) => {
      resolve({ result: result ?? null, err: err ? String(err) : null });
    });
  });
}

function mask(token: string): string {
  return token.length > 8 ? `${token.slice(0, 6)}…${token.slice(-4)}` : '***';
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get('key') !== DIAG_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const useSandbox = process.env.NODE_ENV !== 'production' || process.env.PAYWAY_SANDBOX === '1';
  const ambient = useSandbox ? 'developer' : 'production';

  const [p] = await db
    .select({ id: profiles.id, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.email, SOCIO_EMAIL))
    .limit(1);
  if (!p) return NextResponse.json({ error: 'socio not found' }, { status: 404 });

  const [token] = await db
    .select({
      guarderiaId: paywayTokens.guarderiaId,
      customerToken: paywayTokens.customerToken,
      paymentMethodId: paywayTokens.paymentMethodId,
      bin: paywayTokens.bin,
    })
    .from(paywayTokens)
    .where(and(eq(paywayTokens.socioId, p.id), eq(paywayTokens.activo, true)))
    .limit(1);
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 404 });

  const [g] = await db
    .select({ pub: guarderias.paywayPublicKey, priv: guarderias.paywayPrivateKey })
    .from(guarderias)
    .where(eq(guarderias.id, token.guarderiaId))
    .limit(1);
  if (!g?.pub || !g?.priv) return NextResponse.json({ error: 'no creds' }, { status: 404 });

  const movs = await db
    .select({
      debe: movimientosCuentaCorriente.debe,
      haber: movimientosCuentaCorriente.haber,
    })
    .from(movimientosCuentaCorriente)
    .where(eq(movimientosCuentaCorriente.socioId, p.id));
  const sumDebe = movs.reduce((a, m) => a + parseFloat(m.debe ?? '0'), 0);
  const sumHaber = movs.reduce((a, m) => a + parseFloat(m.haber ?? '0'), 0);
  const totalPesos = Math.round((sumDebe - sumHaber) * 100) / 100;
  const amount = Math.round(totalPesos * 100);

  const sdk = makeSdk(ambient, g.pub, g.priv);

  // Variante A: payload ACTUAL (igual al cron de hoy).
  const argsActual: Record<string, unknown> = {
    site_transaction_id: randomUUID(),
    token: token.customerToken,
    user_id: p.id,
    payment_method_id: token.paymentMethodId,
    bin: token.bin,
    amount,
    currency: 'ARS',
    installments: 1,
    description: 'DIAG actual',
    payment_type: 'recurrente',
    sub_payments: [],
    customer: { id: p.id, email: p.email },
    store_credential: true,
    fraud_detection: { send_to_cs: false },
  };

  // Variante FIX: igual al actual pero con payment_type:'single' (valor válido).
  const argsFix: Record<string, unknown> = {
    site_transaction_id: randomUUID(),
    token: token.customerToken,
    user_id: p.id,
    payment_method_id: token.paymentMethodId,
    bin: token.bin,
    amount,
    currency: 'ARS',
    installments: 1,
    description: 'DIAG fix',
    payment_type: 'single',
    sub_payments: [],
    customer: { id: p.id, email: p.email },
    store_credential: true,
    fraud_detection: { send_to_cs: false },
  };

  const respActual = await paymentAsync(sdk, argsActual);
  const respFix = await paymentAsync(sdk, argsFix);

  return NextResponse.json({
    ambient,
    socio: SOCIO_EMAIL,
    amountCentavos: amount,
    saldoPesos: totalPesos,
    tokenMasked: mask(token.customerToken),
    actual: {
      sentResumen: { payment_type: 'recurrente', store_credential: true },
      response: respActual,
    },
    fix: { sentResumen: { payment_type: 'single' }, response: respFix },
  });
}
