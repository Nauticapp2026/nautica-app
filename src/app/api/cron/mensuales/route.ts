import { NextResponse } from 'next/server';

import { runAjustesProgramados } from '@/lib/ajustes-programados';
import { runAutoEmision } from '@/lib/auto-facturacion';
import { guarderiasQueFacturanHoy } from '@/lib/movimientos-mensuales';
import { runPaywayCharges } from '@/lib/payway-cobros';

// Invocado diariamente por Vercel Cron (ver vercel.json: 0 5 * * *).
// Modelo "los cargos nacen al emitir": ya no hay un paso que genere cargos
// en cuenta corriente. Para cada guardería cuyo `diaFacturacion === hoy`:
//   1. Auto-emite por socio la factura fiscal (FA-) por los servicios
//      "Legal" y el comprobante interno (CA-) por los "Interno", computados
//      en vivo desde los contratos vigentes; los cargos en cuenta corriente
//      nacen dentro de la transacción de cada emisión.
//   2. Cobra por Payway (débito automático) a los socios con token activo —
//      corre después de la emisión, así el débito del día incluye lo recién
//      facturado.
// Ambos pasos corren sobre TODAS las guarderías que facturan hoy
// (`guarderiasQueFacturanHoy`): el día de cobro es de la guardería.
// La idempotencia es intrínseca (un contrato facturado este período deja de
// aparecer como pendiente), así que re-correr el cron el mismo día no
// duplica comprobantes.
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
    // 0. Aplicar ajustes de tarifa programados cuya fecha llegó (antes de
    //    facturar, para que el precio nuevo ya rija en la emisión).
    const ajustesProgramados = await runAjustesProgramados(now);
    // 1 y 2. Emisión (fiscal + interna) y cobro.
    const guarderiaIds = await guarderiasQueFacturanHoy(now);
    const facturas = await runAutoEmision(guarderiaIds, now);
    const cobros = await runPaywayCharges(guarderiaIds);
    return NextResponse.json({
      ok: true,
      ajustesProgramados,
      guarderiaIds,
      facturas,
      cobros,
    });
  } catch (err) {
    console.error('[cron/mensuales] error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    );
  }
}
