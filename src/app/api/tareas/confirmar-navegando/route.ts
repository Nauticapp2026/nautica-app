import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/lib/db';
import { tareas, porteria } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

// Lo llama la app mobile con el JWT del SOCIO cuando confirma "estoy navegando"
// en el flujo de marina (a los 30 min de que portería escaneó su QR). En marina
// seguridad no mueve la tarea y no hay operario en tierra, así que el socio es
// quien la pasa a 'navegando'. La RLS de `tareas` (mig 0108) no permite al socio
// hacer ese UPDATE, por eso va por este endpoint con service role, que valida
// que la tarea sea de una salida del propio socio, sea de marina y esté en
// 'preparar' antes de moverla.
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

  // La tarea tiene que ser de una salida del socio autenticado, de marina y en
  // estado 'preparar' (lista para salir). JOIN a porteria para validar el dueño.
  const [row] = await db
    .select({
      id: tareas.id,
      estado: tareas.estado,
      esMarina: tareas.esMarina,
      socioId: porteria.socioId,
    })
    .from(tareas)
    .leftJoin(porteria, eq(porteria.id, tareas.porteriaId))
    .where(eq(tareas.id, parsed.data.tareaId))
    .limit(1);

  if (!row || row.socioId !== userId) {
    return NextResponse.json({ error: 'Tarea no encontrada.' }, { status: 404 });
  }
  if (!row.esMarina) {
    return NextResponse.json(
      { error: 'Esta acción es solo para salidas de marina.' },
      { status: 409 },
    );
  }
  if (row.estado !== 'preparar') {
    // Ya la movió el marinero, o todavía no está preparada. No es un error duro:
    // devolvemos el estado actual para que el mobile refresque.
    return NextResponse.json({ ok: true, estado: row.estado });
  }

  await db
    .update(tareas)
    .set({ estado: 'navegando', updatedAt: new Date() })
    .where(and(eq(tareas.id, parsed.data.tareaId), eq(tareas.estado, 'preparar')));

  return NextResponse.json({ ok: true, estado: 'navegando' });
}
