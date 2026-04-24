import { NextResponse } from 'next/server';

import { runMonthlyGeneration } from '@/lib/movimientos-mensuales';

// Invocado por Vercel Cron el 1ro de cada mes (ver vercel.json).
// Genera los movimientos mensuales para los espacios ocupados de todas
// las guarderías. Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`
// si CRON_SECRET está configurado en el proyecto.
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const res = await runMonthlyGeneration();
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error('[cron/mensuales] error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    );
  }
}
