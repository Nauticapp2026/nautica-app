import { NextResponse } from 'next/server';

import { runAutoEmision } from '@/lib/auto-facturacion';
import { runMonthlyGeneration } from '@/lib/movimientos-mensuales';

// Invocado diariamente por Vercel Cron (ver vercel.json: 0 5 * * *).
// Para cada guardería cuyo `diaFacturacion === hoy`:
//   1. Genera el movimiento mensual de cada espacio asignado.
//   2. Auto-emite factura para cada socio con pendientes que ya tenga
//      al menos una factura emitida (regla: primera factura es manual).
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
    const now = new Date();
    const movs = await runMonthlyGeneration(now);
    const facturas = await runAutoEmision(movs.guarderiaIds, now);
    return NextResponse.json({ ok: true, movimientos: movs, facturas });
  } catch (err) {
    console.error('[cron/mensuales] error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    );
  }
}
