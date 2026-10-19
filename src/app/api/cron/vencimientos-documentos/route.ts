import { NextResponse } from 'next/server';

import { avisarVencimientosDocumentos } from '@/lib/documentacion-vencimientos';

export const dynamic = 'force-dynamic';

// Invocado una vez por día por Vercel Cron (ver vercel.json: 0 11 * * *, que son las
// 08:00 ART). Avisa a los socios cuyo seguro o certificado náutico vence en los próximos
// 7 días: deja la notificación en la campanita de la app y manda el push.
//
// Idempotente: hay un índice único en `notificaciones` (mig 0171) por usuario, documento y
// fecha de vencimiento, así que una doble corrida no repite avisos.
//
// Vercel Cron envía `Authorization: Bearer <CRON_SECRET>` si CRON_SECRET está
// configurado en el proyecto.
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const resultado = await avisarVencimientosDocumentos();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[cron/vencimientos-documentos] error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    );
  }
}
