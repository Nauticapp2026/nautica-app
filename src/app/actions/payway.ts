'use server';

import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/lib/db';
import { guarderias, memberships, paywayTokens } from '@/lib/db/schema';
import { getActiveMarina } from '@/lib/auth/session';

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
  amount: number; // monto del primer cobro en pesos (float, ej: 15000.00)
};

export async function guardarTarjetaSocioAction(
  data: GuardarTarjetaData,
): Promise<{ error?: string }> {
  const ctx = await getActiveMarina();
  if (!ctx) return { error: 'No autenticado' };
  if (!isAdmin(ctx)) return { error: 'Solo administradores.' };

  const guarderiaId = ctx.activeMembership.guarderiaId;

  // Verificar que el socio pertenece a esta guardería
  const [membership] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
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

  const amount = Math.max(data.amount, 1); // mínimo $1
  const ambient = process.env.NODE_ENV === 'production' ? 'production' : 'developer';
  const sdk = makePaywaySdk(ambient, g.publicKey, g.privateKey);

  let result: Record<string, unknown>;
  try {
    result = await paymentAsync(sdk, {
      site_transaction_id: randomUUID(),
      token: data.token,
      user_id: data.socioId,
      payment_method_id: data.paymentMethodId,
      bin: data.bin,
      amount,
      currency: 'ARS',
      installments: 1,
      description: 'Alta débito automático - NauticaApp',
      payment_type: 'single',
      sub_payments: [],
      store_credential: true,
    });
  } catch (err) {
    console.error('[guardarTarjetaSocioAction] Payway SDK error', err);
    return { error: 'Error al conectar con Payway. Intentá de nuevo.' };
  }

  if (result.status !== 'approved') {
    const errDetail = (result.status_details as Record<string, unknown> | null)?.error;
    return {
      error: `Pago rechazado${errDetail ? `: ${errDetail}` : ''}. Verificá los datos de la tarjeta.`,
    };
  }

  const customerToken = result.customer_token as string | null;
  if (!customerToken) {
    return { error: 'Payway no devolvió el token de tarjeta. Contactá con soporte.' };
  }

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

  revalidatePath(`/usuarios/${data.socioId}`);
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
