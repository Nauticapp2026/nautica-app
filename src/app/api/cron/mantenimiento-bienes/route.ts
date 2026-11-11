import { NextResponse } from 'next/server';

import { avisarMantenimientos } from '@/lib/bienes-uso/avisos';

export const dynamic = 'force-dynamic';

// Invocado una vez por día por Vercel Cron (ver vercel.json: 0 11 * * *, que son las 08:00 ART).
// Manda por mail los avisos de los planes de mantenimiento preventivo de Bienes de uso: una vez
// cuando faltan 7 días o menos y otra el día del mantenimiento.
//
// Idempotente: la tabla `bien_uso_avisos` guarda un aviso por plan, fecha y etapa, así que una
// doble corrida no repite mails (ver `lib/bienes-uso/avisos.ts`).
//
// Vercel Cron envía `Authorization: Bearer <CRON_SECRET>` si CRON_SECRET está configurado.
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // ?dryRun=1: solo informa a quién avisaría, sin mandar mails ni registrar avisos (para revisar).
    const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
    const resultado = await avisarMantenimientos({ dryRun });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[cron/mantenimiento-bienes] error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    );
  }
}
