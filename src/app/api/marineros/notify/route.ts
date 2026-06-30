import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { notifyMarinerosPushForPorteria } from '@/lib/push-notifications';

export const dynamic = 'force-dynamic';

// Lo llama la app mobile (con el JWT del usuario) justo después de un evento de
// salida en una marina: programar, cancelar, o el primer escaneo de QR. Despacha
// el PUSH a los marineros del área (la campanita ya la escribió el trigger
// Postgres). Es idempotente: solo manda las notificaciones marina_* de esa
// portería que todavía no se pushearon (push_sent_at NULL).
const postSchema = z.object({
  porteriaId: z.string().uuid(),
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

  try {
    const result = await notifyMarinerosPushForPorteria(parsed.data.porteriaId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/marineros/notify] error', err);
    // No es crítico: la campanita ya salió por el trigger. Devolvemos 200 para
    // que el mobile no reintente en loop.
    return NextResponse.json({ ok: false, sent: 0 });
  }
}
