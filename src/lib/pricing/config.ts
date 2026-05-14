import { asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  platformSettings,
  pricingFeatures,
  pricingPlanFeatures,
  pricingPlans,
} from '@/lib/db/schema';

// Lectura compartida entre la landing pública y el panel super admin.
export async function getPricingConfig() {
  const [plans, capacitiesRow] = await Promise.all([
    db.select().from(pricingPlans).orderBy(pricingPlans.displayOrder),
    db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, 'pricing_capacities'))
      .limit(1),
  ]);

  const capacities = parseCapacities(capacitiesRow[0]?.value);

  return { plans, capacities };
}

function parseCapacities(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
}

// Strings listos para renderear como bullets en landing/onboarding/tab Plan.
// Reglas:
//   - value NULL/'' → feature no incluida → no aparece
//   - value '✓'     → solo el label
//   - otro          → '{label}: {value}' (ej "Comunicación cerrada: 2 / mes")
export type PlanFeatureLine = string;

export async function getPlanFeatures(
  planSlug: 'esencial' | 'club' | 'elite',
): Promise<PlanFeatureLine[]> {
  const rows = await db
    .select({
      label: pricingFeatures.label,
      displayOrder: pricingFeatures.displayOrder,
      value: pricingPlanFeatures.value,
    })
    .from(pricingFeatures)
    .innerJoin(pricingPlanFeatures, eq(pricingPlanFeatures.featureId, pricingFeatures.id))
    .where(eq(pricingPlanFeatures.planSlug, planSlug))
    .orderBy(asc(pricingFeatures.displayOrder));

  return rows
    .filter((r) => r.value != null && r.value.trim() !== '')
    .map((r) => {
      const v = r.value!.trim();
      return v === '✓' ? r.label : `${r.label}: ${v}`;
    });
}

export async function getAllPlanFeatures(): Promise<
  Record<'esencial' | 'club' | 'elite', PlanFeatureLine[]>
> {
  const [esencial, club, elite] = await Promise.all([
    getPlanFeatures('esencial'),
    getPlanFeatures('club'),
    getPlanFeatures('elite'),
  ]);
  return { esencial, club, elite };
}

// Para el editor del super admin: grid completo (todas las features × todos
// los planes, con grupos preservados para mostrar headers).
export type PricingFeatureRow = {
  id: string;
  groupLabel: string;
  label: string;
  displayOrder: number;
  values: { esencial: string; club: string; elite: string };
};

export async function getPricingFeaturesGrid(): Promise<PricingFeatureRow[]> {
  const [features, planFeatures] = await Promise.all([
    db.select().from(pricingFeatures).orderBy(asc(pricingFeatures.displayOrder)),
    db.select().from(pricingPlanFeatures),
  ]);

  const lookup = new Map<string, { esencial: string; club: string; elite: string }>();
  for (const f of features) {
    lookup.set(f.id, { esencial: '', club: '', elite: '' });
  }
  for (const pf of planFeatures) {
    const row = lookup.get(pf.featureId);
    if (!row) continue;
    row[pf.planSlug] = pf.value ?? '';
  }

  return features.map((f) => ({
    id: f.id,
    groupLabel: f.groupLabel,
    label: f.label,
    displayOrder: f.displayOrder,
    values: lookup.get(f.id)!,
  }));
}
