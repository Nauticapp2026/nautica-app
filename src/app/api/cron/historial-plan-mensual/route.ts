import { NextResponse } from 'next/server';

import { runMonthlyPlanSnapshot } from '@/lib/pricing/plan-historial';

// Invocado el día 1 de cada mes por Vercel Cron (ver vercel.json: 0 3 1 * *,
// que es 00:00 ART). Inserta un row del historial por cada guardería con
// snapshot de plan/rate/espacios/monto al momento, para que el historial se
// lea como extracto mensual ("Mayo $X / Junio $Y / Julio $Z"). Idempotente
// contra doble corrida del cron en el mismo día (TZ AR).
//
// Vercel Cron envía `Authorization: Bearer <CRON_SECRET>` si CRON_SECRET
// está configurado en el proyecto.
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runMonthlyPlanSnapshot();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/historial-plan-mensual] error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    );
  }
}
