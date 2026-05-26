import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { guarderias, pricingPlanFeatures } from '@/lib/db/schema';

// Fallback hardcodeado para cuando la fila no existe en pricing_plan_features.
// Solo aplica si el DB no tiene el registro; si existe, el valor del DB tiene
// prioridad (incluso si es 0).
const FEATURE_DEFAULTS: Record<string, Record<string, number>> = {
  com_cerrada: { esencial: 2, premium: 2, elite: 5 },
  com_abierta: { esencial: 0, premium: 2, elite: 5 },
  nautishop_publicaciones: { esencial: 0, premium: 2, elite: 5 },
};

// Parsea el primer entero del valor textual almacenado en pricing_plan_features.
// '2 / mes' → 2, '2 publ.' → 2, '5 / mes' → 5.
// '✓' / '' / null → undefined (no hay número explícito; el llamador usa el fallback).
function parseLimit(value: string | null | undefined): number | undefined {
  if (!value || !value.trim()) return undefined;
  const n = parseInt(value, 10);
  return isNaN(n) || n < 0 ? undefined : n;
}

// Devuelve los límites numéricos de las features pedidas para la guardería.
// Hace 2 queries: plan de la guardería + valores en pricing_plan_features.
export async function getPlanFeatureLimits(
  guarderiaId: string,
  featureIds: string[],
): Promise<Record<string, number>> {
  const [guarderia] = await db
    .select({ plan: guarderias.plan })
    .from(guarderias)
    .where(eq(guarderias.id, guarderiaId))
    .limit(1);

  return getPlanLimitsForSlug(guarderia?.plan ?? 'esencial', featureIds);
}

// Igual que getPlanFeatureLimits pero cuando el planSlug ya es conocido
// (evita la query extra a guarderias).
export async function getPlanLimitsForSlug(
  planSlug: string,
  featureIds: string[],
): Promise<Record<string, number>> {
  const rows = await db
    .select({ featureId: pricingPlanFeatures.featureId, value: pricingPlanFeatures.value })
    .from(pricingPlanFeatures)
    .where(
      and(
        eq(pricingPlanFeatures.planSlug, planSlug as 'esencial' | 'premium' | 'elite'),
        inArray(pricingPlanFeatures.featureId, featureIds),
      ),
    );

  // Arranca con los defaults hardcodeados para cubrir filas ausentes en el DB.
  const result: Record<string, number> = Object.fromEntries(
    featureIds.map((id) => [id, FEATURE_DEFAULTS[id]?.[planSlug] ?? 0]),
  );

  // El valor del DB sobreescribe el default solo si es un número explícito.
  // '✓' o vacío conserva el fallback para que el admin pueda setear el label
  // sin perder el límite numérico.
  for (const row of rows) {
    const parsed = parseLimit(row.value);
    if (parsed !== undefined) {
      result[row.featureId] = parsed;
    }
  }

  return result;
}
