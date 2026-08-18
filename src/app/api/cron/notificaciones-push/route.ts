import { NextResponse } from 'next/server';

import { processPendingNotifications } from '@/lib/push-notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Invocado por Vercel Cron tres veces por día — 11/17/23 UTC, o sea 08:00,
// 14:00 y 20:00 en Argentina (ver vercel.json). Esas tres corridas son los
// turnos mañana / tarde / noche que ofrece el super admin al programar un
// envío, y de paso reintentan lo que quedó pendiente por un error transitorio.
//
// Procesa hasta MAX_NOTIFICACIONES_PER_RUN pendientes de la cola
// `platform_notificaciones` cuyo horario ya llegó y las despacha vía Expo Push
// Service. Las programadas a futuro las saltea processPendingNotifications.
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await processPendingNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/notificaciones-push] error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    );
  }
}
