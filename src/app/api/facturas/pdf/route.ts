import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/lib/db';
import { facturacion } from '@/lib/db/schema';
import { regenerarPdfComprobante } from '@/lib/facturacion/pdf';

export const dynamic = 'force-dynamic';

// Lo llama la app mobile (con el JWT del socio) cuando el socio toca un
// comprobante fiscal en su perfil. El `archivo` guardado es una URL temporal de
// TusFacturas que vence — este endpoint regenera el link fresco (el server
// action `obtenerPdfFacturaAction` hace lo mismo para el admin web, pero no es
// invocable desde mobile). Solo devuelve el PDF de un comprobante del propio
// socio autenticado.
const postSchema = z.object({
  facturaId: z.string().uuid(),
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

  // El comprobante tiene que ser del socio autenticado. Traemos la guardería
  // dueña de la fila y validamos socio_id — el helper no valida permisos.
  const [row] = await db
    .select({ guarderiaId: facturacion.guarderiaId, socioId: facturacion.socioId })
    .from(facturacion)
    .where(eq(facturacion.id, parsed.data.facturaId))
    .limit(1);
  if (!row || row.socioId !== userId) {
    return NextResponse.json({ error: 'Comprobante no encontrado.' }, { status: 404 });
  }

  const result = await regenerarPdfComprobante(parsed.data.facturaId, row.guarderiaId);
  if (result.error || !result.url) {
    return NextResponse.json(
      { error: result.error ?? 'No se pudo obtener el PDF del comprobante.' },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: result.url });
}
