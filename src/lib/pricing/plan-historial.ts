import { and, eq, gte, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { espacios, guarderias, guarderiaPlanHistorial, pricingPlans } from '@/lib/db/schema';

type PlanSlug = 'esencial' | 'club' | 'elite';

// Inserta un row del historial con snapshot del rate vigente y la cantidad
// de espacios actuales. Se llama tanto desde el onboarding (al elegir el
// primer plan) como desde el cambio de plan del admin. Si el plan no existe
// en pricing_plans o algo falla, no rompe el flujo principal — loguea y
// retorna sin escribir.
export async function recordPlanChange(input: {
  guarderiaId: string;
  planSlug: PlanSlug;
  createdBy?: string | null;
}): Promise<void> {
  try {
    const [plan] = await db
      .select({ rate: pricingPlans.rate })
      .from(pricingPlans)
      .where(eq(pricingPlans.slug, input.planSlug))
      .limit(1);

    if (!plan) {
      console.warn('[recordPlanChange] plan no encontrado en pricing_plans', input.planSlug);
      return;
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
      .from(espacios)
      .where(eq(espacios.guarderiaId, input.guarderiaId));

    const espaciosCount = count ?? 0;
    const montoMensual = plan.rate * espaciosCount;

    await db.insert(guarderiaPlanHistorial).values({
      guarderiaId: input.guarderiaId,
      planSlug: input.planSlug,
      rate: plan.rate,
      espacios: espaciosCount,
      montoMensual,
      createdBy: input.createdBy ?? null,
    });
  } catch (err) {
    console.error('[recordPlanChange] no se pudo grabar el historial', err);
  }
}

// Para el cron mensual: inserta un row por cada guardería con snapshot del
// plan + rate + espacios + monto. Idempotente: si la guardería ya tiene un
// row de hoy (en TZ AR), salta esa.
//
// Decisión (2026-05-14): siempre insertar el día 1 aunque no haya cambios,
// para que el historial se lea como "extracto mensual" — Mayo $X / Junio $Y.
export type MonthlySnapshotResult = {
  insertados: number;
  saltados: number;
  errores: { guarderiaId: string; mensaje: string }[];
};

export async function runMonthlyPlanSnapshot(): Promise<MonthlySnapshotResult> {
  const guarderiasRows = await db
    .select({ id: guarderias.id, plan: guarderias.plan })
    .from(guarderias);

  // Rango del día corriente en TZ AR. Si el cron corre a las 03:00 UTC del día 1,
  // eso es 00:00 ART del día 1. Para detectar "ya hubo un row hoy", convertimos
  // a la fecha calendario AR.
  const hoyAR = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }),
  );
  const inicioDia = new Date(hoyAR.getFullYear(), hoyAR.getMonth(), hoyAR.getDate());
  const finDia = new Date(inicioDia);
  finDia.setDate(finDia.getDate() + 1);

  // Cargamos pricing_plans y count de espacios por guardería en queries
  // agrupadas, una vez, para no pegar N veces a la DB.
  const [planes, espaciosPorGuarderia] = await Promise.all([
    db.select({ slug: pricingPlans.slug, rate: pricingPlans.rate }).from(pricingPlans),
    db
      .select({
        guarderiaId: espacios.guarderiaId,
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(espacios)
      .groupBy(espacios.guarderiaId),
  ]);

  const rateByPlan = new Map(planes.map((p) => [p.slug, p.rate]));
  const espaciosByGuarderia = new Map(espaciosPorGuarderia.map((r) => [r.guarderiaId, r.count]));

  const result: MonthlySnapshotResult = { insertados: 0, saltados: 0, errores: [] };

  for (const g of guarderiasRows) {
    try {
      if (!g.plan) {
        result.saltados++;
        continue;
      }

      // Idempotencia: si ya hubo un row del día corriente para esta guardería, skip.
      const yaHay = await db
        .select({ id: guarderiaPlanHistorial.id })
        .from(guarderiaPlanHistorial)
        .where(
          and(
            eq(guarderiaPlanHistorial.guarderiaId, g.id),
            gte(guarderiaPlanHistorial.efectivoDesde, inicioDia),
            lt(guarderiaPlanHistorial.efectivoDesde, finDia),
          ),
        )
        .limit(1);

      if (yaHay.length > 0) {
        result.saltados++;
        continue;
      }

      const rate = rateByPlan.get(g.plan);
      if (rate == null) {
        result.errores.push({
          guarderiaId: g.id,
          mensaje: `plan ${g.plan} no está en pricing_plans`,
        });
        continue;
      }

      const espaciosCount = espaciosByGuarderia.get(g.id) ?? 0;
      const montoMensual = rate * espaciosCount;

      await db.insert(guarderiaPlanHistorial).values({
        guarderiaId: g.id,
        planSlug: g.plan,
        rate,
        espacios: espaciosCount,
        montoMensual,
      });

      result.insertados++;
    } catch (err) {
      result.errores.push({
        guarderiaId: g.id,
        mensaje: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }

  return result;
}
