import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guarderias, pricingPlanFeatures } from '@/lib/db/schema';

// Parsea el primer entero del valor textual almacenado en pricing_plan_features.
// '2 / mes' → 2, '5 / mes' → 5, '✓' / '' / null → 0.
function parseLimit(value: string | null | undefined): number {
  if (!value || !value.trim()) return 0;
  const n = parseInt(value, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

// Devuelve los límites numéricos de las features pedidas para la guardería.
// Hace 2 queries: plan de la guardería + valores en pricing_plan_features.
export async function getPlanFeatureLimits(
  guarderiaId: string,
  featureIds: string[],
): Promise<Record<string, number>> {
  const defaults = Object.fromEntries(featureIds.map((id) => [id, 0]));

  const [guarderia] = await db
    .select({ plan: guarderias.plan })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  if (!guarderia) return defaults;

  return getPlanLimitsForSlug(guarderia.plan ?? 'esencial', featureIds);
}

// Igual que getPlanFeatureLimits pero cuando el planSlug ya es conocido
// (evita la query extra a guarderias).
export async function getPlanLimitsForSlug(
  planSlug: string,
  featureIds: string[],
): Promise<Record<string, number>> {
  const defaults = Object.fromEntries(featureIds.map((id) => [id, 0]));

  const rows = await db
    .select({ featureId: pricingPlanFeatures.featureId, value: pricingPlanFeatures.value })
    .from(pricingPlanFeatures)
    .where(
      and(
        eq(pricingPlanFeatures.planSlug, planSlug as 'esencial' | 'premium' | 'elite'),
        inArray(pricingPlanFeatures.featureId, featureIds),
      ),
    );

  const result = { ...defaults };
  for (const row of rows) {
    result[row.featureId] = parseLimit(row.value);
  }
  return result;
}
