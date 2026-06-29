import { NextResponse } from 'next/server';

import { runAjustesProgramados } from '@/lib/ajustes-programados';
import { runAutoEmision } from '@/lib/auto-facturacion';
import { limpiarTareasGuardadas } from '@/lib/limpiar-tareas';
import { guarderiasQueFacturanHoy, runMonthlyGeneration } from '@/lib/movimientos-mensuales';
import { runPaywayCharges } from '@/lib/payway-cobros';

// Invocado diariamente por Vercel Cron (ver vercel.json: 0 5 * * *).
// Para cada guardería cuyo `diaFacturacion === hoy`:
//   1. Genera el movimiento mensual de cada espacio asignado.
//   2. Auto-emite factura para cada socio con pendientes que ya tenga
//      al menos una factura emitida (regla: primera factura es manual).
//   3. Cobra por Payway (débito automático) a los socios con token activo.
// Los pasos 2 y 3 corren sobre TODAS las guarderías que facturan hoy
// (`guarderiasQueFacturanHoy`), no solo las que tienen espacios ocupados:
// el día de cobro es de la guardería, no del espacio.
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
    //    generar movimientos y facturar, para que el precio nuevo ya rija).
    const ajustesProgramados = await runAjustesProgramados(now);
    // 1. Generar movimientos mensuales de espacios ocupados.
    const movs = await runMonthlyGeneration(now);
    // 2 y 3. Emisión y cobro sobre TODAS las guarderías que facturan hoy
    //        (no solo las que tienen espacios ocupados).
    const guarderiaIds = await guarderiasQueFacturanHoy(now);
    const facturas = await runAutoEmision(guarderiaIds, now);
    const cobros = await runPaywayCharges(guarderiaIds);
    // Limpieza: borrar tareas 'guardada' con más de 24 hs.
    const tareasBorradas = await limpiarTareasGuardadas(now);
    return NextResponse.json({
      ok: true,
      ajustesProgramados,
      movimientos: movs,
      guarderiaIds,
      facturas,
      cobros,
      tareasBorradas,
    });
  } catch (err) {
    console.error('[cron/mensuales] error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    );
  }
}
