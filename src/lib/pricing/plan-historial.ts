import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { espacios, guarderiaPlanHistorial, pricingPlans } from '@/lib/db/schema';

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
