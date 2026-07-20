import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushEmbarcacionGuardada } from '@/lib/push-notifications';

export const dynamic = 'force-dynamic';

// Lo llama la app mobile (con el JWT del operario/marinero logueado) justo
// después de mover una tarea a 'guardada' desde el detalle de tarea — el
// mobile actualiza tareas.estado directo contra Supabase, sin pasar por
// ninguna server action del admin, así que necesita este puente para
// despachar el push (la campanita ya la escribió el trigger Postgres).
// Idempotente: solo manda si la fila de notificaciones todavía tiene
// push_sent_at NULL.
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
    await sendPushEmbarcacionGuardada(parsed.data.tareaId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/tareas/notify-guardada] error', err);
    // No es crítico: la campanita ya salió por el trigger. Devolvemos 200 para
    // que el mobile no reintente en loop.
    return NextResponse.json({ ok: false });
  }
}
