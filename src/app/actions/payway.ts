'use server';

import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/lib/db';
import { guarderias, memberships, paywayCobros, paywayTokens, profiles } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { formatPaywayError } from '@/lib/payway/format-error';
import { cobrarDebitoSocio, type PaywayChargesResult } from '@/lib/payway-cobros';

// SDK callback-based → wrappear en Promise

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

function isAdmin(ctx: NonNullable<Awaited<ReturnType<typeof getActiveMarina>>>): boolean {
  return (
    ctx.profile.isSuperAdmin ||
    ctx.activeMembership.rol === 'administrador_general' ||
    ctx.activeMembership.rol === 'administrativo' ||
    ctx.activeMembership.rol === 'contable'
  );
}

export type GuardarTarjetaData = {
  socioId: string;
  token: string; // one-time token del JS SDK del browser
  paymentMethodId: number; // 1=Visa, 2=MC, 65=Amex
  lastFour: string;
  bin: string; // primeros 6 dígitos
  // sin campo amount: se cobra $1 fijo solo para tokenizar; el cobro real lo hace el cron
};

export async function guardarTarjetaSocioAction(
  data: GuardarTarjetaData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // Verificar que el socio pertenece a esta guardería + traer email para customer
  const [membership] = await db
    .select({ userId: memberships.userId, email: profiles.email })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(
      and(
        eq(memberships.userId, data.socioId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!membership) return { error: 'El socio no pertenece a esta guardería.' };

  // Credenciales Payway de la guardería
  const [g] = await db
    .select({ publicKey: guarderias.paywayPublicKey, privateKey: guarderias.paywayPrivateKey })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);
  if (!g?.publicKey || !g?.privateKey) {
    return { error: 'Esta guardería no tiene Payway configurado.' };
  }

  // $1 fijo para tokenizar — el cobro real lo hace el cron tras facturar.
  // Payway interpreta `amount` en CENTAVOS, no en pesos: $1 = 100.
  const ENROLLMENT_AMOUNT = 100;
  const siteTransactionId = randomUUID();
  // PAYWAY_SANDBOX=1 fuerza ambient developer aun en prod (testing).
  const useSandbox = process.env.NODE_ENV !== 'production' || process.env.PAYWAY_SANDBOX === '1';
  const ambient = useSandbox ? 'developer' : 'production';
  const sdk = makePaywaySdk(ambient, g.publicKey, g.privateKey);

  let result: Record<string, unknown>;
  try {
    result = await paymentAsync(sdk, {
      site_transaction_id: siteTransactionId,
      token: data.token,
      user_id: data.socioId,
      payment_method_id: data.paymentMethodId,
      bin: data.bin,
      amount: ENROLLMENT_AMOUNT,
      currency: 'ARS',
      installments: 1,
      description: 'Alta débito automático - NauticaApp',
      payment_type: 'single',
      sub_payments: [],
      store_credential: true,
      customer: { id: data.socioId, email: membership.email },
      fraud_detection: { send_to_cs: false },
    });
  } catch (err) {
    console.error('[guardarTarjetaSocioAction] Payway SDK error', err);
    return { error: 'Error al conectar con Payway. Intentá de nuevo.' };
  }

  if (result.status !== 'approved') {
    console.error('[guardarTarjetaSocioAction] Payway no aprobó', JSON.stringify(result));
    const motivo = formatPaywayError(result);
    return {
      error: `Pago rechazado: ${motivo}. Verificá los datos de la tarjeta.`,
    };
  }

  const customerToken = result.customer_token as string | null;
  if (!customerToken) {
    console.error(
      '[guardarTarjetaSocioAction] Payway aprobó pero no devolvió customer_token',
      JSON.stringify(result),
    );
    return { error: 'Payway no devolvió el token de tarjeta. Contactá con soporte.' };
  }

  const paywayPaymentId = result.id != null ? String(result.id) : null;

  // Guardar o reemplazar token (unique: guarderia_id + socio_id)
  await db
    .insert(paywayTokens)
    .values({
      guarderiaId,
      socioId: data.socioId,
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

  // Registrar el cobro de $1 de alta en el historial de auditoría
  await db.insert(paywayCobros).values({
    guarderiaId,
    socioId: data.socioId,
    monto: 100, // $1 en centavos
    siteTransactionId,
    paywayPaymentId,
    estado: 'aprobado',
    movimientosIds: [],
  });

  revalidatePath(`/usuarios/${data.socioId}`);
  return {};
}

export async function reintentarCobroPaywayAction(cobroId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // Verificar que el cobro pertenece a esta guardería.
  const [cobro] = await db
    .select({ id: paywayCobros.id, socioId: paywayCobros.socioId })
    .from(paywayCobros)
    .where(and(eq(paywayCobros.id, cobroId), eq(paywayCobros.guarderiaId, guarderiaId)))
    .limit(1);
  if (!cobro) return { error: 'Cobro no encontrado.' };

  // Reintentar = volver a correr el débito automático del socio HOY, con las
  // mismas reglas que el cron: cargos de contratos con el tilde de débito,
  // canales fiscal/interno separados y el crédito FIFO descontado. Ya no se
  // cobra el saldo neto de toda la cuenta.
  const [m] = await db
    .select({ adherido: memberships.cobroAutomaticoPayway })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, cobro.socioId),
        eq(memberships.guarderiaId, guarderiaId),
        eq(memberships.rol, 'socio'),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!m?.adherido) {
    return {
      error:
        'El socio no está adherido al Cobro Automático Payway. Se activa desde su pestaña Datos Impositivos.',
    };
  }

  // Token del socio + email para customer
  const [token] = await db
    .select({
      customerToken: paywayTokens.customerToken,
      paymentMethodId: paywayTokens.paymentMethodId,
      bin: paywayTokens.bin,
      email: profiles.email,
    })
    .from(paywayTokens)
    .innerJoin(profiles, eq(profiles.id, paywayTokens.socioId))
    .where(
      and(
        eq(paywayTokens.socioId, cobro.socioId),
        eq(paywayTokens.guarderiaId, guarderiaId),
        eq(paywayTokens.activo, true),
      ),
    )
    .limit(1);
  if (!token) return { error: 'El socio no tiene tarjeta registrada.' };

  // Credenciales + medios habilitados para internos
  const [g] = await db
    .select({
      publicKey: guarderias.paywayPublicKey,
      privateKey: guarderias.paywayPrivateKey,
      mediosInternos: guarderias.mediosCobroInternos,
    })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);
  if (!g?.publicKey || !g?.privateKey) return { error: 'Payway no configurado.' };

  // PAYWAY_SANDBOX=1 fuerza ambient developer aun en prod (testing).
  const useSandbox = process.env.NODE_ENV !== 'production' || process.env.PAYWAY_SANDBOX === '1';
  const ambient = useSandbox ? 'developer' : 'production';

  const stats: PaywayChargesResult = {
    guarderias: 1,
    socios: 0,
    cobrosAprobados: 0,
    cobrosRechazados: 0,
    cobrosError: 0,
    montoTotal: 0,
  };
  const outcome = await cobrarDebitoSocio({
    ambient,
    guarderia: {
      id: guarderiaId,
      publicKey: g.publicKey,
      privateKey: g.privateKey,
      mediosInternos: g.mediosInternos,
    },
    token: { ...token, socioId: cobro.socioId },
    result: stats,
    descripcion: 'Cuota mensual (reintento) — NauticaApp',
  });

  if (outcome.intentos === 0) {
    return { error: 'El socio no tiene cargos pendientes habilitados para el débito automático.' };
  }
  if (outcome.aprobados === 0) {
    return {
      error: outcome.ultimoError ? `Cobro rechazado: ${outcome.ultimoError}` : 'Cobro rechazado.',
    };
  }

  revalidatePath('/cobranzas');
  revalidatePath(`/usuarios/${cobro.socioId}`);
  return {};
}

export async function eliminarTarjetaSocioAction(socioId: string): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  await db
    .delete(paywayTokens)
    .where(and(eq(paywayTokens.socioId, socioId), eq(paywayTokens.guarderiaId, guarderiaId)));

  revalidatePath(`/usuarios/${socioId}`);
  return {};
}
