import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/lib/db';
import { guarderias, memberships, paywayCobros, paywayTokens, profiles } from '@/lib/db/schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPaywayError } from '@/lib/payway/format-error';

// Endpoint que consume la app mobile para que el SOCIO registre su propia
// tarjeta de débito automático (self-service). Es la versión socio-callable del
// server action admin-only `guardarTarjetaSocioAction`. Auth: Bearer JWT de
// Supabase (igual que /api/devices/register). Usa service-role vía Drizzle, así
// que la private key de Payway nunca sale del backend.
//
// GET    /api/payway?guarderiaId=...  → { configured, publicKey, sandbox, card }
// POST   /api/payway                  → registra la tarjeta ($1 + customer_token)
// DELETE /api/payway?guarderiaId=...  → elimina la tarjeta del socio

export const dynamic = 'force-dynamic';

// SDK callback-based → wrappear en Promise
const sdkModulo = require('sdk-node-payway');

const CARD_BRAND: Record<number, string> = { 1: 'Visa', 2: 'Mastercard', 65: 'Amex' };

function isSandbox(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.PAYWAY_SANDBOX === '1';
}

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

async function getUserIdFromAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// Verifica que el user sea socio ACTIVO de esa guardería y trae su email +
// credenciales Payway del club. Devuelve null si no corresponde.
async function getSocioContext(
  userId: string,
  guarderiaId: string,
): Promise<{ email: string | null; publicKey: string | null; privateKey: string | null } | null> {
  const [membership] = await db
    .select({ email: profiles.email })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!membership) return null;

  const [g] = await db
    .select({ publicKey: guarderias.paywayPublicKey, privateKey: guarderias.paywayPrivateKey })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  return {
    email: membership.email,
    publicKey: g?.publicKey ?? null,
    privateKey: g?.privateKey ?? null,
  };
}

async function getTarjeta(userId: string, guarderiaId: string) {
  const [token] = await db
    .select({
      paymentMethodId: paywayTokens.paymentMethodId,
      lastFour: paywayTokens.lastFour,
      activo: paywayTokens.activo,
    })
    .from(paywayTokens)
    .where(and(eq(paywayTokens.socioId, userId), eq(paywayTokens.guarderiaId, guarderiaId)))
    .limit(1);
  if (!token || !token.activo) return null;
  return { brand: CARD_BRAND[token.paymentMethodId] ?? 'Tarjeta', lastFour: token.lastFour };
}

// ─── GET: estado del débito automático para el socio ─────────────────────────
export async function GET(req: Request): Promise<Response> {
  const userId = await getUserIdFromAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const guarderiaId = new URL(req.url).searchParams.get('guarderiaId');
  if (!guarderiaId) return NextResponse.json({ error: 'guarderiaId requerido.' }, { status: 400 });

  const ctx = await getSocioContext(userId, guarderiaId);
  if (!ctx) return NextResponse.json({ error: 'No sos socio de esta guardería.' }, { status: 403 });

  const card = await getTarjeta(userId, guarderiaId);

  return NextResponse.json({
    configured: !!(ctx.publicKey && ctx.privateKey),
    publicKey: ctx.publicKey, // publishable key — seguro de exponer al cliente
    sandbox: isSandbox(),
    card,
  });
}

// ─── POST: registrar tarjeta (tokeniza en mobile, acá hace el $1 + guarda) ────
const postSchema = z.object({
  guarderiaId: z.string().uuid(),
  token: z.string().min(1), // one-time token devuelto por Payway al tokenizar en mobile
  paymentMethodId: z.number().int(), // 1=Visa, 2=MC, 65=Amex
  lastFour: z.string().regex(/^\d{3,4}$/),
  bin: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request): Promise<Response> {
  const userId = await getUserIdFromAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const ctx = await getSocioContext(userId, data.guarderiaId);
  if (!ctx) return NextResponse.json({ error: 'No sos socio de esta guardería.' }, { status: 403 });
  if (!ctx.publicKey || !ctx.privateKey) {
    return NextResponse.json(
      { error: 'Esta guardería no tiene Payway configurado.' },
      { status: 400 },
    );
  }

  // $1 fijo para tokenizar (store_credential) — el cobro real lo hace el cron.
  // Payway interpreta `amount` en CENTAVOS: $1 = 100.
  const ENROLLMENT_AMOUNT = 100;
  const siteTransactionId = randomUUID();
  const ambient = isSandbox() ? 'developer' : 'production';
  const sdk = makePaywaySdk(ambient, ctx.publicKey, ctx.privateKey);

  let result: Record<string, unknown>;
  try {
    result = await paymentAsync(sdk, {
      site_transaction_id: siteTransactionId,
      token: data.token,
      user_id: userId,
      payment_method_id: data.paymentMethodId,
      bin: data.bin,
      amount: ENROLLMENT_AMOUNT,
      currency: 'ARS',
      installments: 1,
      description: 'Alta débito automático - NauticaApp (app)',
      payment_type: 'single',
      sub_payments: [],
      store_credential: true,
      customer: { id: userId, email: ctx.email },
      fraud_detection: { send_to_cs: false },
    });
  } catch (err) {
    console.error('[api/payway POST] Payway SDK error', err);
    return NextResponse.json(
      { error: 'Error al conectar con Payway. Intentá de nuevo.' },
      { status: 502 },
    );
  }

  if (result.status !== 'approved') {
    const motivo = formatPaywayError(result);
    return NextResponse.json(
      { error: `Pago rechazado: ${motivo}. Verificá los datos de la tarjeta.` },
      { status: 402 },
    );
  }

  const customerToken = result.customer_token as string | null;
  if (!customerToken) {
    console.error('[api/payway POST] aprobó sin customer_token', JSON.stringify(result));
    return NextResponse.json(
      { error: 'Payway no devolvió el token de tarjeta. Contactá con soporte.' },
      { status: 502 },
    );
  }

  const paywayPaymentId = result.id != null ? String(result.id) : null;

  // Guardar o reemplazar token (unique: guarderia_id + socio_id)
  await db
    .insert(paywayTokens)
    .values({
      guarderiaId: data.guarderiaId,
      socioId: userId,
      customerToken,
      paymentMethodId: data.paymentMethodId,
      bin: data.bin,
      lastFour: data.lastFour,
      activo: true,
    })
    .onConflictDoUpdate({
      target: [paywayTokens.guarderiaId, paywayTokens.socioId],
      set: {
        customerToken,
        paymentMethodId: data.paymentMethodId,
        bin: data.bin,
        lastFour: data.lastFour,
        activo: true,
        updatedAt: new Date(),
      },
    });

  // Auditoría del cobro de $1 de alta
  await db.insert(paywayCobros).values({
    guarderiaId: data.guarderiaId,
    socioId: userId,
    monto: ENROLLMENT_AMOUNT,
    siteTransactionId,
    paywayPaymentId,
    estado: 'aprobado',
    movimientosIds: [],
  });

  return NextResponse.json({
    ok: true,
    card: { brand: CARD_BRAND[data.paymentMethodId] ?? 'Tarjeta', lastFour: data.lastFour },
  });
}

// ─── DELETE: eliminar la tarjeta del socio ───────────────────────────────────
export async function DELETE(req: Request): Promise<Response> {
  const userId = await getUserIdFromAuth(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const guarderiaId = new URL(req.url).searchParams.get('guarderiaId');
  if (!guarderiaId) return NextResponse.json({ error: 'guarderiaId requerido.' }, { status: 400 });

  const ctx = await getSocioContext(userId, guarderiaId);
  if (!ctx) return NextResponse.json({ error: 'No sos socio de esta guardería.' }, { status: 403 });

  await db
    .delete(paywayTokens)
    .where(and(eq(paywayTokens.socioId, userId), eq(paywayTokens.guarderiaId, guarderiaId)));

  return NextResponse.json({ ok: true });
}
