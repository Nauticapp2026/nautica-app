import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pricingPlans, platformSettings } from '@/lib/db/schema';

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
