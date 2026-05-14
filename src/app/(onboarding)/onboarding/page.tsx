import { asc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pricingPlans } from '@/lib/db/schema';
import { getAllPlanFeatures } from '@/lib/pricing/config';

import { OnboardingClient } from './onboarding-client';

export const dynamic = 'force-dynamic';

function formatRate(rate: number) {
  return `$${rate.toLocaleString('es-AR')} / lugar / mes`;
}

export default async function OnboardingPage() {
  const [plans, featuresByPlan] = await Promise.all([
    db
      .select({ slug: pricingPlans.slug, name: pricingPlans.name, rate: pricingPlans.rate })
      .from(pricingPlans)
      .orderBy(asc(pricingPlans.displayOrder)),
    getAllPlanFeatures(),
  ]);

  const planInfo = {
    esencial: { label: 'ESENCIAL', precio: '' },
    club: { label: 'CLUB', precio: '' },
    elite: { label: 'ÉLITE', precio: '' },
  };

  for (const p of plans) {
    if (p.slug in planInfo) {
      planInfo[p.slug as 'esencial' | 'club' | 'elite'] = {
        label: p.name,
        precio: formatRate(p.rate),
      };
    }
  }

  return <OnboardingClient planInfo={planInfo} featuresByPlan={featuresByPlan} />;
}
