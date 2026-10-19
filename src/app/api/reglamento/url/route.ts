import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { memberships, reglamentosClub } from '@/lib/db/schema';
import { BUCKET_REGLAMENTO } from '@/lib/reglamento';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Lo llama la app mobile (con el JWT del socio) cuando toca "Leer el reglamento".
// El PDF vive en un bucket privado y las policies del bucket no se versionan en el
// repo, así que en vez de abrirle el bucket al socio, este endpoint valida que sea
// miembro ACTIVO del club dueño del reglamento y le devuelve un link firmado de una
// hora. Solo lectura: no muta nada.
const postSchema = z.object({
  reglamentoId: z.string().uuid('Reglamento inválido.'),
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

  const [reglamento] = await db
    .select({ guarderiaId: reglamentosClub.guarderiaId, archivoPath: reglamentosClub.archivoPath })
    .from(reglamentosClub)
    .where(eq(reglamentosClub.id, parsed.data.reglamentoId))
    .limit(1);

  // Misma respuesta si no existe o si es de otro club: no se revela cuál de las dos.
  if (!reglamento) {
    return NextResponse.json({ error: 'Reglamento no encontrado.' }, { status: 404 });
  }
  const [miembro] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.guarderiaId, reglamento.guarderiaId),
        eq(memberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!miembro) {
    return NextResponse.json({ error: 'Reglamento no encontrado.' }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET_REGLAMENTO)
    .createSignedUrl(reglamento.archivoPath, 60 * 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'No se pudo generar el enlace del PDF.' }, { status: 502 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
