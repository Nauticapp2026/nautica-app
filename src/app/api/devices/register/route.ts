import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { registerDeviceToken, unregisterDeviceToken } from '@/lib/push-notifications';

export const dynamic = 'force-dynamic';

// Validamos el formato típico de Expo Push Tokens: 'ExponentPushToken[...]'.
// Si en el futuro Expo cambia el formato, relajar este regex.
const tokenSchema = z
  .string()
  .min(10)
  .max(200)
  .regex(/^ExponentPushToken\[[^\]]+\]$/, 'Token con formato inválido.');

const platformSchema = z.enum(['ios', 'android', 'web']).optional().nullable();

const postSchema = z.object({
  expoPushToken: tokenSchema,
  platform: platformSchema,
});

const deleteSchema = z.object({
  expoPushToken: tokenSchema,
});

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

export async function POST(req: Request): Promise<Response> {
  const userId = await getUserIdFromAuth(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

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

  await registerDeviceToken({
    userId,
    expoPushToken: parsed.data.expoPushToken,
    platform: parsed.data.platform ?? null,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  const userId = await getUserIdFromAuth(req);
  if (!userId) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 400 },
    );
  }

  await unregisterDeviceToken(parsed.data.expoPushToken);
  return NextResponse.json({ ok: true });
}
