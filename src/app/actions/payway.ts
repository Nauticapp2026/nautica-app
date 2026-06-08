'use server';

import { revalidatePath } from 'next/cache';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/lib/db';
import {
  guarderias,
  memberships,
  movimientosCuentaCorriente,
  paywayCobros,
  paywayTokens,
  profiles,
} from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';
import { formatPaywayError } from '@/lib/payway/format-error';

// SDK callback-based → wrappear en Promise

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

  // $1 fijo para tokenizar — el cobro real lo hace el cron tras facturar
  const ENROLLMENT_AMOUNT = 1;
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

  // Verificar que el cobro pertenece a esta guardería y está en estado fallido
  const [cobro] = await db
    .select({
      id: paywayCobros.id,
      socioId: paywayCobros.socioId,
      movimientosIds: paywayCobros.movimientosIds,
    })
    .from(paywayCobros)
    .where(and(eq(paywayCobros.id, cobroId), eq(paywayCobros.guarderiaId, guarderiaId)))
    .limit(1);
  if (!cobro) return { error: 'Cobro no encontrado.' };

  // Verificar que los movimientos aún estén pendientes de pago
  const movsPendientes = await db
    .select({ id: movimientosCuentaCorriente.id, debe: movimientosCuentaCorriente.debe })
    .from(movimientosCuentaCorriente)
    .where(
      and(
        inArray(movimientosCuentaCorriente.id, cobro.movimientosIds),
        eq(movimientosCuentaCorriente.estado, 'no_pagado'),
      ),
    );
  if (!movsPendientes.length) return { error: 'Los movimientos ya están pagados.' };

  const totalPesos = movsPendientes.reduce((acc, m) => acc + parseFloat(m.debe ?? '0'), 0);
  if (totalPesos < 0.01) return { error: 'El monto a cobrar es cero.' };

  // Token del socio
  const [token] = await db
    .select({
      customerToken: paywayTokens.customerToken,
      paymentMethodId: paywayTokens.paymentMethodId,
      bin: paywayTokens.bin,
    })
    .from(paywayTokens)
    .where(
      and(
        eq(paywayTokens.socioId, cobro.socioId),
        eq(paywayTokens.guarderiaId, guarderiaId),
        eq(paywayTokens.activo, true),
      ),
    )
    .limit(1);
  if (!token) return { error: 'El socio no tiene tarjeta registrada.' };

  // Credenciales
  const [g] = await db
    .select({ publicKey: guarderias.paywayPublicKey, privateKey: guarderias.paywayPrivateKey })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);
  if (!g?.publicKey || !g?.privateKey) return { error: 'Payway no configurado.' };

  // PAYWAY_SANDBOX=1 fuerza ambient developer aun en prod (testing).
  const useSandbox = process.env.NODE_ENV !== 'production' || process.env.PAYWAY_SANDBOX === '1';
  const ambient = useSandbox ? 'developer' : 'production';
  const sdk = makePaywaySdk(ambient, g.publicKey, g.privateKey);
  const siteTransactionId = randomUUID();
  const movimientosIds = movsPendientes.map((m) => m.id);

  // Nuevo registro de intento
  const [nuevoCobro] = await db
    .insert(paywayCobros)
    .values({
      guarderiaId,
      socioId: cobro.socioId,
      monto: Math.round(totalPesos * 100),
      siteTransactionId,
      estado: 'pendiente',
      movimientosIds,
    })
    .returning({ id: paywayCobros.id });

  let result: Record<string, unknown>;
  try {
    result = await paymentAsync(sdk, {
      site_transaction_id: siteTransactionId,
      token: token.customerToken,
      user_id: cobro.socioId,
      payment_method_id: token.paymentMethodId,
      bin: token.bin,
      amount: totalPesos,
      currency: 'ARS',
      installments: 1,
      description: 'Cuota mensual (reintento) — NauticaApp',
      payment_type: 'recurrente',
      sub_payments: [],
      fraud_detection: { send_to_cs: false },
      store_credential: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(paywayCobros)
      .set({ estado: 'error', errorMensaje: msg })
      .where(eq(paywayCobros.id, nuevoCobro.id));
    return { error: 'Error al conectar con Payway. Intentá de nuevo.' };
  }

  const approved = result.status === 'approved';
  const paywayPaymentId = result.id != null ? String(result.id) : null;

  if (approved) {
    await db
      .update(movimientosCuentaCorriente)
      .set({ estado: 'pagado', formaDePago: 'debito_automatico' })
      .where(inArray(movimientosCuentaCorriente.id, movimientosIds));
    await db
      .update(paywayCobros)
      .set({ estado: 'aprobado', paywayPaymentId })
      .where(eq(paywayCobros.id, nuevoCobro.id));
  } else {
    console.error('[reintentarCobroAction] Payway no aprobó', JSON.stringify(result));
    const msg = formatPaywayError(result);
    await db
      .update(paywayCobros)
      .set({ estado: 'rechazado', paywayPaymentId, errorMensaje: msg })
      .where(eq(paywayCobros.id, nuevoCobro.id));
    return { error: `Cobro rechazado: ${msg}` };
  }

  revalidatePath('/facturacion');
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
