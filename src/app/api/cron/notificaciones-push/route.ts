import { NextResponse } from 'next/server';

import { processPendingNotifications } from '@/lib/push-notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Invocado por Vercel Cron cada minuto (ver vercel.json).
// Procesa hasta MAX_NOTIFICACIONES_PER_RUN pendientes de la cola
// `platform_notificaciones` y las despacha vía Expo Push Service.
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
