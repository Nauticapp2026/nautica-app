import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushEmbarcacionPreparada } from '@/lib/push-notifications';

export const dynamic = 'force-dynamic';

// Lo llama la app mobile (con el JWT del marinero) justo después de mover una
// tarea de marina a 'preparar' (marcarla "Preparada") desde el detalle de tarea.
// El mobile actualiza tareas.estado directo contra Supabase; este puente despacha
// el push al socio (la campanita ya la escribió el trigger Postgres). Idempotente
// vía push_sent_at.
const postSchema = z.object({
  tareaId: z.string().uuid(),
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
    await sendPushEmbarcacionPreparada(parsed.data.tareaId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/tareas/notify-preparada] error', err);
    // No es crítico: la campanita ya salió por el trigger. Devolvemos 200 para
    // que el mobile no reintente en loop.
    return NextResponse.json({ ok: false });
  }
}
